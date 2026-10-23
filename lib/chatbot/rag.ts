import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { listCallsForUser } from '@/lib/calls';
import { latestJobs, searchJobs, searchPeople, searchPosts } from '@/lib/search';
import { isSearchable } from '@/lib/search-shared';
import { OPPORTUNITY_LABEL, WORK_MODE_LABEL, type OpportunityKind } from '@/lib/feed-shared';
import { formatDate } from '@/lib/format';
import type { SessionUser } from '@/lib/session';
import { ALL_DOCS, type KnowledgeDoc } from './docs';
import {
  detectIntent,
  docBlocks,
  formatAccount,
  jobQuery,
  peopleQuery,
  postQuery,
  rankDocsLocal,
  rankedBlocks,
  type AccountContext,
  type ContextBlock,
  type Intent,
  type Role,
} from './rag-core';

/**
 * Per-question retrieval for the assistant: knowledge docs, and, when the
 * question is about them, open listings, recent posts, members, and the
 * asker's own account. Everything read here is something this user can already
 * see in the app: listings, posts and member cards are visible to every member,
 * and the account block is built only from rows about the asker. Contact
 * columns are never selected.
 */

const RETRIEVAL_TIMEOUT_MS = 5_000;
const POSTS_SINCE_DAYS = 120;

const bundled = new Map(ALL_DOCS.map((d) => [d.id, d]));

async function settle<T>(name: string, work: () => Promise<T>, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work(),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => {
          console.warn(`assistant: ${name} retrieval timed out`);
          resolve(fallback);
        }, RETRIEVAL_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    console.warn(`assistant: ${name} retrieval failed`, (err as Error).message);
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

async function knowledge(question: string, role: Role, local: ReturnType<typeof rankDocsLocal>): Promise<ContextBlock[]> {
  const db = createAdminClient();
  const { data, error } = await db.rpc('search_knowledge', { q: question, p_role: role, p_limit: 10 });
  if (error) console.warn('assistant: search_knowledge failed, using bundled docs', error.message);
  const dbHits = ((error ? [] : data) ?? []).map((r: any) => ({
    rank: Number(r.rank) || 0,
    doc: {
      id: r.id,
      title: r.title,
      body: r.body,
      source: r.source,
      url: r.url,
      roles: [],
      // The table does not return keywords; the bundled copy has them for seeded docs.
      keywords: bundled.get(r.id)?.keywords ?? [],
    } satisfies KnowledgeDoc,
  }));
  return docBlocks(question, role, dbHits, local);
}

async function jobs(question: string, role: Role, wanted: boolean): Promise<ContextBlock[]> {
  // "Any internships?" has no subject to match, so it gets the newest of that kind.
  const { q, type } = jobQuery(question);
  // A subject that matches nothing returns nothing, so no listing is passed off as a match.
  const page = isSearchable(q)
    ? await searchJobs(q, { any: true, type, limit: 3, viewerRole: role })
    : await latestJobs({ type, limit: 3, viewerRole: role });
  return rankedBlocks(
    'job',
    page.items.map((j) => ({
      key: j.id,
      title: `${j.title}${j.company ? ` at ${j.company}` : ''}`,
      url: j.url,
      rank: j.rank,
      text: [
        OPPORTUNITY_LABEL[j.type as OpportunityKind] ?? j.type,
        j.location,
        j.work_mode ? WORK_MODE_LABEL[j.work_mode as keyof typeof WORK_MODE_LABEL] ?? j.work_mode : null,
        j.experience ? `experience ${j.experience}` : null,
        j.compensation,
        j.deadline ? `apply by ${formatDate(j.deadline)}` : null,
        j.target_skills.length ? `skills: ${j.target_skills.slice(0, 8).join(', ')}` : null,
        j.posted_by ? `posted by ${j.posted_by.full_name}` : null,
      ]
        .filter(Boolean)
        .join(' · ') + `. ${j.snippet}`,
    })),
    wanted
  );
}

async function posts(question: string, wanted: boolean): Promise<ContextBlock[]> {
  const since = new Date(Date.now() - POSTS_SINCE_DAYS * 86_400_000);
  const q = postQuery(question);
  if (!isSearchable(q)) return [];
  const page = await searchPosts(q, { any: true, limit: 2, since });
  return rankedBlocks(
    'post',
    page.items.map((p) => ({
      key: p.id,
      title: `Post by ${p.author.full_name}, ${formatDate(p.created_at)}`,
      url: p.url,
      rank: p.rank,
      text: `${p.author.headline}. ${p.snippet}`,
    })),
    wanted
  );
}

async function people(question: string, role: Role, wanted: boolean): Promise<ContextBlock[]> {
  const q = peopleQuery(question);
  if (!isSearchable(q)) return [];
  const page = await searchPeople(q, { any: true, limit: 3, viewerRole: role });
  return rankedBlocks(
    'person',
    page.items.map((m) => ({
      key: m.id,
      title: m.full_name,
      url: m.url,
      rank: m.rank,
      text: [m.headline, m.location].filter(Boolean).join(' · '),
    })),
    wanted
  );
}

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));
const list = (v: string[] | null | undefined) => (v?.length ? v.slice(0, 12).join(', ') : null);

