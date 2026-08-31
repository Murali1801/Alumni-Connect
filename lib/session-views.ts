import 'server-only';
import type { CallSession } from '@/lib/calls';
import type { SessionView } from '@/components/calendar/calendar-view';

/**
 * Shape a stored session for the calendar. The "peer" is whoever the viewer is
 * not; the admin is never a participant, so they see both names and get no
 * join button.
 */
export function toSessionViews(calls: CallSession[], viewerId: string, isAdmin = false): SessionView[] {
  return calls.map((c) => {
    const participant = !isAdmin && (c.host_id === viewerId || c.guest_id === viewerId);
    return {
      room_id: c.room_id,
      title: c.title,
      scheduled_at: c.scheduled_at,
      duration_min: c.duration_min,
      status: c.status,
      peer_name: isAdmin
        ? `${c.host_name} · ${c.guest_name}`
        : c.host_id === viewerId
          ? c.guest_name
          : c.host_name,
      agenda: c.agenda,
      participant,
    };
  });
}
