import Link from 'next/link';
import { Video, Clock, Users, ShieldCheck, Monitor, MessageSquare } from 'lucide-react';
import type { SessionView } from '@/components/calendar/calendar-view';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InitialsAvatar, StatusPill, EmptyState } from '@/components/patterns';

const CAPABILITIES = [
  { icon: Video, label: 'Two-way HD video and audio', body: 'Streams go straight between the two browsers — nothing is recorded or stored.' },
  { icon: Monitor, label: 'Screen sharing', body: 'Share a resume, an IDE or a slide deck without leaving the room.' },
  { icon: MessageSquare, label: 'In-room chat', body: 'The same thread as your Messages page — anything sent here is kept afterwards.' },
  { icon: ShieldCheck, label: 'Private by construction', body: 'Only the two people named on the session can open the room.' },
];

export function RoomsView({
  sessions,
  emptyAction,
  observerNote,
}: {
  sessions: SessionView[];
  emptyAction?: React.ReactNode;
  observerNote?: string;
}) {
  const now = Date.now();
  const active = sessions
    .filter((s) => s.status === 'scheduled')
    .map((s) => {
      const start = new Date(s.scheduled_at).getTime();
      const end = start + s.duration_min * 60_000;
      return { ...s, start, end, live: now >= start - 10 * 60_000 && now <= end };
    })
    .filter((s) => s.end > now)
    .sort((a, b) => a.start - b.start);

  return (
    <div className="space-y-4">
      {active.length === 0 ? (
        <EmptyState
          icon={Video}
          title="No open rooms"
          description="A video room is created automatically when a session is scheduled against an accepted request."
          action={emptyAction}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {active.map((s) => (
            <Card key={s.room_id} className="gap-0 p-5">
              <div className="flex items-start gap-3">
                <InitialsAvatar name={s.peer_name} size="md" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-foreground">{s.title}</h3>
                  <p className="truncate text-xs text-muted-foreground">{s.peer_name}</p>
                </div>
                {s.live ? (
                  <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                    Live
                  </span>
                ) : (
                  <StatusPill status="pending" className="shrink-0" />
                )}
              </div>

              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="size-3.5" />
                {new Date(s.scheduled_at).toLocaleString(undefined, {
                  weekday: 'short',
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                · {s.duration_min} min
              </p>

              {s.agenda && (
                <p className="mt-2 line-clamp-2 rounded-md bg-muted px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
                  {s.agenda}
                </p>
              )}

              {s.participant ? (
                <Button className="mt-4 w-full" variant={s.live ? 'default' : 'outline'} render={<Link href={`/call/${s.room_id}`} />}>
                  <Video className="size-4" />
                  {s.live ? 'Join now' : 'Open room'}
                </Button>
              ) : (
                <p className="mt-4 rounded-md bg-muted px-2.5 py-2 text-center text-xs text-muted-foreground">
                  {observerNote ?? 'You are not a participant in this session.'}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      <Card className="gap-0 p-5">
        <h2 className="mb-1 text-base font-semibold text-foreground">How the rooms work</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Peer-to-peer WebRTC in the browser. No plugin, no third-party meeting account, no recording.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {CAPABILITIES.map((c) => (
            <div key={c.label} className="flex gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <c.icon className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">{c.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          <Users className="mt-0.5 size-3.5 shrink-0" />
          Your browser will ask for camera and microphone permission the first time you open a room.
          On a restrictive corporate network the direct connection can fail — a home or mobile network
          is the usual fix.
        </p>
      </Card>
    </div>
  );
}
