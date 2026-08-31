import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { scoreMatch, type MatchResult } from '@/lib/matching';

/* ------------------------------------------------------------------ */
/* Shared row shapes                                                   */
/* ------------------------------------------------------------------ */

export type AlumniProfileRow = {
  user_id: string;
  current_company_id: string | null;
  designation: string | null;
  industry: string | null;
  location: string | null;
  experience_years: number | null;
  skills: string[] | null;
  linkedin_url: string | null;
  bio: string | null;
  mentorship_available: boolean;
  mock_interview_available: boolean;
  referral_available: boolean;
  internship_available: boolean;
  updated_at: string | null;
  current_company?: { id: string; name: string } | null;
};

export type AlumniRow = {
  id: string;
  full_name: string;
  branch: string;
  batch_year: number;
  city: string | null;
  first_company_id: string | null;
  first_role: string | null;
  first_ctc_lpa: number | null;
  higher_ed_raw: string | null;
  claim_status: 'unclaimed' | 'claimed' | 'verified' | 'rejected';
  claimed_at?: string | null;
  alumni_profiles: AlumniProfileRow | null;
  first_company?: { id: string; name: string } | null;
};

export type StudentProfileRow = {
  user_id: string;
  branch: string;
  batch_year: number;
  skills: string[];
  target_role: string | null;
  target_company: string | null;
  target_industry: string | null;
  location_pref: string | null;
  resume_url: string | null;
  updated_at: string | null;
};

/**
 * Columns safe to send to a client. `contact_email`, `contact_mobile` and
 * `claim_token` are deliberately absent — they are claim-invite only.
 */
const ALUMNI_PUBLIC_COLUMNS = `
  id, full_name, branch, batch_year, city, first_company_id, first_role,
  first_ctc_lpa, higher_ed_raw, claim_status, claimed_at,
  first_company:companies!first_company_id ( id, name ),
  alumni_profiles (
    user_id, current_company_id, designation, industry, location, experience_years,
    skills, linkedin_url, bio, mentorship_available, mock_interview_available,
    referral_available, internship_available, updated_at,
    current_company:companies!current_company_id ( id, name )
  )
`;

/** Supabase returns embedded to-one relations as arrays in some shapes. */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function normaliseAlumni(row: any): AlumniRow {
  const profile = one<AlumniProfileRow>(row.alumni_profiles);
  return {
    ...row,
    first_company: one(row.first_company),
    alumni_profiles: profile ? { ...profile, current_company: one(profile.current_company) } : null,
  };
}

/* ------------------------------------------------------------------ */
/* Directory                                                           */
/* ------------------------------------------------------------------ */

export type DirectoryFilters = {
  q?: string;
  branch?: string;
  batch?: string;
  availability?: string; // mentorship | mock_interview | internship | referral
  status?: string; // any | claimed | unclaimed
  sort?: string; // match | recent | name | batch
  page?: number;
  pageSize?: number;
};

export type DirectoryItem = { record: AlumniRow; match: MatchResult };

