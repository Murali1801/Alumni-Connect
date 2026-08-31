import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { listCallsForUser, listAllCalls, type CallSession } from '@/lib/calls';
import { getStudentProfile, getAlumniProfile, getAlumniRecordForUser } from '@/lib/queries';
import type { SessionUser } from '@/lib/session';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const DAY = 86_400_000;

/** Buckets a set of timestamps into the last `weeks` ISO weeks. */
export function weeklySeries(dates: string[], weeks = 8) {
  const now = Date.now();
  const buckets = Array.from({ length: weeks }, (_, i) => {
    const end = now - (weeks - 1 - i) * 7 * DAY;
    return {
      label: new Date(end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      start: end - 7 * DAY,
      end,
      value: 0,
    };
  });
  for (const d of dates) {
    const t = new Date(d).getTime();
    const bucket = buckets.find((b) => t > b.start && t <= b.end);
    if (bucket) bucket.value++;
  }
  return buckets.map(({ label, value }) => ({ label, value }));
}

export function upcomingOf(calls: CallSession[]) {
  const now = Date.now();
  return calls
    .filter((c) => c.status === 'scheduled' && new Date(c.scheduled_at).getTime() + c.duration_min * 60_000 > now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
}

/** Percentage of profile fields that carry a real value. */
export function profileStrength(profile: Record<string, any> | null, fields: string[]) {
  if (!profile) return 0;
  let filled = 0;
  for (const f of fields) {
    const v = profile[f];
    if (Array.isArray(v) ? v.length > 0 : v !== null && v !== undefined && v !== '') filled++;
  }
  return Math.round((filled / fields.length) * 100);
}

async function count(table: string, build: (q: any) => any = (q) => q) {
  const db = createAdminClient();
  const { count: n } = await build(db.from(table).select('*', { count: 'exact', head: true }));
  return n ?? 0;
}

/* ------------------------------------------------------------------ */
/* Student                                                             */
/* ------------------------------------------------------------------ */

export async function getStudentDashboard(user: SessionUser) {
  const db = createAdminClient();

  const [profile, requestsRes, opportunitiesRes, calls, reachable, mentorsAvailable] =
    await Promise.all([
      getStudentProfile(user.id),
      db
        .from('requests')
        .select(
          'id, type, status, message, match_score, created_at, responded_at, response_note, alumni:users!requests_alumni_id_fkey(id, full_name)'
        )
        .eq('student_id', user.id)
        .order('created_at', { ascending: false }),
      db
        .from('opportunities')
        .select('id, title, type, location, target_skills, created_at, company:companies!company_id(name)')
        .eq('is_open', true)
        .order('created_at', { ascending: false })
        .limit(6),
      listCallsForUser(user.id),
      count('alumni_records', (q) => q.in('claim_status', ['claimed', 'verified'])),
      count('alumni_profiles', (q) => q.eq('mentorship_available', true)),
    ]);

  const requests = (requestsRes.data ?? []).map((r: any) => ({
    ...r,
    alumni: Array.isArray(r.alumni) ? r.alumni[0] : r.alumni,
  }));

  const accepted = requests.filter((r) => r.status === 'accepted');
  const pending = requests.filter((r) => r.status === 'pending');
  const declined = requests.filter((r) => r.status === 'declined');

  const opportunities = (opportunitiesRes.data ?? []).map((o: any) => ({
    ...o,
    company: Array.isArray(o.company) ? o.company[0] : o.company,
  }));

  // Skill overlap between what the student has and what open roles ask for.
  const mySkills = new Set((profile?.skills ?? []).map((s) => s.toLowerCase()));
  const skillGaps = new Map<string, number>();
  for (const o of opportunities) {
    for (const s of o.target_skills ?? []) {
      if (!mySkills.has(s.toLowerCase())) skillGaps.set(s, (skillGaps.get(s) ?? 0) + 1);
    }
  }

  return {
    profile,
    requests,
    accepted,
    pending,
    declined,
    opportunities,
    upcoming: upcomingOf(calls),
    calls,
    stats: {
      reachable,
      mentorsAvailable,
      sent: requests.length,
      accepted: accepted.length,
      pending: pending.length,
      responseRate: requests.length
        ? Math.round(((requests.length - pending.length) / requests.length) * 100)
        : 0,
    },
    activity: weeklySeries(requests.map((r) => r.created_at)),
    skillGaps: [...skillGaps.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6),
    strength: profileStrength(profile, [
      'branch',
      'batch_year',
      'skills',
      'target_role',
      'target_company',
      'target_industry',
      'location_pref',
      'resume_url',
    ]),
  };
}

/* ------------------------------------------------------------------ */
/* Alumni                                                              */
/* ------------------------------------------------------------------ */

export async function getAlumniDashboard(user: SessionUser) {
  const db = createAdminClient();

  const [profile, record, requestsRes, postingsRes, calls] = await Promise.all([
    getAlumniProfile(user.id),
    getAlumniRecordForUser(user.id),
    db
      .from('requests')
      .select(
        'id, type, status, message, match_score, created_at, responded_at, response_note, student:users!requests_student_id_fkey(id, full_name)'
      )
      .eq('alumni_id', user.id)
      .order('created_at', { ascending: false }),
    db
      .from('opportunities')
      .select('id, title, type, location, is_open, created_at, target_skills, company:companies!company_id(name)')
      .eq('posted_by', user.id)
      .order('created_at', { ascending: false }),
    listCallsForUser(user.id),
  ]);

  const requests = (requestsRes.data ?? []).map((r: any) => ({
    ...r,
    student: Array.isArray(r.student) ? r.student[0] : r.student,
  }));
  const postings = (postingsRes.data ?? []).map((o: any) => ({
    ...o,
    company: Array.isArray(o.company) ? o.company[0] : o.company,
  }));

  const pending = requests.filter((r) => r.status === 'pending');
  const accepted = requests.filter((r) => r.status === 'accepted');
  const answered = requests.filter((r) => r.responded_at);

  // Median hours to first response — median, not mean, so one slow reply from
  // months ago does not distort the figure.
  const gaps = answered
    .map((r) => (new Date(r.responded_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000)
    .sort((a, b) => a - b);
  const medianHours = gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : 0;

  const byType = ['mentorship', 'mock_interview', 'referral', 'internship'].map((t) => ({
    label: t.replace('_', ' '),
    value: requests.filter((r) => r.type === t).length,
  }));

  return {
    profile,
    record,
    requests,
    pending,
    accepted,
    postings,
    upcoming: upcomingOf(calls),
    calls,
    stats: {
      pending: pending.length,
      accepted: accepted.length,
      total: requests.length,
      openPostings: postings.filter((p) => p.is_open).length,
      responseRate: requests.length ? Math.round((answered.length / requests.length) * 100) : 0,
      medianHours,
    },
    activity: weeklySeries(requests.map((r) => r.created_at)),
    byType,
    strength: profileStrength(profile, [
      'current_company_id',
      'designation',
      'industry',
      'location',
      'experience_years',
      'skills',
      'linkedin_url',
      'bio',
    ]),
  };
}

/* ------------------------------------------------------------------ */
/* Admin                                                               */
/* ------------------------------------------------------------------ */

export async function getAdminDashboard() {
  const db = createAdminClient();

  const [
    totalRecords,
    claimedCount,
    verifiedCount,
    queue,
    students,
    alumniUsers,
    companies,
    openOpportunities,
  ] = await Promise.all([
    count('alumni_records'),
    count('alumni_records', (q) => q.in('claim_status', ['claimed', 'verified'])),
    count('alumni_records', (q) => q.eq('claim_status', 'verified')),
    count('alumni_records', (q) => q.eq('claim_status', 'claimed')),
    count('users', (q) => q.eq('role', 'student')),
    count('users', (q) => q.eq('role', 'alumni')),
    count('companies'),
    count('opportunities', (q) => q.eq('is_open', true)),
  ]);

  const [requestsRes, batchRes, recentClaimsRes, auditRes, calls] = await Promise.all([
    db.from('requests').select('id, status, type, created_at, responded_at').limit(2000),
    db.from('alumni_records').select('batch_year, claim_status').limit(5000),
    db
      .from('alumni_records')
      .select('id, full_name, branch, batch_year, claimed_at, users!claimed_by(email)')
      .eq('claim_status', 'claimed')
      .order('claimed_at', { ascending: false })
      .limit(6),
    db
      .from('audit_log')
      .select('id, action, target_type, target_id, created_at, actor:users!actor_id(full_name)')
      .order('created_at', { ascending: false })
      .limit(8),
    listAllCalls(200),
  ]);

  const requests = requestsRes.data ?? [];
  const answered = requests.filter((r) => r.responded_at);
  const gaps = answered
    .map((r: any) => (new Date(r.responded_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000)
    .sort((a, b) => a - b);

  const batchMap = new Map<number, { batch: number; total: number; claimed: number }>();
  for (const r of batchRes.data ?? []) {
    if (!r.batch_year) continue;
    const entry = batchMap.get(r.batch_year) ?? { batch: r.batch_year, total: 0, claimed: 0 };
    entry.total++;
    if (r.claim_status === 'claimed' || r.claim_status === 'verified') entry.claimed++;
    batchMap.set(r.batch_year, entry);
  }
  const claimRateByBatch = [...batchMap.values()]
    .sort((a, b) => a.batch - b.batch)
    .map((b) => ({ ...b, rate: b.total ? Math.round((b.claimed / b.total) * 100) : 0 }));

  // Company clustering: how many claimed alumni sit at each employer today.
  const { data: profileCompanies } = await db
    .from('alumni_profiles')
    .select('current_company_id, mentorship_available, referral_available')
    .limit(2000);
  const { data: companyRows } = await db.from('companies').select('id, name').limit(2000);
  const nameById = new Map((companyRows ?? []).map((c: any) => [c.id, c.name]));
  const clusterMap = new Map<string, { company: string; alumni: number; mentors: number; referrers: number }>();
  for (const p of profileCompanies ?? []) {
    if (!p.current_company_id) continue;
    const name = nameById.get(p.current_company_id);
    if (!name) continue;
    const c = clusterMap.get(name) ?? { company: name, alumni: 0, mentors: 0, referrers: 0 };
    c.alumni++;
    if (p.mentorship_available) c.mentors++;
    if (p.referral_available) c.referrers++;
    clusterMap.set(name, c);
  }

  return {
    stats: {
      totalRecords,
      claimedCount,
      verifiedCount,
      queue,
      students,
      alumniUsers,
      companies,
      openOpportunities,
      claimRate: totalRecords ? Math.round((claimedCount / totalRecords) * 100) : 0,
      requestsTotal: requests.length,
      requestsPending: requests.filter((r) => r.status === 'pending').length,
      responseRate: requests.length ? Math.round((answered.length / requests.length) * 100) : 0,
      medianHours: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : 0,
      sessions: calls.length,
    },
    claimRateByBatch,
    activity: weeklySeries(requests.map((r: any) => r.created_at), 10),
    requestMix: ['mentorship', 'mock_interview', 'referral', 'internship'].map((t) => ({
      label: t.replace('_', ' '),
      value: requests.filter((r: any) => r.type === t).length,
    })),
    companyClusters: [...clusterMap.values()].sort((a, b) => b.alumni - a.alumni).slice(0, 8),
    recentClaims: (recentClaimsRes.data ?? []).map((r: any) => ({
      ...r,
      email: Array.isArray(r.users) ? r.users[0]?.email : r.users?.email,
    })),
    audit: (auditRes.data ?? []).map((a: any) => ({
      ...a,
      actor: Array.isArray(a.actor) ? a.actor[0] : a.actor,
    })),
    calls,
    upcoming: upcomingOf(calls),
  };
}
