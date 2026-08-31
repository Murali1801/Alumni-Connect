'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Video, CalendarDays, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InitialsAvatar, EmptyState } from '@/components/patterns';
import { formatDateTime, formatDayMonth, formatMonthYear, formatTime } from '@/lib/format';

export type SessionView = {
  room_id: string;
  title: string;
  scheduled_at: string;
  duration_min: number;
  status: 'scheduled' | 'cancelled' | 'completed';
  peer_name: string;
  agenda: string | null;
  /** False for the admin, who observes sessions but is not in them. */
  participant: boolean;
};

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Days rendered in the grid: the month plus enough padding for whole weeks. */
function monthGrid(month: Date) {
  const first = startOfMonth(month);
  // JS weeks start on Sunday; shift so Monday is column 0.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - lead);

  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

export function CalendarView({
  sessions,
  emptyAction,
}: {
  sessions: SessionView[];
  emptyAction?: React.ReactNode;
}) {
  const router = useRouter();
  const [month, setMonth] = React.useState(() => startOfMonth(new Date()));
  const [selected, setSelected] = React.useState<Date | null>(null);
  const [cancelling, setCancelling] = React.useState<string | null>(null);

  const today = new Date();
  const days = monthGrid(month);

  const byDay = React.useMemo(() => {
    const map = new Map<string, SessionView[]>();
    for (const s of sessions) {
      if (s.status === 'cancelled') continue;
      const d = new Date(s.scheduled_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return map;
  }, [sessions]);

  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const now = Date.now();
  const upcoming = sessions
    .filter((s) => s.status === 'scheduled' && new Date(s.scheduled_at).getTime() + s.duration_min * 60_000 > now)
    .sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
  const past = sessions
    .filter((s) => s.status !== 'scheduled' || new Date(s.scheduled_at).getTime() + s.duration_min * 60_000 <= now)
    .sort((a, b) => +new Date(b.scheduled_at) - +new Date(a.scheduled_at));

  const listed = selected ? (byDay.get(dayKey(selected)) ?? []) : upcoming;

  async function cancel(roomId: string) {
    setCancelling(roomId);
    try {
      const res = await fetch('/api/calls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, status: 'cancelled' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not cancel');
      toast.success('Session cancelled.');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCancelling(null);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Month grid */}
      <Card className="gap-0 p-5 lg:col-span-2">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-foreground">
            {formatMonthYear(month)}
          </h2>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Previous month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => {
                setMonth(startOfMonth(new Date()));
                setSelected(null);
              }}
            >
              Today
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              aria-label="Next month"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {d}
            </div>
          ))}
          {days.map((d) => {
            const inMonth = d.getMonth() === month.getMonth();
            const events = byDay.get(dayKey(d)) ?? [];
            const isToday = sameDay(d, today);
            const isSelected = selected && sameDay(d, selected);
            return (
              <button
                key={d.toISOString()}
                onClick={() => setSelected(isSelected ? null : d)}
                aria-label={`${d.toDateString()}, ${events.length} sessions`}
                aria-pressed={Boolean(isSelected)}
                className={cn(
                  'flex min-h-16 flex-col gap-1 rounded-lg border p-1.5 text-left transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/10'
                    : 'border-transparent hover:border-border hover:bg-muted',
                  !inMonth && 'opacity-35'
                )}
              >
                <span
                  className={cn(
                    'tnum inline-flex size-5 items-center justify-center rounded-full text-xs',
                    isToday ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground'
                  )}
                >
                  {d.getDate()}
                </span>
                <span className="flex flex-wrap gap-0.5">
                  {events.slice(0, 3).map((e) => (
                    <span key={e.room_id} className="size-1.5 rounded-full bg-primary" />
                  ))}
                  {events.length > 3 && (
                    <span className="tnum text-[9px] text-muted-foreground">+{events.length - 3}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Agenda */}
      <div className="space-y-4">
        <Card className="gap-0 p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-foreground">
              {selected
                ? formatDayMonth(selected)
                : 'Upcoming'}
            </h2>
            {selected && (
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>
                <X className="size-3.5" />
                Clear
              </Button>
            )}
          </div>

          {listed.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={selected ? 'Nothing on this day' : 'No sessions scheduled'}
              description={
                selected
                  ? 'Pick another day, or clear the selection to see what is coming up.'
                  : 'Sessions appear here once you schedule one from an accepted request.'
              }
              action={selected ? undefined : emptyAction}
            />
          ) : (
            <ul className="space-y-3">
              {listed.map((s) => (
                <SessionRow key={s.room_id} session={s} onCancel={cancel} cancelling={cancelling === s.room_id} />
              ))}
            </ul>
          )}
        </Card>

        {past.length > 0 && (
          <Card className="gap-0 p-5">
            <h2 className="mb-3 text-base font-semibold text-foreground">Past and cancelled</h2>
            <ul className="space-y-2">
              {past.slice(0, 6).map((s) => (
                <li key={s.room_id} className="flex items-center gap-2.5 text-sm">
                  <InitialsAvatar name={s.peer_name} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-foreground">{s.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDayMonth(s.scheduled_at)}{' '}
                      · {s.status}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

function SessionRow({
  session,
  onCancel,
  cancelling,
}: {
  session: SessionView;
  onCancel: (roomId: string) => void;
  cancelling: boolean;
}) {
  const start = new Date(session.scheduled_at);
  const end = new Date(start.getTime() + session.duration_min * 60_000);
  const live = Date.now() >= start.getTime() - 10 * 60_000 && Date.now() <= end.getTime();

  return (
    <li className="rounded-xl border border-border p-4">
      <div className="flex items-start gap-2.5">
        <InitialsAvatar name={session.peer_name} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{session.title}</p>
          <p className="truncate text-xs text-muted-foreground">with {session.peer_name}</p>
        </div>
        {live && (
          <span className="animate-pulse-ring rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            Live
          </span>
        )}
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        {formatDateTime(start)}{' '}
        –{' '}
        {formatTime(end)} ·{' '}
        {session.duration_min} min
      </p>

      {session.agenda && (
        <p className="mt-2 rounded-md bg-muted px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
          {session.agenda}
        </p>
      )}

      {session.participant && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" className="flex-1" render={<Link href={`/call/${session.room_id}`} />}>
            <Video className="size-3.5" />
            {live ? 'Join now' : 'Open room'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onCancel(session.room_id)}
            disabled={cancelling}
            aria-label="Cancel session"
          >
            {cancelling ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
          </Button>
        </div>
      )}
    </li>
  );
}
