import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Direct messages between a student and an alumnus.
 *
 * Like scheduled calls, messages are rows in `engagement_events` with
 * `event_type = 'chat_message'` rather than a dedicated table, because the
 * deployed database is migration-locked for this build. Every read and write
 * goes through this module, so moving to a `messages` table later touches only
 * this file.
 *
 * A conversation exists only where an accepted request does — the acceptance is
 * the consent record, and it is re-checked on every send.
 */

export const CHAT_EVENT = 'chat_message';

export type ChatMessage = {
  id: string;
  thread_id: string;
  from_id: string;
  to_id: string;
  body: string;
  created_at: string;
};

export type Thread = {
  thread_id: string;
  peer: { id: string; full_name: string; role: string };
  lastMessage: ChatMessage | null;
  unread: number;
  requestType: string | null;
};

/** Deterministic id both participants compute identically. */
export function threadIdFor(a: string, b: string) {
  return [a, b].sort().join('__');
}

function toMessage(row: any): ChatMessage | null {
  const m = row.metadata;
  if (!m?.thread_id || !m?.body) return null;
  return {
    id: row.id,
    thread_id: String(m.thread_id),
    from_id: String(m.from_id ?? row.user_id),
    to_id: String(m.to_id ?? ''),
    body: String(m.body),
    created_at: row.created_at,
  };
}

/**
 * Whoever the viewer has an accepted request with, in either direction.
 * Returns a map of peer id to the request type that connected them.
 */
export async function connectionsFor(userId: string): Promise<Map<string, string>> {
  const db = createAdminClient();
  const { data } = await db
    .from('requests')
    .select('student_id, alumni_id, type, status')
    .or(`student_id.eq.${userId},alumni_id.eq.${userId}`)
    .eq('status', 'accepted');

  const peers = new Map<string, string>();
  for (const r of data ?? []) {
    const peer = r.student_id === userId ? r.alumni_id : r.student_id;
    if (peer !== userId && !peers.has(peer)) peers.set(peer, r.type);
  }
  return peers;
}

export async function canMessage(a: string, b: string): Promise<boolean> {
  const peers = await connectionsFor(a);
  return peers.has(b);
}

/** Every conversation the viewer can hold, newest activity first. */
export async function listThreads(userId: string): Promise<Thread[]> {
  const db = createAdminClient();
  const peers = await connectionsFor(userId);
  if (peers.size === 0) return [];

  const peerIds = [...peers.keys()];
  const { data: peopleRows } = await db
    .from('users')
    .select('id, full_name, role')
    .in('id', peerIds);
  const people = new Map((peopleRows ?? []).map((p: any) => [p.id, p]));

  const threadIds = peerIds.map((p) => threadIdFor(userId, p));
  const { data: rows } = await db
    .from('engagement_events')
    .select('id, user_id, metadata, created_at')
    .eq('event_type', CHAT_EVENT)
    .in('metadata->>thread_id', threadIds)
    .order('created_at', { ascending: false })
    .limit(1000);

  const latest = new Map<string, ChatMessage>();
  const unread = new Map<string, number>();
  for (const row of rows ?? []) {
    const m = toMessage(row);
    if (!m) continue;
    if (!latest.has(m.thread_id)) latest.set(m.thread_id, m);
    if (m.to_id === userId && !(row.metadata?.read_by ?? []).includes(userId)) {
      unread.set(m.thread_id, (unread.get(m.thread_id) ?? 0) + 1);
    }
  }

  return peerIds
    .map((peerId) => {
      const tid = threadIdFor(userId, peerId);
      const person = people.get(peerId);
      return {
        thread_id: tid,
        peer: {
          id: peerId,
          full_name: person?.full_name ?? 'Unknown',
          role: person?.role ?? 'student',
        },
        lastMessage: latest.get(tid) ?? null,
        unread: unread.get(tid) ?? 0,
        requestType: peers.get(peerId) ?? null,
      };
    })
    .sort((a, b) => {
      const at = a.lastMessage ? new Date(a.lastMessage.created_at).getTime() : 0;
      const bt = b.lastMessage ? new Date(b.lastMessage.created_at).getTime() : 0;
      return bt - at;
    });
}

/** Full history for one conversation, oldest first. */
export async function listMessages(userId: string, peerId: string): Promise<ChatMessage[]> {
  if (!(await canMessage(userId, peerId))) return [];

  const db = createAdminClient();
  const { data } = await db
    .from('engagement_events')
    .select('id, user_id, metadata, created_at')
    .eq('event_type', CHAT_EVENT)
    .eq('metadata->>thread_id', threadIdFor(userId, peerId))
    .order('created_at', { ascending: true })
    .limit(500);

  return (data ?? []).map(toMessage).filter((m): m is ChatMessage => m !== null);
}

export async function sendMessage(
  fromId: string,
  toId: string,
  body: string
): Promise<ChatMessage> {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('Message is empty.');
  if (trimmed.length > 2000) throw new Error('Messages are limited to 2000 characters.');
  if (!(await canMessage(fromId, toId))) {
    throw new Error('You can only message someone who has accepted a request.');
  }

  const db = createAdminClient();
  const thread_id = threadIdFor(fromId, toId);
  const { data, error } = await db
    .from('engagement_events')
    .insert({
      user_id: fromId,
      event_type: CHAT_EVENT,
      metadata: { thread_id, from_id: fromId, to_id: toId, body: trimmed, read_by: [fromId] },
    })
    .select('id, user_id, metadata, created_at')
    .single();

  if (error) throw new Error(`Could not send the message: ${error.message}`);
  const message = toMessage(data);
  if (!message) throw new Error('Message was stored but could not be read back.');
  return message;
}

/** Count of messages addressed to the viewer that they have not opened. */
export async function unreadCount(userId: string): Promise<number> {
  const threads = await listThreads(userId);
  return threads.reduce((sum, t) => sum + t.unread, 0);
}

/** Mark everything the peer sent in this thread as read. */
export async function markThreadRead(userId: string, peerId: string): Promise<void> {
  const db = createAdminClient();
  const thread_id = threadIdFor(userId, peerId);

  const { data } = await db
    .from('engagement_events')
    .select('id, metadata')
    .eq('event_type', CHAT_EVENT)
    .eq('metadata->>thread_id', thread_id)
    .eq('metadata->>to_id', userId)
    .limit(500);

  for (const row of data ?? []) {
    const readBy: string[] = row.metadata?.read_by ?? [];
    if (readBy.includes(userId)) continue;
    await db
      .from('engagement_events')
      .update({ metadata: { ...row.metadata, read_by: [...readBy, userId] } })
      .eq('id', row.id);
  }
}
