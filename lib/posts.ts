import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { OPPORTUNITY_KINDS, type OpportunityKind, type Reaction } from '@/lib/feed-shared';

export { REACTIONS, OPPORTUNITY_KINDS, type Reaction, type OpportunityKind } from '@/lib/feed-shared';

/* ------------------------------------------------------------------ */
/* Home feed                                                           */
/* ------------------------------------------------------------------ */

export const POST_IMAGE_BUCKET = 'post-images';
export const POST_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
};
export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const POST_BODY_MAX = 3000;
export const COMMENT_BODY_MAX = 1000;


export type FeedOpportunity = {
  id: string;
  type: OpportunityKind;
  title: string;
  company: string | null;
  location: string | null;
  work_mode: 'onsite' | 'hybrid' | 'remote' | null;
  experience: string | null;
  compensation: string | null;
  duration: string | null;
  deadline: string | null;
  eligibility: string | null;
  apply_via: 'link' | 'request' | 'message';
  application_link: string | null;
  skills: string[];
  open: boolean;
};

export type FeedPost = {
  id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  created_at: string;
  full_name: string;
  role: 'student' | 'alumni' | 'admin';
  avatar_url: string | null;
  branch: string | null;
  batch_year: number | null;
  record_id: string | null;
  designation: string | null;
  company_name: string | null;
  hashtags: string[];
  /** People the post @mentions, so their names can be linked. */
  mentions: { id: string; full_name: string }[];
  opportunity: FeedOpportunity | null;
  like_count: number;
  reaction_counts: Partial<Record<Reaction, number>>;
  comment_count: number;
  repost_count: number;
  my_reaction: Reaction | null;
  saved_by_me: boolean;
  /** Set on a repost: the post being shared, one level deep. */
  repost_of: string | null;
  original: FeedPost | null;
};

/** all, one opportunity kind, every opportunity, or the viewer's saved posts. */
export type FeedFilter = 'all' | 'opportunities' | OpportunityKind | 'saved';

export type FeedPage = { items: FeedPost[]; next: string | null };

export type PostComment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  full_name: string;
  role: 'student' | 'alumni' | 'admin';
  avatar_url: string | null;
  mentions: { id: string; full_name: string }[];
};

