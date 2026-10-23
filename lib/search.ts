import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMemberCards, avatarUrl, type MemberCard } from '@/lib/network';
import { headlineOf, postImageUrl, postPath } from '@/lib/posts';
import type { Role } from '@/lib/session';
import {
  clampLimit,
  clampOffset,
  emptyPage,
  groupOrder,
  inRankOrder,
  isSearchable,
  makeSnippet,
  normaliseQuery,
  type Page,
  type SearchGroupKey,
} from '@/lib/search-shared';

/**
 * Search over people, posts, jobs and companies.
 *
 * Matching and ranking happen in Postgres (search_* functions, migration 0011):
 * full-text search with ts_rank, recency decay for posts and jobs, and trigram
 * similarity for names. Each function returns ids and ranks only; the rows are
 * then read here with the same column lists the rest of the app uses, so no
 * search path can ever select a contact column. Server-only: the functions are
 * executable by the service role alone, after the caller's session is checked.
 */

export type PersonHit = MemberCard & { rank: number; url: string };

export type PostHit = {
  id: string;
  url: string;
  rank: number;
  snippet: string;
  hashtags: string[];
  created_at: string;
  image_url: string | null;
  like_count: number;
  comment_count: number;
  author: { id: string; full_name: string; role: Role; headline: string; avatar_url: string | null };
  opportunity: { id: string; type: string; title: string; company: string | null } | null;
};

export type JobHit = {
  id: string;
  rank: number;
  type: string;
  title: string;
  company: string | null;
  location: string | null;
  work_mode: string | null;
  experience: string | null;
  compensation: string | null;
  duration: string | null;
  deadline: string | null;
  is_open: boolean;
  target_skills: string[];
  snippet: string;
  created_at: string;
  posted_by: { id: string; full_name: string } | null;
  /** The feed post announcing this opening, when there is one. */
  post_id: string | null;
  url: string | null;
};

export type CompanyHit = {
  id: string;
  name: string;
  industry: string | null;
  alumni_count: number;
  open_jobs: number;
  rank: number;
};

export type SearchAllResult = {
  query: string;
  order: SearchGroupKey[];
  people: Page<PersonHit>;
  posts: Page<PostHit>;
  jobs: Page<JobHit>;
  companies: Page<CompanyHit>;
};

type Ranked = { id: string; rank: number; total: number };
type Paging = { limit?: number; offset?: number };

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/** Members open at /student/people/<id> or /alumni/people/<id>; admins manage people from one page. */
function personUrl(viewerRole: Role | undefined, id: string) {
  if (viewerRole === 'admin') return '/admin/users';
  return viewerRole === 'alumni' ? `/alumni/people/${id}` : `/student/people/${id}`;
}

async function rank(fn: string, args: Record<string, unknown>): Promise<Ranked[]> {
  const db = createAdminClient();
  const { data, error } = await db.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return ((data ?? []) as any[]).map((r) => ({ id: String(r.id), rank: Number(r.rank) || 0, total: Number(r.total) || 0 }));
}

function prepare(q: string, paging: Paging, fallbackLimit = 20) {
  const query = normaliseQuery(q);
  return {
    query,
    ok: isSearchable(query),
    limit: clampLimit(paging.limit, fallbackLimit),
    offset: clampOffset(paging.offset),
  };
}

export async function searchPeople(
  q: string,
  opts: Paging & { role?: 'student' | 'alumni'; branch?: string | null; batch?: number | null; any?: boolean; viewerRole?: Role } = {}
): Promise<Page<PersonHit>> {
  const { query, ok, limit, offset } = prepare(q, opts);
  if (!ok) return emptyPage(limit, offset);
  const hits = await rank('search_people', {
    q: query,
    p_role: opts.role ?? null,
    p_branch: opts.branch?.trim().toUpperCase() || null,
    p_batch: opts.batch ?? null,
    p_any: Boolean(opts.any),
    p_limit: limit,
    p_offset: offset,
  });
  const ranks = new Map(hits.map((h) => [h.id, h.rank]));
  const cards = await getMemberCards(hits.map((h) => h.id));
  return {
    items: cards.map((c) => ({ ...c, rank: ranks.get(c.id) ?? 0, url: personUrl(opts.viewerRole, c.id) })),
    total: hits[0]?.total ?? 0,
    limit,
    offset,
  };
}

