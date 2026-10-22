'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Ticket, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorMessage, learningApi } from '@/components/learning/api';

/** Take or give back a workshop seat; shows the room link once seated. */
export function RsvpButton({
  workshopId,
  title,
  attending: initialAttending,
  full,
  cancelled,
  roomPath: initialRoom,
}: {
  workshopId: string;
  title: string;
  attending: boolean;
  full: boolean;
  cancelled: boolean;
  roomPath: string | null;
}) {
  const router = useRouter();
  const [attending, setAttending] = React.useState(initialAttending);
  const [room, setRoom] = React.useState(initialRoom);
  const [busy, setBusy] = React.useState(false);

  async function toggle() {
    if (attending && !window.confirm(`Give back your seat at “${title}”?`)) return;
    setBusy(true);
    try {
      const r = await learningApi<{ attending: boolean; room_path?: string | null }>(
        `/api/learning/workshops/${workshopId}/rsvp`,
        attending ? 'DELETE' : 'POST'
      );
      setAttending(r.attending);
      setRoom(r.attending ? (r.room_path ?? null) : null);
      toast.success(r.attending ? 'Seat saved. See you there.' : 'Seat given back.');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (cancelled) return <span className="text-xs font-medium text-destructive">Cancelled by the host</span>;

  const join = room ? (
    room.startsWith('/') ? (
      <Button size="sm" variant="outline" render={<Link href={room} />}>
        <Video /> Join
      </Button>
    ) : (
      <Button size="sm" variant="outline" render={<a href={room} target="_blank" rel="noopener noreferrer" />}>
        <Video /> Join
      </Button>
    )
  ) : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {attending ? (
        <Button size="sm" variant="secondary" onClick={toggle} disabled={busy} title="Click to give back your seat" aria-label={`Attending ${title}. Give back your seat`}>
          {busy ? <Loader2 className="animate-spin" /> : <Check />}
          Attending
        </Button>
      ) : (
        <Button size="sm" onClick={toggle} disabled={busy || full} aria-label={full ? `${title} is full` : `Reserve a seat at ${title}`}>
          {busy ? <Loader2 className="animate-spin" /> : <Ticket />}
          {full ? 'Full' : 'Reserve a seat'}
        </Button>
      )}
      {attending && join}
    </div>
  );
}
