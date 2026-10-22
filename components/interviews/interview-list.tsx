import Link from 'next/link';
import { CalendarClock, ClipboardList, Code2, ListChecks, Video } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { EmptyState, MemberAvatar } from '@/components/patterns';
import { DecisionPill, RoundStatusPill } from '@/components/interviews/pills';
import { formatDateTime } from '@/lib/format';
import type { Interview, Viewer } from '@/lib/interviews';
import type { RoundKind } from '@/lib/interview-logic';

export const KIND_ICON: Record<RoundKind, typeof Video> = { video: Video, coding: Code2, mcq: ListChecks };

function nextRound(iv: Interview) {
  return [...iv.rounds]
    .filter((r) => r.status === 'scheduled' || r.status === 'in_progress')
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())[0];
}

/**
 * Pipelines as cards: who, for what, where it stands, and the next round.
 * Active ones first, then finished and withdrawn.
 */
export function InterviewList({
  items,
  hrefFor,
  emptyAction,
  side,
}: {
  items: { interview: Interview; viewer: Viewer }[];
  hrefFor: (id: string) => string;
  emptyAction?: React.ReactNode;
  /** Whose name leads each card: the candidate (for interviewers) or the interviewer. */
  side: 'candidate' | 'interviewer';
}) {
  if (!items.length) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="No interviews yet"
        description={
          side === 'candidate'
            ? 'Start a pipeline for a student who has asked you for a referral, a mock interview or a role.'
            : 'When an alumnus invites you to interview, the rounds show up here.'
        }
        action={emptyAction}
      />
    );
  }

  const groups: { label: string; list: typeof items }[] = [
    { label: 'In progress', list: items.filter((i) => i.interview.status === 'active') },
    { label: 'Finished', list: items.filter((i) => i.interview.status === 'completed') },
    { label: 'Withdrawn', list: items.filter((i) => i.interview.status === 'cancelled') },
  ].filter((g) => g.list.length);

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <section key={g.label} aria-label={g.label} className="space-y-2">
          <h2 className="text-sm font-semibold text-foreground">
            {g.label} <span className="tnum text-muted-foreground">({g.list.length})</span>
          </h2>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {g.list.map(({ interview: iv, viewer }) => {
              const person = side === 'candidate' ? iv.candidate : iv.owner;
              const next = nextRound(iv);
              const done = iv.rounds.filter((r) => r.status === 'completed').length;
              const NextIcon = next ? KIND_ICON[next.kind] : CalendarClock;
              return (
                <li key={iv.id}>
                  <Link href={hrefFor(iv.id)} className="block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <Card className="h-full gap-3 p-4 transition-shadow hover:ring-foreground/20">
                      <div className="flex items-start gap-3">
                        <MemberAvatar name={person?.full_name ?? 'Member'} url={person?.avatar_url} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{iv.title}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {side === 'candidate' ? person?.full_name : `With ${person?.full_name ?? 'an alumnus'}`}
                            {iv.company ? ` · ${iv.company}` : ''}
                          </p>
                        </div>
                        {iv.decision !== 'pending' ? (
                          <DecisionPill decision={iv.decision} />
                        ) : viewer === 'panel' ? (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">Panel</span>
                        ) : null}
                      </div>

                      <ol className="flex gap-1" aria-label="Rounds">
                        {iv.rounds.map((r) => (
                          <li
                            key={r.id}
                            title={`${r.title}: ${r.status.replace('_', ' ')}`}
                            className={
                              'h-1.5 flex-1 rounded-full ' +
                              (r.status === 'completed'
                                ? r.outcome === 'failed'
                                  ? 'bg-destructive'
                                  : 'bg-[var(--success)]'
                                : r.status === 'in_progress'
                                  ? 'bg-[var(--warning)]'
                                  : r.status === 'scheduled'
                                    ? 'bg-primary/30'
                                    : 'bg-border')
                            }
                          />
                        ))}
                      </ol>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <NextIcon className="size-3.5 shrink-0" />
                        {next ? (
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium text-foreground">{next.title}</span> · {formatDateTime(next.scheduled_at)}
                          </span>
                        ) : (
                          <span className="min-w-0 flex-1 truncate">
                            {done} of {iv.rounds.length} round{iv.rounds.length === 1 ? '' : 's'} completed
                          </span>
                        )}
                        {next && <RoundStatusPill status={next.status} />}
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