export async function searchPosts(
  q: string,
  opts: Paging & { authorId?: string; since?: Date; any?: boolean } = {}
): Promise<Page<PostHit>> {
  const { query, ok, limit, offset } = prepare(q, opts);
  if (!ok) return emptyPage(limit, offset);
  const hits = await rank('search_posts', {
    q: query,
    p_author: opts.authorId ?? null,
    p_since: opts.since?.toISOString() ?? null,
    p_any: Boolean(opts.any),
    p_limit: limit,
    p_offset: offset,
  });
  if (!hits.length) return emptyPage(limit, offset);

  const db = createAdminClient();
  const { data, error } = await db
    .from('post_feed')
    .select(
      'id, author_id, body, image_path, created_at, hashtags, full_name, role, avatar_path, branch, batch_year, designation, company_name, opportunity_id, opportunity_type, opportunity_title, opportunity_company, like_count, comment_count'
    )
    .in('id', hits.map((h) => h.id));
  if (error) throw new Error(`post_feed: ${error.message}`);

  const ranks = new Map(hits.map((h) => [h.id, h.rank]));
  const items = inRankOrder(hits.map((h) => h.id), (data ?? []) as any[]).map(
    (p): PostHit => ({
      id: p.id,
      url: postPath(p.id),
      rank: ranks.get(p.id) ?? 0,
      snippet: makeSnippet(p.body, query, 220),
      hashtags: p.hashtags ?? [],
      created_at: p.created_at,
      image_url: postImageUrl(p.image_path),
      like_count: p.like_count ?? 0,
      comment_count: p.comment_count ?? 0,
      author: {
        id: p.author_id,
        full_name: p.full_name,
        role: p.role,
        headline: headlineOf(p),
        avatar_url: avatarUrl(p.avatar_path),
      },
      opportunity: p.opportunity_id
        ? { id: p.opportunity_id, type: p.opportunity_type, title: p.opportunity_title, company: p.opportunity_company ?? null }
        : null,
    })
  );
  return { items, total: hits[0].total, limit, offset };
}

export async function searchJobs(
  q: string,
  opts: Paging & { type?: string | null; openOnly?: boolean; any?: boolean; viewerRole?: Role } = {}
): Promise<Page<JobHit>> {
  const { query, ok, limit, offset } = prepare(q, opts);
  if (!ok) return emptyPage(limit, offset);
  const hits = await rank('search_jobs', {
    q: query,
    p_type: opts.type ?? null,
    p_open_only: opts.openOnly ?? true,
    p_any: Boolean(opts.any),
    p_limit: limit,
    p_offset: offset,
  });
  if (!hits.length) return emptyPage(limit, offset);
  return { items: await hydrateJobs(hits, query, opts.viewerRole), total: hits[0].total, limit, offset };
}

/**
 * The newest open listings, optionally of one kind: what the assistant shows
 * for "any internships?", where there is nothing to match the text against.
 */
export async function latestJobs(opts: { type?: string | null; limit?: number; viewerRole?: Role } = {}): Promise<Page<JobHit>> {
  const limit = clampLimit(opts.limit, 3, 10);
  const db = createAdminClient();
  let q = db
    .from('opportunities')
    .select('id', { count: 'exact' })
    .eq('is_open', true)
    .or(`deadline.is.null,deadline.gte.${new Date().toISOString().slice(0, 10)}`)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (opts.type) q = q.eq('type', opts.type);
  const { data, count, error } = await q;
  if (error) throw new Error(`opportunities: ${error.message}`);
  const hits = (data ?? []).map((r: any, i: number) => ({ id: String(r.id), rank: 1 - i * 0.01, total: count ?? 0 }));
  return { items: await hydrateJobs(hits, '', opts.viewerRole), total: count ?? 0, limit, offset: 0 };
}

