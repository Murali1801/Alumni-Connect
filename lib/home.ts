import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { listCallsForUser, type CallSession } from '@/lib/calls';
import { upcomingOf, profileStrength } from '@/lib/dashboard';
import { getAlumniProfile, getAlumniRecordForUser, getDirectory, getStudentProfile } from '@/lib/queries';
import { countPostsBy } from '@/lib/posts';
import { avatarUrl, countConnections, countPendingInvitations, peopleYouMayKnow } from '@/lib/network';
import type { SessionUser } from '@/lib/session';

/* ------------------------------------------------------------------ */
/* Home page: the profile card and the right-hand rail                 */
/* ------------------------------------------------------------------ */

export type HomeStat = { label: string; value: number; href: string };

export type HomePerson = {
  key: string;
  name: string;
  detail: string;
  href: string | null;
  /** A short reason, e.g. "Match 72" or "3 mutual connections". */
  note: string | null;
  /** Show a Connect button for this member (their user id). */
  connectId?: string;
  avatar_url?: string | null;
};

export type HomeOpportunity = {
  id: string;
  title: string;
  type: string;
  company: string | null;
  location: string | null;
  created_at: string;
};

export type HomeContext = {
  headline: string;
  avatar_url: string | null;
  cover_url: string | null;
  location: string | null;
  /** The viewer's own profile page, as others see it. */
  selfHref: string;
  /** Where the viewer edits their profile. */
  profileHref: string;
  profileStrength: number | null;
  stats: HomeStat[];
  people: { title: string; items: HomePerson[]; moreHref: string };
  opportunities: HomeOpportunity[];
  nextSession: CallSession | null;
};

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

async function openOpportunities(): Promise<HomeOpportunity[]> {
  const db = createAdminClient();
  const { data } = await db
    .from('opportunities')
    .select('id, title, type, location, created_at, company:companies!company_id(name)')
    .eq('is_open', true)
    .order('created_at', { ascending: false })
    .limit(4);
  return (data ?? []).map((o: any) => ({ ...o, company: one(o.company)?.name ?? null }));
}

/** Claimed alumni from the same branch and nearby batches, for "people you may know". */
async function nearbyAlumni(
  userId: string,
  branch: string | null,
  batch: number | null,
  hrefFor: (row: { id: string; user_id: string }) => string | null
) {
  const db = createAdminClient();
  let query = db
    .from('alumni_directory')
    .select('id, full_name, branch, batch_year, designation, user_id, current_company_id')
    .in('claim_status', ['claimed', 'verified'])
    .neq('user_id', userId)
    .limit(4);
  if (branch) query = query.eq('branch', branch);
  if (batch) query = query.gte('batch_year', batch - 2).lte('batch_year', batch + 2);
  const { data } = await query;
  const rows = data ?? [];
  const companyIds = [...new Set(rows.map((r: any) => r.current_company_id).filter(Boolean))];
  const { data: companies } = companyIds.length
    ? await db.from('companies').select('id, name').in('id', companyIds)
    : { data: [] as { id: string; name: string }[] };
  const companyName = new Map((companies ?? []).map((c) => [c.id, c.name]));
  return rows.map((r: any) => ({
    key: r.id,
    name: r.full_name,
    detail: [r.designation, companyName.get(r.current_company_id)].filter(Boolean).join(' at ') || 'Alumnus',
    href: hrefFor(r),
    note: `${r.branch} ${r.batch_year}`,
  }));
}

