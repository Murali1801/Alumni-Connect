import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getFeed, type FeedFilter, type FeedPage } from '@/lib/posts';
import { connectionIds } from '@/lib/network';
import { rankFeed, type ViewerContext } from './feed-rank';

/** How many of the newest posts are considered for "Top". */
const POOL = 150;

/** What the ranker needs to know about the viewer: cohort, aims, skills and connections. */
export async function getViewerContext(viewerId: string): Promise<ViewerContext> {
  const db = createAdminClient();
  const [{ data: user }, { data: student }, { data: alumnus }, connections] = await Promise.all([
    db.from('users').select('role').eq('id', viewerId).maybeSingle(),
    db.from('student_profiles').select('branch, batch_year, skills, target_role').eq('user_id', viewerId).maybeSingle(),
    db
      .from('alumni_profiles')
      .select('designation, skills, record:alumni_records!record_id(branch, batch_year)')
      .eq('user_id', viewerId)
      .maybeSingle(),
    connectionIds(viewerId),
  ]);
  const record = (Array.isArray(alumnus?.record) ? alumnus.record[0] : alumnus?.record) as
    | { branch: string | null; batch_year: number | null }
    | null
    | undefined;
  return {
    id: viewerId,
    role: (user?.role as ViewerContext['role']) ?? (student ? 'student' : 'alumni'),
    branch: student?.branch ?? record?.branch ?? null,
    batch_year: student?.batch_year ?? record?.batch_year ?? null,
    target_role: student?.target_role ?? alumnus?.designation ?? null,
    skills: (student?.skills ?? alumnus?.skills ?? []) as string[],
    connections: new Set(connections),
  };
}

/** "top:<offset>" cursors page through one ranked pool. */
function parseOffset(cursor: string | undefined): number {
  const m = (cursor ?? '').match(/^top:(\d{1,4})$/);
  return m ? Number(m[1]) : 0;
}

/**
 * The Home feed's "Top" tab: the newest POOL posts (respecting the same
 * filter and hashtag as Recent), ranked for this viewer by lib/ml/feed-rank.ts.
 * Pages by offset into the ranked pool; `next` is null once it is used up.
 */
export async function getTopFeed({
  viewerId,
  limit = 15,
  cursor,
  filter = 'all',
  tag,
}: {
  viewerId: string;
  limit?: number;
  cursor?: string;
  filter?: FeedFilter;
  tag?: string;
}): Promise<FeedPage> {
  const [pool, viewer] = await Promise.all([getFeed({ viewerId, filter, tag, limit: POOL }), getViewerContext(viewerId)]);
  const ranked = rankFeed(pool.items, viewer);
  const offset = parseOffset(cursor);
  const items = ranked.slice(offset, offset + limit).map((r) => r.post);
  const end = offset + items.length;
  return { items, next: end < ranked.length ? `top:${end}` : null };
}