/** Public URL of a stored post photo. The bucket is public; names are unguessable. */
export function postImageUrl(path: string | null): string | null {
  if (!path) return null;
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${POST_IMAGE_BUCKET}/${path}`;
}

/** One line under an author's name: "Data Engineer at Infosys · COMP 2021" or "Student · IT 2027". */
export function headlineOf(p: Pick<FeedPost, 'role' | 'designation' | 'company_name' | 'branch' | 'batch_year'>): string {
  const cohort = p.branch && p.batch_year ? `${p.branch} ${p.batch_year}` : null;
  if (p.role === 'alumni') {
    const work = [p.designation, p.company_name].filter(Boolean).join(' at ');
    return [work || 'Alumnus', cohort].filter(Boolean).join(' · ');
  }
  if (p.role === 'student') return ['Student', cohort].filter(Boolean).join(' · ');
  return 'AlumniBridge team';
}

/** "<created_at>_<id>": stable paging even when two posts share a timestamp. */
export function parseFeedCursor(cursor: string | undefined): { createdAt: string; id: string } | null {
  const m = (cursor ?? '').match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))_([0-9a-f-]{36})$/i);
  return m ? { createdAt: m[1], id: m[2] } : null;
}

const FEED_COLUMNS = [
  'id, author_id, body, image_path, created_at, repost_of, hashtags, opportunity_id',
  'full_name, role, avatar_path, branch, batch_year, record_id, designation, company_name',
  'opportunity_type, opportunity_title, opportunity_company, opportunity_location, work_mode, experience',
  'compensation, duration, deadline, eligibility, apply_via, application_link, target_skills, opportunity_open',
  'like_count, reaction_counts, comment_count, repost_count',
].join(', ');

const avatarPublicUrl = (path: string | null) =>
  path ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}` : null;

/** Rows from post_feed, shaped as FeedPost, with the viewer's reaction, saves and reposted originals. */
async function shape(rows: any[], viewerId: string, depth = 0): Promise<FeedPost[]> {
  if (!rows.length) return [];
  const db = createAdminClient();
  const ids = rows.map((r) => r.id);
  const originalIds = depth === 0 ? [...new Set(rows.map((r) => r.repost_of).filter(Boolean))] : [];
  const [{ data: likes }, { data: saves }, { data: mentionRows }, originalRows] = await Promise.all([
    db.from('post_likes').select('post_id, reaction').eq('user_id', viewerId).in('post_id', ids),
    db.from('saved_posts').select('post_id').eq('user_id', viewerId).in('post_id', ids),
    db.from('posts').select('id, mentions').in('id', ids),
    originalIds.length
      ? db.from('post_feed').select(FEED_COLUMNS).in('id', originalIds).then((r) => r.data ?? [])
      : Promise.resolve([] as any[]),
  ]);
  const reactionOf = new Map((likes ?? []).map((l) => [l.post_id, l.reaction as Reaction]));
  const saved = new Set((saves ?? []).map((s) => s.post_id));
  const mentionIds = new Map((mentionRows ?? []).map((m) => [m.id, (m.mentions ?? []) as string[]]));
  const allMentioned = [...new Set([...mentionIds.values()].flat())];
  const { data: mentionedUsers } = allMentioned.length
    ? await db.from('users').select('id, full_name').in('id', allMentioned)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = new Map((mentionedUsers ?? []).map((u) => [u.id, u.full_name]));
  const originals = new Map((await shape(originalRows as any[], viewerId, depth + 1)).map((o) => [o.id, o]));

  return rows.map((r) => ({
    id: r.id,
    author_id: r.author_id,
    body: r.body,
    image_url: postImageUrl(r.image_path),
    created_at: r.created_at,
    full_name: r.full_name,
    role: r.role,
    avatar_url: avatarPublicUrl(r.avatar_path),
    branch: r.branch,
    batch_year: r.batch_year,
    record_id: r.record_id,
    designation: r.designation,
    company_name: r.company_name,
    hashtags: r.hashtags ?? [],
    mentions: (mentionIds.get(r.id) ?? []).filter((id) => nameOf.has(id)).map((id) => ({ id, full_name: nameOf.get(id)! })),
    opportunity: r.opportunity_id
      ? {
          id: r.opportunity_id,
          type: r.opportunity_type,
          title: r.opportunity_title,
          company: r.opportunity_company,
          location: r.opportunity_location,
          work_mode: r.work_mode,
          experience: r.experience,
          compensation: r.compensation,
          duration: r.duration,
          deadline: r.deadline,
          eligibility: r.eligibility,
          apply_via: r.apply_via ?? 'link',
          application_link: r.application_link,
          skills: r.target_skills ?? [],
          open: r.opportunity_open !== false,
        }
      : null,
    like_count: r.like_count,
    reaction_counts: r.reaction_counts ?? {},
    comment_count: r.comment_count,
    repost_count: r.repost_count,
    my_reaction: reactionOf.get(r.id) ?? null,
    saved_by_me: saved.has(r.id),
    repost_of: r.repost_of,
    original: r.repost_of ? (originals.get(r.repost_of) ?? null) : null,
  }));
}

/** The Home feed, newest first, filtered by kind, hashtag, author or saved. */
export async function getFeed({
  viewerId,
  cursor,
  authorId,
  postId,
  filter = 'all',
  tag,
  limit = 15,
}: {
  viewerId: string;
  cursor?: string;
  authorId?: string;
  postId?: string;
  filter?: FeedFilter;
  tag?: string;
  limit?: number;
}): Promise<FeedPage> {
  const db = createAdminClient();
  let query = db
    .from('post_feed')
    .select(FEED_COLUMNS)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit + 1);
  if (authorId) query = query.eq('author_id', authorId);
  if (postId) query = query.eq('id', postId);
  if (tag) query = query.contains('hashtags', [tag.toLowerCase()]);
  if (filter === 'opportunities') query = query.not('opportunity_id', 'is', null);
  else if ((OPPORTUNITY_KINDS as readonly string[]).includes(filter)) query = query.eq('opportunity_type', filter);
  else if (filter === 'saved') {
    const { data: savedRows } = await db.from('saved_posts').select('post_id').eq('user_id', viewerId).limit(500);
    const ids = (savedRows ?? []).map((s) => s.post_id);
    if (!ids.length) return { items: [], next: null };
    query = query.in('id', ids);
  }

  const after = parseFeedCursor(cursor);
  if (after) {
    // Quoted: timestamps carry dots, colons and "+", which the or() syntax would misread.
    const t = `"${after.createdAt}"`;
    query = query.or(`created_at.lt.${t},and(created_at.eq.${t},id.lt.${after.id})`);
  }

  const { data, error } = await query;
  if (error || !data) return { items: [], next: null };
  const items = await shape(data.slice(0, limit) as any[], viewerId);
  const last = items[items.length - 1];
  return { items, next: data.length > limit && last ? `${last.created_at}_${last.id}` : null };
}

/** `#placements` and friends: lower-cased, de-duplicated, at most ten. */
export function extractHashtags(text: string): string[] {
  const tags = [...text.matchAll(/(^|\s)#([\p{L}\p{N}_]{2,40})/gu)].map((m) => m[2].toLowerCase());
  return [...new Set(tags)].slice(0, 10);
}

/** One post, as a shared link opens it. */
export async function getPost(id: string, viewerId: string): Promise<FeedPost | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { items } = await getFeed({ viewerId, postId: id, limit: 1 });
  return items[0] ?? null;
}

/** The path a post is shared at; it works for every signed-in member. */
export const postPath = (id: string) => `/posts/${id}`;

/** A post's comments, oldest first, as a thread reads, with authors' photos and linked mentions. */
export async function getComments(postId: string): Promise<PostComment[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('post_comments')
    .select('id, post_id, author_id, body, created_at, mentions, author:users!post_comments_author_id_fkey(full_name, role, avatar_path)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error || !data) return [];
  const mentioned = [...new Set(data.flatMap((c: any) => c.mentions ?? []))];
  const { data: people } = mentioned.length
    ? await db.from('users').select('id, full_name').in('id', mentioned)
    : { data: [] as { id: string; full_name: string }[] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  return data.map(({ author, mentions, ...c }: any) => {
    const a = Array.isArray(author) ? author[0] : author;
    return {
      ...c,
      full_name: a?.full_name ?? 'Member',
      role: a?.role ?? 'student',
      avatar_url: avatarPublicUrl(a?.avatar_path ?? null),
      mentions: (mentions ?? []).filter((id: string) => nameOf.has(id)).map((id: string) => ({ id, full_name: nameOf.get(id)! })),
    };
  });
}

/** How many posts an author has written — for the profile card. */
export async function countPostsBy(authorId: string): Promise<number> {
  const db = createAdminClient();
  const { count } = await db.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', authorId);
  return count ?? 0;
}
