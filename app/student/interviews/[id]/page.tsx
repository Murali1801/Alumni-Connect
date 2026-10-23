import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Briefcase, MessageSquareReply, ShieldCheck } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { candidateCanJoin, getInterview, getReleasedFeedback, getSubmissions } from '@/lib/interviews';
import { formatDateTime, formatFullDateTime } from '@/lib/format';
import { DashboardShell } from '@/components/dashboard/shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MemberAvatar } from '@/components/patterns';
import { DecisionPill, OutcomePill, RoundStatusPill } from '@/components/interviews/pills';
import { KIND_ICON } from '@/components/interviews/interview-list';
import { CandidateRoundActions } from '@/components/interviews/candidate-actions';

export const metadata = { title: 'Interview' };
export const dynamic = 'force-dynamic';

const KIND_LABEL = { video: 'Video call', coding: 'Coding', mcq: 'Multiple choice' } as const;

export default async function StudentInterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(['student']);
  const hit = await getInterview(id, user);
  if (!hit) notFound();
  if (hit.viewer !== 'candidate') redirect('/student/interviews');
  const iv = hit.interview;

  const [badges, feedback, submissions] = await Promise.all([
    getNavBadges(user),
    getReleasedFeedback(iv.rounds),
    getSubmissions(iv.rounds.filter((r) => r.released_at).map((r) => r.id)),
  ]);
  const owner = iv.owner?.full_name ?? 'Your interviewer';

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title={iv.title}
      description={[`With ${owner}`, iv.company].filter(Boolean).join(' · ')}
      actions={
        <Button variant="outline" className="h-9 w-full px-4 sm:w-auto" render={<Link href="/student/interviews" />}>
          <ArrowLeft className="size-4" />
          All interviews
        </Button>
      }
    >
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-3">
          {iv.decision_released_at && (
            <Card className="gap-2 p-5">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Final decision</h2>
                <DecisionPill decision={iv.decision} />
              </div>
              {iv.decision_note && <p className="whitespace-pre-wrap text-sm leading-relaxed">{iv.decision_note}</p>}
              <p className="text-xs text-muted-foreground">Shared {formatFullDateTime(iv.decision_released_at)}</p>
            </Card>
          )}
          {iv.status === 'cancelled' && (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">{owner} withdrew this interview.</p>
          )}

          <ol className="space-y-3">
            {iv.rounds.map((round) => {
              const Icon = KIND_ICON[round.kind];
              const notes = feedback.get(round.id) ?? [];
              const sub = submissions.find((s) => s.round_id === round.id);
              return (
                <li key={round.id}>
                  <Card className="gap-3 p-5">
                    <div className="flex flex-wrap items-start gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <Icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <h2 className="text-sm font-semibold">
                          <span className="tnum text-muted-foreground">Round {round.position} · </span>
                          {round.title}
                        </h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {KIND_LABEL[round.kind]} · {formatDateTime(round.scheduled_at)} · {round.duration_min} min · {round.interviewer_name}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <RoundStatusPill status={round.status} />
                        {round.released_at && <OutcomePill outcome={round.outcome} />}
                      </div>
                    </div>

                    {round.proctored && (round.status === 'scheduled' || round.status === 'in_progress') && (
                      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <ShieldCheck className="mt-px size-3.5 shrink-0" />
                        Proctored: you will see exactly what is monitored and agree before it starts. Use a laptop
                        with a camera, in a quiet room on your own.
                      </p>
                    )}
                    {round.status === 'scheduled' && round.candidate_response === 'reschedule_requested' && (
                      <p className="flex items-start gap-1.5 text-xs text-[var(--warning)]">
                        <MessageSquareReply className="mt-px size-3.5 shrink-0" />
                        You asked for another time{round.reschedule_note ? `: “${round.reschedule_note}”` : '.'}
                      </p>
                    )}
                    {round.status === 'scheduled' && round.candidate_response === 'accepted' && (
                      <p className="text-xs text-[var(--success)]">You accepted this time.</p>
                    )}

                    <CandidateRoundActions
                      interviewId={iv.id}
                      initiallyOpen={candidateCanJoin(round)}
                      round={{
                        id: round.id,
                        kind: round.kind,
                        status: round.status,
                        scheduled_at: round.scheduled_at,
                        duration_min: round.duration_min,
                        candidate_response: round.candidate_response,
                      }}
                    />

                    {(round.status === 'completed' || round.status === 'no_show') && !round.released_at && (
                      <p className="text-xs text-muted-foreground">{round.interviewer_name.split(' ')[0]} has not shared the result yet.</p>
                    )}
                    {round.released_at && (
                      <div className="space-y-2 rounded-lg bg-muted p-3">
                        {sub?.score != null && (
                          <p className="text-xs">
                            Score <span className="tnum font-semibold">{sub.score} / {sub.max_score}</span>
                          </p>
                        )}
                        {notes.length ? (
                          notes.map((n, i) => (
                            <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
                              {n}
                            </p>
                          ))
                        ) : (
                          <p className="text-xs text-muted-foreground">No written feedback for this round.</p>
                        )}
                      </div>
                    )}
                  </Card>
                </li>
              );
            })}
          </ol>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-3">
              <MemberAvatar name={owner} url={iv.owner?.avatar_url} size="lg" />
              <div className="min-w-0">
                <Link href={`/student/people/${iv.interviewer_id}`} className="block truncate text-sm font-semibold hover:underline">
                  {owner}
                </Link>
                <p className="line-clamp-2 text-xs text-muted-foreground">{iv.owner?.headline}</p>
              </div>
            </div>
            {iv.opportunity && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Briefcase className="size-3.5 shrink-0" />
                <span className="truncate">{iv.opportunity.title}</span>
              </p>
            )}
            {iv.description && <p className="whitespace-pre-wrap border-t border-border pt-3 text-xs leading-relaxed">{iv.description}</p>}
            <Button size="sm" variant="outline" render={<Link href={`/student/messages?peer=${iv.interviewer_id}`} />}>
              Message {owner.split(' ')[0]}
            </Button>
          </Card>
        </aside>
      </div>
    </DashboardShell>
  );
}