export type DirectoryResult = {
  items: DirectoryItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

export async function getDirectory(
  filters: DirectoryFilters,
  student: StudentProfileRow | null
): Promise<DirectoryResult> {
  const db = createAdminClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(60, Math.max(6, filters.pageSize ?? 12));

  let query = db.from('alumni_records').select(ALUMNI_PUBLIC_COLUMNS, { count: 'exact' });

  if (filters.q) {
    const term = filters.q.replace(/[%,()]/g, ' ').trim();
    if (term) query = query.ilike('full_name', `%${term}%`);
  }
  if (filters.branch && filters.branch !== 'all') query = query.eq('branch', filters.branch);
  if (filters.batch && filters.batch !== 'all') query = query.eq('batch_year', Number(filters.batch));

  if (filters.status === 'claimed') {
    query = query.in('claim_status', ['claimed', 'verified']);
  } else if (filters.status === 'unclaimed') {
    query = query.eq('claim_status', 'unclaimed');
  }

  // Availability is a property of the claimed profile, so it implies a claim.
  if (filters.availability && filters.availability !== 'all') {
    query = query
      .in('claim_status', ['claimed', 'verified'])
      .not('alumni_profiles', 'is', null)
      .eq(`alumni_profiles.${filters.availability}_available`, true);
  }

  // Claimed profiles first, then the requested ordering. Match-ranking is
  // applied within the page after scoring, since the score is computed in app
  // code rather than in SQL.
  switch (filters.sort) {
    case 'name':
      query = query.order('full_name', { ascending: true });
      break;
    case 'batch':
      query = query.order('batch_year', { ascending: false }).order('full_name');
      break;
    case 'recent':
      query = query.order('claimed_at', { ascending: false, nullsFirst: false }).order('full_name');
      break;
    default:
      query = query.order('claim_status', { ascending: true }).order('batch_year', { ascending: false });
  }

  const from = (page - 1) * pageSize;
  const { data, count, error } = await query.range(from, from + pageSize - 1);
  if (error) throw new Error(`Directory query failed: ${error.message}`);

  let items: DirectoryItem[] = (data ?? []).map((raw) => {
    const record = normaliseAlumni(raw);
    const match = student
      ? scoreMatch(student, record, 'mentorship')
      : {
          score: 0,
          signals: [],
          matchable: record.claim_status !== 'unclaimed',
          fallbackReason: 'Complete your profile to see match scores.',
        };
    return { record, match };
  });

  if (!filters.sort || filters.sort === 'match') {
    items = items.sort((a, b) => {
      if (a.match.matchable !== b.match.matchable) return a.match.matchable ? -1 : 1;
      return b.match.score - a.match.score;
    });
  }

  const total = count ?? 0;
  return { items, total, page, pageSize, pageCount: Math.max(1, Math.ceil(total / pageSize)) };
}

export async function getAlumniRecord(id: string): Promise<AlumniRow | null> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('alumni_records')
    .select(ALUMNI_PUBLIC_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return normaliseAlumni(data);
}

/** Resolve a claimed alumnus' record from their `users.id`. */
export async function getAlumniRecordForUser(userId: string): Promise<AlumniRow | null> {
  const db = createAdminClient();
  const { data } = await db
    .from('alumni_records')
    .select(ALUMNI_PUBLIC_COLUMNS)
    .eq('claimed_by', userId)
    .maybeSingle();
  if (!data) return null;
  return normaliseAlumni(data);
}

/* ------------------------------------------------------------------ */
/* Facets — distinct branches and batches for the filter bar           */
/* ------------------------------------------------------------------ */

export type DirectoryFacets = { branches: string[]; batches: number[] };

export async function getDirectoryFacets(): Promise<DirectoryFacets> {
  const db = createAdminClient();
  const { data } = await db.rpc('directory_facets').maybeSingle();
  if (data && (data as any).branches) {
    return { branches: (data as any).branches, batches: (data as any).batches };
  }

  // No RPC installed — derive from a bounded scan. Branch/batch cardinality is
  // small (single digits), so a sampled scan gives the same answer as a full one.
  const { data: rows } = await db
    .from('alumni_records')
    .select('branch, batch_year')
    .order('batch_year', { ascending: false })
    .limit(5000);

  const branches = new Set<string>();
  const batches = new Set<number>();
  for (const r of rows ?? []) {
    if (r.branch) branches.add(r.branch);
    if (r.batch_year) batches.add(r.batch_year);
  }
  return {
    branches: [...branches].sort(),
    batches: [...batches].sort((a, b) => b - a),
  };
}

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

export async function getStudentProfile(userId: string): Promise<StudentProfileRow | null> {
  const db = createAdminClient();
  const { data } = await db.from('student_profiles').select('*').eq('user_id', userId).maybeSingle();
  return (data as StudentProfileRow) ?? null;
}

export async function getAlumniProfile(userId: string) {
  const db = createAdminClient();
  const { data } = await db
    .from('alumni_profiles')
    .select('*, current_company:companies!current_company_id(id, name)')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data) return null;
  return { ...data, current_company: one((data as any).current_company) };
}

