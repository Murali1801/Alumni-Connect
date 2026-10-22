import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Role } from '@/lib/session';
import { avatarUrl, getMemberCards, type MemberCard } from '@/lib/network';

/* ------------------------------------------------------------------ */
/* Member profiles: what any signed-in member sees when they open one  */
/* ------------------------------------------------------------------ */

/** A work or education entry the member wrote themselves. */
export type ExperienceEntry = {
  id: string;
  kind: 'work' | 'education';
  title: string;
  organisation: string;
  location: string | null;
  start_date: string;
  end_date: string | null;
  description: string | null;
};

/** The raw values behind the profile, for its owner's in-place editors. */
export type EditableProfile = {
  full_name: string;
  location: string;
  bio: string;
  skills: string[];
  // Alumni
  designation: string;
  company: { id: string; name: string } | null;
  industry: string;
  experience_years: number | null;
  mentorship_available: boolean;
  mock_interview_available: boolean;
  referral_available: boolean;
  internship_available: boolean;
  // Students
  branch: string;
  batch_year: number | null;
  target_role: string;
  target_company: string;
  target_industry: string;
};

export type MemberProfile = {
  id: string;
  role: Role;
  full_name: string;
  joined_at: string;
  avatar_url: string | null;
  cover_url: string | null;
  headline: string;
  location: string | null;
  branch: string | null;
  batch_year: number | null;
  bio: string | null;
  skills: string[];
  /** Alumni only. */
  record_id: string | null;
  verified: boolean;
  /** From the profile and the college record (alumni): current job and first job. */
  experience: { title: string; company: string | null; detail: string | null }[];
  /** Entries the member wrote themselves. */
  entries: ExperienceEntry[];
  availability: string[];
  /** Students only. */
  goals: { label: string; value: string }[];
  /** Endorsements per skill, and whether the viewer gave one. */
  endorsements: Record<string, { count: number; mine: boolean }>;
  edit: EditableProfile;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

async function entriesFor(userId: string): Promise<ExperienceEntry[]> {
  const db = createAdminClient();
  const { data } = await db
    .from('member_experience')
    .select('id, kind, title, organisation, location, start_date, end_date, description')
    .eq('user_id', userId)
    .order('end_date', { ascending: false, nullsFirst: true })
    .order('start_date', { ascending: false })
    .limit(50);
  return (data ?? []) as ExperienceEntry[];
}

async function endorsementsFor(userId: string, viewerId?: string): Promise<MemberProfile['endorsements']> {
  const db = createAdminClient();
  const { data } = await db.from('skill_endorsements').select('skill, endorser_id').eq('endorsee_id', userId).limit(2000);
  const out: MemberProfile['endorsements'] = {};
  for (const e of data ?? []) {
    const k = e.skill.toLowerCase();
    out[k] ??= { count: 0, mine: false };
    out[k].count++;
    if (viewerId && e.endorser_id === viewerId) out[k].mine = true;
  }
  return out;
}

/**
 * One member's public profile. Contact details, claim tokens and resumes are
 * never read here: the profile is visible to every signed-in member.
 * `viewerId` marks which skills the viewer has endorsed.
 */
export async function getMemberProfile(userId: string, viewerId?: string): Promise<MemberProfile | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const db = createAdminClient();
  const { data: user } = await db
    .from('users')
    .select('id, role, full_name, created_at, avatar_path, cover_path')
    .eq('id', userId)
    .maybeSingle();
  if (!user) return null;

  const [entries, endorsements] = await Promise.all([entriesFor(userId), endorsementsFor(userId, viewerId)]);

  const blankEdit: EditableProfile = {
    full_name: user.full_name,
    location: '',
    bio: '',
    skills: [],
    designation: '',
    company: null,
    industry: '',
    experience_years: null,
    mentorship_available: false,
    mock_interview_available: false,
    referral_available: false,
    internship_available: false,
    branch: '',
    batch_year: null,
    target_role: '',
    target_company: '',
    target_industry: '',
  };

  const base = {
    id: user.id,
    role: user.role as Role,
    full_name: user.full_name,
    joined_at: user.created_at,
    avatar_url: avatarUrl(user.avatar_path),
    cover_url: avatarUrl(user.cover_path),
    location: null,
    branch: null,
    batch_year: null,
    bio: null,
    skills: [],
    record_id: null,
    verified: false,
    experience: [],
    entries,
    availability: [],
    goals: [],
    endorsements,
    edit: blankEdit,
  };

  if (user.role === 'alumni') {
    const { data: p } = await db
      .from('alumni_profiles')
      .select(
        'designation, industry, location, experience_years, skills, bio, mentorship_available, mock_interview_available, referral_available, internship_available, current_company:companies!current_company_id(id, name), record:alumni_records!record_id(id, branch, batch_year, city, claim_status, first_role, first_company:companies!first_company_id(name))'
      )
      .eq('user_id', userId)
      .maybeSingle();
    const record: any = one((p as any)?.record);
    const currentCompany = one((p as any)?.current_company as any) as { id: string; name: string } | null;
    const company = currentCompany?.name ?? null;
    const firstCompany = one(record?.first_company)?.name ?? null;
    const work = [p?.designation, company].filter(Boolean).join(' at ');
    const cohort = record ? `${record.branch} · Class of ${record.batch_year}` : null;

    const experience: MemberProfile['experience'] = [];
    if (p?.designation || company) {
      experience.push({
        title: p?.designation ?? 'Current role',
        company,
        detail: [p?.industry, p?.experience_years ? `${p.experience_years} years since graduating` : null].filter(Boolean).join(' · ') || null,
      });
    }
    if (record?.first_role || firstCompany) {
      if (!(firstCompany && firstCompany === company && !record?.first_role)) {
        experience.push({ title: record?.first_role ?? 'First job', company: firstCompany, detail: 'First job after SJCEM, from the college placement record' });
      }
    }

    return {
      ...base,
      headline: [work || 'Alumnus', cohort].filter(Boolean).join(' · '),
      location: p?.location ?? record?.city ?? null,
      branch: record?.branch ?? null,
      batch_year: record?.batch_year ?? null,
      bio: p?.bio ?? null,
      skills: p?.skills ?? [],
      record_id: record?.id ?? null,
      verified: record?.claim_status === 'verified',
      experience,
      availability: [
        p?.mentorship_available && 'Mentorship',
        p?.mock_interview_available && 'Mock interviews',
        p?.referral_available && 'Referrals',
        p?.internship_available && 'Internships',
      ].filter(Boolean) as string[],
      edit: {
        ...blankEdit,
        location: p?.location ?? '',
        bio: p?.bio ?? '',
        skills: p?.skills ?? [],
        designation: p?.designation ?? '',
        company: currentCompany,
        industry: p?.industry ?? '',
        experience_years: p?.experience_years ?? null,
        mentorship_available: !!p?.mentorship_available,
        mock_interview_available: !!p?.mock_interview_available,
        referral_available: !!p?.referral_available,
        internship_available: !!p?.internship_available,
        branch: record?.branch ?? '',
        batch_year: record?.batch_year ?? null,
      },
    };
  }

  if (user.role === 'student') {
    const { data: s } = await db
      .from('student_profiles')
      .select('branch, batch_year, skills, target_role, target_company, target_industry, location_pref, bio')
      .eq('user_id', userId)
      .maybeSingle();
    return {
      ...base,
      headline: s?.target_role
        ? `Student · ${s.branch} · Class of ${s.batch_year} · Aspiring ${s.target_role}`
        : s
          ? `Student · ${s.branch} · Class of ${s.batch_year}`
          : 'Student',
      location: s?.location_pref ?? null,
      branch: s?.branch ?? null,
      batch_year: s?.batch_year ?? null,
      bio: s?.bio ?? null,
      skills: s?.skills ?? [],
      goals: [
        s?.target_role && { label: 'Target role', value: s.target_role },
        s?.target_company && { label: 'Target company', value: s.target_company },
        s?.target_industry && { label: 'Industry', value: s.target_industry },
      ].filter(Boolean) as MemberProfile['goals'],
      edit: {
        ...blankEdit,
        location: s?.location_pref ?? '',
        bio: s?.bio ?? '',
        skills: s?.skills ?? [],
        branch: s?.branch ?? '',
        batch_year: s?.batch_year ?? null,
        target_role: s?.target_role ?? '',
        target_company: s?.target_company ?? '',
        target_industry: s?.target_industry ?? '',
      },
    };
  }

  return { ...base, headline: 'AlumniBridge team' };
}