/** The asker's own profile, requests, sessions and network, and nothing else. */
async function account(user: SessionUser): Promise<AccountContext> {
  const db = createAdminClient();
  const me = user.id;
  const ctx: AccountContext = {
    name: user.full_name,
    role: user.role,
    cohort: null,
    profile: [],
    missing: [],
    requests: [],
    requestTotals: {},
    sessions: [],
    connections: 0,
    pendingInvitations: 0,
    extra: [],
  };

  if (user.role === 'admin') {
    const { count } = await db.from('alumni_records').select('id', { count: 'exact', head: true }).eq('claim_status', 'claimed');
    ctx.extra.push(`Verification queue: ${count ?? 0} claim${count === 1 ? '' : 's'} waiting.`);
    return ctx;
  }

  const side = user.role === 'alumni' ? 'alumni_id' : 'student_id';
  const other = user.role === 'alumni' ? 'student_id' : 'alumni_id';

  const [profile, requests, calls, connected, invitations, postings] = await Promise.all([
    user.role === 'alumni'
      ? db
          .from('alumni_profiles')
          .select(
            'designation, industry, location, skills, mentorship_available, mock_interview_available, referral_available, internship_available, current_company:companies!current_company_id(name), record:alumni_records!record_id(branch, batch_year, claim_status)'
          )
          .eq('user_id', me)
          .maybeSingle()
      : db
          .from('student_profiles')
          .select('branch, batch_year, skills, target_role, target_company, target_industry, location_pref, resume_url')
          .eq('user_id', me)
          .maybeSingle(),
    db
      .from('requests')
      .select(`type, status, created_at, response_note, ${other}`)
      .eq(side, me)
      .order('created_at', { ascending: false })
      .limit(100),
    listCallsForUser(me),
    db
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`requester_id.eq.${me},addressee_id.eq.${me}`),
    db.from('connections').select('id', { count: 'exact', head: true }).eq('status', 'pending').eq('addressee_id', me),
    user.role === 'alumni'
      ? db.from('opportunities').select('id', { count: 'exact', head: true }).eq('posted_by', me).eq('is_open', true)
      : Promise.resolve({ count: null }),
  ]);

  const p = profile.data as any;
  if (user.role === 'alumni') {
    const record = one(p?.record) as any;
    const company = (one(p?.current_company) as any)?.name ?? null;
    ctx.cohort = record?.branch && record?.batch_year ? `${record.branch} ${record.batch_year}` : null;
    const availability = [
      p?.mentorship_available && 'mentorship',
      p?.mock_interview_available && 'mock interviews',
      p?.referral_available && 'referrals',
      p?.internship_available && 'internship leads',
    ].filter(Boolean) as string[];
    ctx.profile = [
      { label: 'designation', value: p?.designation ?? null },
      { label: 'company', value: company },
      { label: 'industry', value: p?.industry ?? null },
      { label: 'location', value: p?.location ?? null },
      { label: 'skills', value: list(p?.skills) },
      { label: 'open to', value: availability.join(', ') || null },
      { label: 'record', value: record?.claim_status === 'verified' ? 'verified' : record ? 'claimed, awaiting verification' : null },
    ];
    if (!p?.designation) ctx.missing.push('designation');
    if (!company) ctx.missing.push('current company');
    if (!p?.skills?.length) ctx.missing.push('skills');
    if (!availability.length) ctx.missing.push('availability (every request type is switched off, so students cannot send requests)');
    ctx.extra.push(`Open postings: ${postings.count ?? 0}.`);
  } else {
    ctx.cohort = p?.branch && p?.batch_year ? `${p.branch} ${p.batch_year}` : null;
    ctx.profile = [
      { label: 'target role', value: p?.target_role ?? null },
      { label: 'target company', value: p?.target_company ?? null },
      { label: 'target industry', value: p?.target_industry ?? null },
      { label: 'location preference', value: p?.location_pref ?? null },
      { label: 'skills', value: list(p?.skills) },
      { label: 'resume link', value: p?.resume_url ? 'added' : null },
    ];
    if (!p) ctx.missing.push('the whole profile (nothing can be matched until it exists)');
    else {
      if (!p.target_company) ctx.missing.push('target company (35% of every match score)');
      if (!p.target_role) ctx.missing.push('target role (25% of every match score)');
      if (!p.skills?.length) ctx.missing.push('skills');
      if (!p.resume_url) ctx.missing.push('resume link');
    }
  }

  const rows = (requests.data ?? []) as any[];
  for (const r of rows) ctx.requestTotals[r.status] = (ctx.requestTotals[r.status] ?? 0) + 1;
  const latest = rows.slice(0, 5);
  const ids = [...new Set(latest.map((r) => r[other]).filter(Boolean))];
  const { data: names } = ids.length
    ? await db.from('users').select('id, full_name').in('id', ids)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = new Map((names ?? []).map((u) => [u.id, u.full_name]));
  ctx.requests = latest.map((r) => ({
    direction: user.role === 'alumni' ? 'received' : 'sent',
    type: r.type,
    status: r.status,
    counterpart: nameOf.get(r[other]) ?? 'a member',
    created_at: r.created_at,
    note: r.response_note ?? null,
  }));

  const now = Date.now();
  ctx.sessions = calls
    .filter((c) => c.status === 'scheduled' && new Date(c.scheduled_at).getTime() + c.duration_min * 60_000 > now)
    .slice(0, 3)
    .map((c) => ({
      title: c.title,
      with: c.host_id === me ? c.guest_name : c.host_name,
      scheduled_at: c.scheduled_at,
      duration_min: c.duration_min,
    }));
  ctx.connections = connected.count ?? 0;
  ctx.pendingInvitations = invitations.count ?? 0;
  return ctx;
}

