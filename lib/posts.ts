import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

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

export type FeedPost = {
  id: string;
  author_id: string;
  body: string;
  image_url: string | null;
  created_at: string;
  full_name: string;
  role: 'student' | 'alumni' | 'admin';
  branch: string | null;
  batch_year: number | null;
  record_id: string | null;
  designation: string | null;
  company_name: string | null;
  like_count: number;
  comment_count: number;
  liked_by_me: boolean;
};

export type FeedPage = { items: FeedPost[]; next: string | null };

export type PostComment = {
  id: string;
  post_id: string;
  author_id: string;
  body: string;
  created_at: string;
  full_name: string;
  role: 'student' | 'alumni' | 'admin';
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

const FEED_COLUMNS =
  'id, author_id, body, image_path, created_at, full_name, role, branch, batch_year, record_id, designation, company_name, like_count, comment_count';

/** The Home feed, newest first, with whether `viewerId` has liked each post. */
export async function getFeed({
  viewerId,
  cursor,
  authorId,
  postId,
  limit = 15,
}: {
  viewerId: string;
  cursor?: string;
  authorId?: string;
  postId?: string;
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

  const after = parseFeedCursor(cursor);
  if (after) {
    // Quoted: timestamps carry dots, colons and "+", which the or() syntax would misread.
    const t = `"${after.createdAt}"`;
    query = query.or(`created_at.lt.${t},and(created_at.eq.${t},id.lt.${after.id})`);
  }

  const { data, error } = await query;
  if (error || !data) return { items: [], next: null };
  const rows = data.slice(0, limit) as any[];

  const liked = new Set<string>();
  if (rows.length) {
    const { data: likes } = await db
      .from('post_likes')
      .select('post_id')
      .eq('user_id', viewerId)
      .in('post_id', rows.map((r) => r.id));
    for (const l of likes ?? []) liked.add(l.post_id);
  }

  const items: FeedPost[] = rows.map(({ image_path, ...r }) => ({
    ...r,
    image_url: postImageUrl(image_path),
    liked_by_me: liked.has(r.id),
  }));
  const last = items[items.length - 1];
  return { items, next: data.length > limit && last ? `${last.created_at}_${last.id}` : null };
}

/** One post, as a shared link opens it. */
export async function getPost(id: string, viewerId: string): Promise<FeedPost | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { items } = await getFeed({ viewerId, postId: id, limit: 1 });
  return items[0] ?? null;
}

/** The path a post is shared at; it works for every signed-in member. */
export const postPath = (id: string) => `/posts/${id}`;

/** A post's comments, oldest first, as a thread reads. */
export async function getComments(postId: string): Promise<PostComment[]> {
  const db = createAdminClient();
  const { data, error } = await db
    .from('post_comments')
    .select('id, post_id, author_id, body, created_at, author:users!post_comments_author_id_fkey(full_name, role)')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error || !data) return [];
  return data.map(({ author, ...c }: any) => {
    const a = Array.isArray(author) ? author[0] : author;
    return { ...c, full_name: a?.full_name ?? 'Member', role: a?.role ?? 'student' };
  });
}

/** How many posts an author has written — for the profile card. */
export async function countPostsBy(authorId: string): Promise<number> {
  const db = createAdminClient();
  const { count } = await db.from('posts').select('id', { count: 'exact', head: true }).eq('author_id', authorId);
  return count ?? 0;
}
