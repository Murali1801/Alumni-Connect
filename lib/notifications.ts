import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMemberCards, type MemberCard } from '@/lib/network';
import type { Role } from '@/lib/session';

/* ------------------------------------------------------------------ */
/* Notifications: written by database triggers, read here              */
/* ------------------------------------------------------------------ */

export type NotificationGroup = 'all' | 'posts' | 'network' | 'requests';

const GROUP_TYPES: Record<Exclude<NotificationGroup, 'all'>, string[]> = {
  posts: ['post_like', 'post_comment', 'mention', 'repost'],
  network: ['connection_request', 'connection_accepted', 'endorsement', 'profile_view'],
  requests: ['request_received', 'request_responded', 'interview_scheduled', 'interview_result'],
};

export type NotificationItem = {
  id: string;
  type: string;
  created_at: string;
  read: boolean;
  actor: MemberCard | null;
  /** One line, plain text, e.g. 'commented on your post: "Congrats!"'. */
  text: string;
  /** Where clicking it goes. */
  href: string;
  /** A short quote of the post it is about, if any. */
  excerpt: string | null;
};

const REQUEST_LABEL: Record<string, string> = {
  mentorship: 'mentorship',
  mock_interview: 'mock interview',
  referral: 'referral',
  internship: 'internship',
};

/** The sentence and link for one notification, from its type and data. */
export function describe(
  n: { type: string; post_id: string | null; data: Record<string, any> },
  role: Exclude<Role, 'admin'>,
  actorId: string | null
): { text: string; href: string } {
  const p = `/${role}`;
  const post = n.post_id ? `/posts/${n.post_id}` : `${p}/home`;
  const profile = actorId ? `${p}/people/${actorId}` : `${p}/network`;
  const req = REQUEST_LABEL[n.data?.request_type] ?? 'request';
  switch (n.type) {
    case 'post_like':
      return { text: 'reacted to your post', href: post };
    case 'post_comment':
      return { text: n.data?.excerpt ? `commented on your post: “${n.data.excerpt}”` : 'commented on your post', href: post };
    case 'mention':
      return { text: 'mentioned you', href: post };
    case 'repost':
      return { text: 'reposted your post', href: post };
    case 'connection_request':
      return { text: 'wants to connect with you', href: `${p}/network` };
    case 'connection_accepted':
      return { text: 'accepted your invitation to connect', href: profile };
    case 'request_received':
      return { text: `sent you a ${req} request`, href: `${p}/requests` };
    case 'request_responded':
      return { text: `${n.data?.status === 'accepted' ? 'accepted' : 'declined'} your ${req} request`, href: `${p}/requests` };
    case 'endorsement':
      return { text: n.data?.skill ? `endorsed you for ${n.data.skill}` : 'endorsed one of your skills', href: profile };
    case 'profile_view':
      return { text: 'viewed your profile', href: profile };
    case 'interview_scheduled':
      return { text: n.data?.title ? `scheduled an interview round: ${n.data.title}` : 'scheduled an interview round', href: `${p}/interviews` };
    case 'interview_result':
      return { text: 'shared an interview result with you', href: `${p}/interviews` };
    default:
      return { text: 'has an update for you', href: `${p}/home` };
  }
}

/** A page of the member's notifications, newest first. */
export async function listNotifications(
  userId: string,
  role: Exclude<Role, 'admin'>,
  { group = 'all', limit = 40 }: { group?: NotificationGroup; limit?: number } = {}
): Promise<NotificationItem[]> {
  const db = createAdminClient();
  let query = db
    .from('notifications')
    .select('id, type, actor_id, post_id, data, read_at, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (group !== 'all') query = query.in('type', GROUP_TYPES[group]);
  const { data } = await query;
  const rows = data ?? [];

  const [actors, posts] = await Promise.all([
    getMemberCards(rows.map((r) => r.actor_id).filter(Boolean) as string[]),
    (async () => {
      const ids = [...new Set(rows.map((r) => r.post_id).filter(Boolean))] as string[];
      if (!ids.length) return new Map<string, string>();
      const { data: p } = await db.from('posts').select('id, body').in('id', ids);
      return new Map((p ?? []).map((x) => [x.id, x.body as string]));
    })(),
  ]);
  const actorBy = new Map(actors.map((a) => [a.id, a]));

  return rows.map((r) => {
    const { text, href } = describe({ type: r.type, post_id: r.post_id, data: r.data ?? {} }, role, r.actor_id);
    const body = r.post_id ? posts.get(r.post_id) : null;
    return {
      id: r.id,
      type: r.type,
      created_at: r.created_at,
      read: !!r.read_at,
      actor: r.actor_id ? (actorBy.get(r.actor_id) ?? null) : null,
      text,
      href,
      excerpt: body ? (body.length > 110 ? `${body.slice(0, 110).trimEnd()}…` : body) : null,
    };
  });
}

export async function countUnread(userId: string): Promise<number> {
  const db = createAdminClient();
  const { count } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null);
  return count ?? 0;
}

/** Mark some (or, with no ids, all) of the member's notifications read. */
export async function markRead(userId: string, ids?: string[]): Promise<void> {
  const db = createAdminClient();
  let query = db.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null);
  if (ids?.length) query = query.in('id', ids);
  await query;
}