/**
 * How much the account block is worth in this prompt: top for questions about
 * the account, mid for first-person questions (useful for tailoring advice),
 * and left out otherwise.
 */
function accountScore(intent: Intent) {
  if (intent.account) return 0.95;
  if (intent.personal) return 0.35;
  return 0;
}

export async function retrieve(user: SessionUser, question: string): Promise<{ blocks: ContextBlock[]; intent: Intent }> {
  const role = user.role;
  const intent = detectIntent(question);
  const wantAccount = intent.account || intent.personal;

  // The bundled docs answer even when the database does not.
  const local = rankDocsLocal(question, ALL_DOCS, role, 6);
  const bundledOnly = docBlocks(question, role, [], local);
  const none = Promise.resolve([] as ContextBlock[]);

  const [docs, jobBlocks, postBlocks, peopleBlocks, acct] = await Promise.all([
    settle('knowledge', () => knowledge(question, role, local), bundledOnly),
    intent.jobs ? settle('jobs', () => jobs(question, role, true), []) : none,
    intent.posts ? settle('posts', () => posts(question, true), []) : none,
    intent.people ? settle('people', () => people(question, role, true), []) : none,
    wantAccount ? settle('account', () => account(user), null) : Promise.resolve(null),
  ]);

  const blocks = [...docs, ...jobBlocks, ...postBlocks, ...peopleBlocks];
  if (acct) blocks.push({ ...formatAccount(acct, role), score: accountScore(intent) });
  return { blocks, intent };
}