/* ------------------------------------------------------------------ */
/* Requests                                                            */
/* ------------------------------------------------------------------ */

export type RequestRow = {
  id: string;
  student_id: string;
  alumni_id: string;
  type: 'mentorship' | 'mock_interview' | 'internship' | 'referral';
  message: string;
  status: 'pending' | 'accepted' | 'declined' | 'closed';
  match_score: number | null;
  response_note: string | null;
  created_at: string;
  responded_at: string | null;
  student: { id: string; full_name: string; email: string } | null;
  alumni: { id: string; full_name: string; email: string } | null;
};

const REQUEST_COLUMNS = `
  id, student_id, alumni_id, type, message, status, match_score, response_note,
  created_at, responded_at,
  student:users!requests_student_id_fkey ( id, full_name, email ),
  alumni:users!requests_alumni_id_fkey ( id, full_name, email )
`;

export async function getRequestsFor(
  userId: string,
  role: 'student' | 'alumni'
): Promise<RequestRow[]> {
  const db = createAdminClient();
  const column = role === 'student' ? 'student_id' : 'alumni_id';
  const { data, error } = await db
    .from('requests')
    .select(REQUEST_COLUMNS)
    .eq(column, userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Requests query failed: ${error.message}`);
  return (data ?? []).map((r: any) => ({
    ...r,
    student: one(r.student),
    alumni: one(r.alumni),
  }));
}

export async function getAllRequests(limit = 200): Promise<RequestRow[]> {
  const db = createAdminClient();
  const { data } = await db
    .from('requests')
    .select(REQUEST_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(limit);
  return (data ?? []).map((r: any) => ({ ...r, student: one(r.student), alumni: one(r.alumni) }));
}

/* ------------------------------------------------------------------ */
/* Opportunities                                                       */
/* ------------------------------------------------------------------ */

export type OpportunityRow = {
  id: string;
  posted_by: string;
  type: 'internship' | 'job';
  title: string;
  description: string;
  company_id: string | null;
  location: string | null;
  target_skills: string[];
  application_link: string | null;
  is_open: boolean;
  created_at: string;
  company: { id: string; name: string } | null;
  poster: { id: string; full_name: string } | null;
};

const OPPORTUNITY_COLUMNS = `
  id, posted_by, type, title, description, company_id, location, target_skills,
  application_link, is_open, created_at,
  company:companies!company_id ( id, name ),
  poster:users!posted_by ( id, full_name )
`;

export async function getOpportunities(opts: {
  openOnly?: boolean;
  postedBy?: string;
  type?: string;
  q?: string;
  limit?: number;
} = {}): Promise<OpportunityRow[]> {
  const db = createAdminClient();
  let query = db.from('opportunities').select(OPPORTUNITY_COLUMNS).order('created_at', { ascending: false });
  if (opts.openOnly !== false && !opts.postedBy) query = query.eq('is_open', true);
  if (opts.postedBy) query = query.eq('posted_by', opts.postedBy);
  if (opts.type && opts.type !== 'all') query = query.eq('type', opts.type);
  if (opts.q) query = query.ilike('title', `%${opts.q.replace(/[%,()]/g, ' ')}%`);
  const { data } = await query.limit(opts.limit ?? 100);
  return (data ?? []).map((o: any) => ({
    ...o,
    company: one(o.company),
    poster: one(o.poster),
  }));
}

/* ------------------------------------------------------------------ */
/* Counting helper — exact counts without pulling rows                 */
/* ------------------------------------------------------------------ */

export async function countRows(
  table: string,
  build?: (q: any) => any
): Promise<number> {
  const db = createAdminClient();
  let q = db.from(table).select('*', { count: 'exact', head: true });
  if (build) q = build(q);
  const { count } = await q;
  return count ?? 0;
}