async function studentContext(user: SessionUser): Promise<Omit<HomeContext, 'avatar_url' | 'cover_url'>> {
  const db = createAdminClient();
  const [profile, requests, calls, opportunities, posts, connections, invitations] = await Promise.all([
    getStudentProfile(user.id),
    db.from('requests').select('alumni_id, status').eq('student_id', user.id),
    listCallsForUser(user.id),
    openOpportunities(),
    countPostsBy(user.id),
    countConnections(user.id),
    countPendingInvitations(user.id),
  ]);
  const sent = requests.data ?? [];

  // Strongest matches the student has not contacted yet, like Smart Matches.
  let people: HomePerson[] = [];
  if (profile) {
    const contacted = new Set(sent.map((r: any) => r.alumni_id));
    const { items } = await getDirectory({ status: 'claimed', sort: 'match', page: 1, pageSize: 60 }, profile);
    people = items
      .filter((i) => i.match.matchable && !contacted.has(i.record.alumni_profiles?.user_id ?? ''))
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 4)
      .map(({ record, match }) => ({
        key: record.id,
        name: record.full_name,
        detail:
          [record.alumni_profiles?.designation, record.alumni_profiles?.current_company?.name].filter(Boolean).join(' at ') ||
          `${record.branch} ${record.batch_year}`,
        href: `/student/directory/${record.id}`,
        note: `Match ${match.score}`,
      }));
  }
  if (people.length === 0) {
    people = await nearbyAlumni(user.id, profile?.branch ?? null, null, (r) => `/student/directory/${r.id}`);
  }

  return {
    headline: profile ? `Student · ${profile.branch} · Class of ${profile.batch_year}` : 'Student',
    location: profile?.location_pref ?? null,
    selfHref: `/student/people/${user.id}`,
    profileHref: '/student/settings',
    profileStrength: profileStrength(profile, ['branch', 'batch_year', 'skills', 'target_role', 'target_company', 'target_industry', 'location_pref', 'resume_url']),
    stats: [
      { label: 'Connections', value: connections, href: '/student/network?tab=connections' },
      { label: 'Invitations', value: invitations, href: '/student/network' },
      { label: 'Requests sent', value: sent.length, href: '/student/requests' },
      { label: 'Your posts', value: posts, href: '/student/home?mine=1' },
    ],
    people: { title: 'Alumni you may want to meet', items: people, moreHref: '/student/suggestions' },
    opportunities,
    nextSession: upcomingOf(calls)[0] ?? null,
  };
}

async function alumniContext(user: SessionUser): Promise<Omit<HomeContext, 'avatar_url' | 'cover_url'>> {
  const db = createAdminClient();
  const [profile, record, requests, calls, opportunities, posts, connections, invitations, suggestions] = await Promise.all([
    getAlumniProfile(user.id),
    getAlumniRecordForUser(user.id),
    db.from('requests').select('student_id, status').eq('alumni_id', user.id),
    listCallsForUser(user.id),
    openOpportunities(),
    countPostsBy(user.id),
    countConnections(user.id),
    countPendingInvitations(user.id),
    peopleYouMayKnow(user.id, 4),
  ]);
  const received = requests.data ?? [];
  const work = [profile?.designation, profile?.current_company?.name].filter(Boolean).join(' at ');
  const cohort = record ? `${record.branch} · Class of ${record.batch_year}` : null;

  return {
    headline: [work || 'Alumnus', cohort].filter(Boolean).join(' · '),
    location: profile?.location ?? record?.city ?? null,
    selfHref: `/alumni/people/${user.id}`,
    profileHref: '/alumni/profile',
    profileStrength: profileStrength(profile, ['current_company_id', 'designation', 'industry', 'location', 'experience_years', 'skills', 'bio']),
    stats: [
      { label: 'Connections', value: connections, href: '/alumni/network?tab=connections' },
      { label: 'Invitations', value: invitations, href: '/alumni/network' },
      { label: 'Pending requests', value: received.filter((r: any) => r.status === 'pending').length, href: '/alumni/requests' },
      { label: 'Your posts', value: posts, href: '/alumni/home?mine=1' },
    ],
    people: {
      title: 'People you may know',
      items: suggestions.map((p) => ({
        key: p.id,
        name: p.full_name,
        detail: p.headline,
        href: `/alumni/people/${p.id}`,
        note: null,
        connectId: p.id,
        avatar_url: p.avatar_url,
      })),
      moreHref: '/alumni/network',
    },
    opportunities,
    nextSession: upcomingOf(calls)[0] ?? null,
  };
}

export async function getHomeContext(user: SessionUser): Promise<HomeContext> {
  const db = createAdminClient();
  const [context, { data: photos }] = await Promise.all([
    user.role === 'alumni' ? alumniContext(user) : studentContext(user),
    db.from('users').select('avatar_path, cover_path').eq('id', user.id).maybeSingle(),
  ]);
  return { ...context, avatar_url: avatarUrl(photos?.avatar_path), cover_url: avatarUrl(photos?.cover_path) };
}