/** Listing rows for ranked ids, with company, poster and the feed post that announced each. */
async function hydrateJobs(hits: Ranked[], query: string, viewerRole?: Role): Promise<JobHit[]> {
  if (!hits.length) return [];
  const ids = hits.map((h) => h.id);
  const db = createAdminClient();
  const [jobs, posts] = await Promise.all([
    db
      .from('opportunities')
      .select(
        'id, type, title, description, location, work_mode, experience, compensation, duration, deadline, is_open, target_skills, created_at, company:companies!company_id(name), poster:users!posted_by(id, full_name)'
      )
      .in('id', ids),
    db.from('posts').select('id, opportunity_id, created_at').in('opportunity_id', ids).is('repost_of', null).order('created_at'),
  ]);
  if (jobs.error) throw new Error(`opportunities: ${jobs.error.message}`);

  const postFor = new Map<string, string>();
  for (const p of posts.data ?? []) if (!postFor.has(p.opportunity_id)) postFor.set(p.opportunity_id, p.id);
  const ranks = new Map(hits.map((h) => [h.id, h.rank]));
  const listUrl = viewerRole === 'student' ? '/student/opportunities' : null;

  return inRankOrder(ids, (jobs.data ?? []) as any[]).map((o): JobHit => {
    const poster = one(o.poster) as any;
    const postId = postFor.get(o.id) ?? null;
    return {
      id: o.id,
      rank: ranks.get(o.id) ?? 0,
      type: o.type,
      title: o.title,
      company: (one(o.company) as any)?.name ?? null,
      location: o.location ?? null,
      work_mode: o.work_mode ?? null,
      experience: o.experience ?? null,
      compensation: o.compensation ?? null,
      duration: o.duration ?? null,
      deadline: o.deadline ?? null,
      is_open: Boolean(o.is_open),
      target_skills: o.target_skills ?? [],
      snippet: makeSnippet(o.description, query, 200),
      created_at: o.created_at,
      posted_by: poster ? { id: poster.id, full_name: poster.full_name } : null,
      post_id: postId,
      url: postId ? postPath(postId) : listUrl,
    };
  });
}

export async function searchCompanies(q: string, opts: Paging = {}): Promise<Page<CompanyHit>> {
  const { query, ok, limit, offset } = prepare(q, opts);
  if (!ok) return emptyPage(limit, offset);
  const db = createAdminClient();
  const { data, error } = await db.rpc('search_companies', { q: query, p_limit: limit, p_offset: offset });
  if (error) throw new Error(`search_companies: ${error.message}`);
  const rows = (data ?? []) as any[];
  return {
    items: rows.map((c) => ({
      id: c.id,
      name: c.name,
      industry: c.industry ?? null,
      alumni_count: Number(c.alumni_count) || 0,
      open_jobs: Number(c.open_jobs) || 0,
      rank: Number(c.rank) || 0,
    })),
    total: Number(rows[0]?.total) || 0,
    limit,
    offset,
  };
}

/**
 * The top few of every kind at once, plus the order to show them in. One
 * failing group does not sink the others: it comes back empty and is logged.
 */
export async function searchAll(q: string, opts: { perGroup?: number; viewerRole?: Role } = {}): Promise<SearchAllResult> {
  const query = normaliseQuery(q);
  const limit = clampLimit(opts.perGroup, 5, 10);
  const settle = async <T,>(name: string, p: Promise<Page<T>>): Promise<Page<T>> => {
    try {
      return await p;
    } catch (err) {
      console.warn(`search: ${name} failed`, (err as Error).message);
      return emptyPage<T>(limit, 0);
    }
  };
  const [people, posts, jobs, companies] = await Promise.all([
    settle('people', searchPeople(query, { limit, viewerRole: opts.viewerRole })),
    settle('posts', searchPosts(query, { limit })),
    settle('jobs', searchJobs(query, { limit, viewerRole: opts.viewerRole })),
    settle('companies', searchCompanies(query, { limit })),
  ]);
  return { query, order: groupOrder({ people, posts, jobs, companies }), people, posts, jobs, companies };
}
