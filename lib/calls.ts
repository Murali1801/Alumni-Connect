import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Scheduled video sessions.
 *
 * These are stored as rows in `engagement_events` with `event_type =
 * 'call_session'` and the session payload in `metadata`, rather than in a
 * dedicated table. The trade-off is deliberate: the deployed database is
 * migration-locked for this build, and `engagement_events` is already the
 * append-only log every other behavioural record goes into. Every read and
 * write goes through this module, so moving to a `call_sessions` table later is
 * a change to this file only.
 *
 * Cancellation is an append too — a later `status: 'cancelled'` row for the same
 * `room_id` supersedes the original, so history stays intact.
 */

export const CALL_EVENT = 'call_session';

export type CallStatus = 'scheduled' | 'cancelled' | 'completed';

export type CallSession = {
  room_id: string;
  title: string;
  scheduled_at: string;
  duration_min: number;
  host_id: string;
  guest_id: string;
  host_name: string;
  guest_name: string;
  request_id: string | null;
  agenda: string | null;
  status: CallStatus;
  created_at: string;
};

type EventRow = {
  id: string;
  user_id: string;
  metadata: Record<string, any> | null;
  created_at: string;
};

function toSession(row: EventRow): CallSession | null {
  const m = row.metadata;
  if (!m?.room_id || !m?.scheduled_at) return null;
  return {
    room_id: String(m.room_id),
    title: String(m.title ?? 'Mentorship session'),
    scheduled_at: String(m.scheduled_at),
    duration_min: Number(m.duration_min ?? 30),
    host_id: String(m.host_id ?? row.user_id),
    guest_id: String(m.guest_id ?? ''),
    host_name: String(m.host_name ?? 'Host'),
    guest_name: String(m.guest_name ?? 'Guest'),
    request_id: m.request_id ? String(m.request_id) : null,
    agenda: m.agenda ? String(m.agenda) : null,
    status: (m.status ?? 'scheduled') as CallStatus,
    created_at: row.created_at,
  };
}

/**
 * Collapse the append-only rows into the current state of each room, keeping
 * only the newest row per `room_id`.
 */
function latestPerRoom(rows: EventRow[]): CallSession[] {
  const byRoom = new Map<string, CallSession>();
  const ordered = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
  for (const row of ordered) {
    const s = toSession(row);
    if (s) byRoom.set(s.room_id, s);
  }
  return [...byRoom.values()];
}

/** Every session where the user is host or guest, soonest first. */
export async function listCallsForUser(userId: string): Promise<CallSession[]> {
  const db = createAdminClient();
  const { data } = await db
    .from('engagement_events')
    .select('id, user_id, metadata, created_at')
    .eq('event_type', CALL_EVENT)
    .or(`metadata->>host_id.eq.${userId},metadata->>guest_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(500);

  return latestPerRoom((data ?? []) as EventRow[]).sort(
    (a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()
  );
}

/** All sessions across the network — admin view. */
export async function listAllCalls(limit = 300): Promise<CallSession[]> {
  const db = createAdminClient();
  const { data } = await db
    .from('engagement_events')
    .select('id, user_id, metadata, created_at')
    .eq('event_type', CALL_EVENT)
    .order('created_at', { ascending: false })
    .limit(limit);

  return latestPerRoom((data ?? []) as EventRow[]).sort(
    (a, b) => new Date(b.scheduled_at).getTime() - new Date(a.scheduled_at).getTime()
  );
}

export async function getCall(roomId: string): Promise<CallSession | null> {
  const db = createAdminClient();
  const { data } = await db
    .from('engagement_events')
    .select('id, user_id, metadata, created_at')
    .eq('event_type', CALL_EVENT)
    .eq('metadata->>room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(20);
  const [session] = latestPerRoom((data ?? []) as EventRow[]);
  return session ?? null;
}

export async function countUpcomingCalls(userId: string): Promise<number> {
  const now = Date.now();
  const sessions = await listCallsForUser(userId);
  return sessions.filter(
    (s) => s.status === 'scheduled' && new Date(s.scheduled_at).getTime() + s.duration_min * 60_000 > now
  ).length;
}

export type ScheduleInput = {
  actorId: string;
  hostId: string;
  guestId: string;
  hostName: string;
  guestName: string;
  title: string;
  scheduledAt: string;
  durationMin: number;
  requestId?: string | null;
  agenda?: string | null;
};

export async function scheduleCall(input: ScheduleInput): Promise<CallSession> {
  const db = createAdminClient();
  const roomId = crypto.randomUUID();
  const metadata = {
    room_id: roomId,
    title: input.title,
    scheduled_at: input.scheduledAt,
    duration_min: input.durationMin,
    host_id: input.hostId,
    guest_id: input.guestId,
    host_name: input.hostName,
    guest_name: input.guestName,
    request_id: input.requestId ?? null,
    agenda: input.agenda ?? null,
    status: 'scheduled' as CallStatus,
  };

  const { error } = await db
    .from('engagement_events')
    .insert({ user_id: input.actorId, event_type: CALL_EVENT, metadata });
  if (error) throw new Error(`Could not schedule the session: ${error.message}`);

  return { ...metadata, created_at: new Date().toISOString() };
}

/** Append a superseding row. Only a participant may change a session. */
export async function updateCallStatus(
  roomId: string,
  actorId: string,
  status: CallStatus
): Promise<CallSession> {
  const current = await getCall(roomId);
  if (!current) throw new Error('Session not found');
  if (current.host_id !== actorId && current.guest_id !== actorId) {
    throw new Error('You are not a participant in this session');
  }

  const db = createAdminClient();
  const metadata = { ...current, status, created_at: undefined };
  delete (metadata as any).created_at;

  const { error } = await db
    .from('engagement_events')
    .insert({ user_id: actorId, event_type: CALL_EVENT, metadata });
  if (error) throw new Error(`Could not update the session: ${error.message}`);
  return { ...current, status };
}