/** Note that `viewerId` looked at `viewedId`'s profile today (once per day). */
export async function recordProfileView(viewerId: string, viewedId: string): Promise<void> {
  if (viewerId === viewedId) return;
  const db = createAdminClient();
  await db
    .from('profile_views')
    .upsert({ viewer_id: viewerId, viewed_id: viewedId }, { onConflict: 'viewer_id,viewed_id,viewed_on', ignoreDuplicates: true });
}

/** Who viewed the member's profile in the last 90 days: total and the most recent people. */
export async function getProfileViews(userId: string, limit = 8): Promise<{ total: number; recent: (MemberCard & { viewed_on: string })[] }> {
  const db = createAdminClient();
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 10);
  const { data } = await db
    .from('profile_views')
    .select('viewer_id, viewed_on')
    .eq('viewed_id', userId)
    .gte('viewed_on', since)
    .order('viewed_on', { ascending: false })
    .limit(500);
  const rows = data ?? [];
  const latest = new Map<string, string>();
  for (const r of rows) if (!latest.has(r.viewer_id)) latest.set(r.viewer_id, r.viewed_on);
  const cards = await getMemberCards([...latest.keys()].slice(0, limit));
  return { total: latest.size, recent: cards.map((c) => ({ ...c, viewed_on: latest.get(c.id)! })) };
}
