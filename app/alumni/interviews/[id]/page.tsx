import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, Briefcase, CalendarClock, MessageSquareReply, ShieldOff, User } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import {
  RECOMMENDATION_LABEL,
  averageRating,
  getInterview,
  getProctorEvents,
  getScorecards,
  getSubmissions,
  panelCandidates,
  summariesByRound,
} from '@/lib/interviews';
import { formatDateTime, formatFullDateTime, formatTime } from '@/lib/format';
import { DashboardShell } from '@/components/dashboard/shell';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MemberAvatar } from '@/components/patterns';
import { DecisionPill, OutcomePill, RoundStatusPill } from '@/components/interviews/pills';
import { KIND_ICON } from '@/components/interviews/interview-list';
import { AddRoundDialog, DecisionPanel, RoundActions, ScorecardForm } from '@/components/interviews/staff-controls';
import { IntegritySummaryCard, ProctorTimeline } from '@/components/interviews/proctor-report';
import { LiveFlags } from '@/components/interviews/live-flags';
import { McqReview } from '@/components/interviews/interviewer-room';

export const metadata = { title: 'Interview' };
export const dynamic = 'force-dynamic';

const REQUEST_LABEL: Record<string, string> = {
  mentorship: 'Mentorship',
  mock_interview: 'Mock interview',
  referral: 'Referral',
  internship: 'Internship',
};

export default async function AlumniInterviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(['alumni']);
  const hit = await getInterview(id, user);
  if (!hit) notFound();
  if (hit.viewer === 'candidate') redirect(`/student/interviews/${id}`);
  const { interview: iv, viewer } = hit;
  const isOwner = viewer === 'owner';
  const roundIds = iv.rounds.map((r) => r.id);

  const [badges, scorecards, submissions, events, panel] = await Promise.all([
    getNavBadges(user),
    getScorecards(roundIds),
    getSubmissions(roundIds),
    getProctorEvents(roundIds),
    isOwner ? panelCandidates(user.id) : Promise.resolve([]),
  ]);
  const summaries = summariesByRound(events);
  const candidateName = iv.candidate?.full_name ?? 'Candidate';

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title={iv.title}
      description={[candidateName, iv.company].filter(Boolean).join(' · ')}
      actions={
        <Button variant="outline" className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/interviews" />}>
          <ArrowLeft className="size-4" />
          All interviews
        </Button>
      }
    >
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          {iv.status === 'cancelled' && (
            <p className="rounded-lg bg-muted px-4 py-3 text-sm text-muted-foreground">This interview was withdrawn. Upcoming rounds were cancelled.</p>
          )}

          {iv.rounds.map((round) => {
            const Icon = KIND_ICON[round.kind];
            const cards = scorecards.filter((s) => s.round_id === round.id);
            const mine = cards.find((s) => s.reviewer_id === user.id) ?? null;
            const submission = submissions.find((s) => s.round_id === round.id);
            const summary = summaries.get(round.id);
            const roundEvents = events.filter((e) => e.round_id === round.id);
            const canEdit = isOwner || round.interviewer_id === user.id;
            const started = round.status !== 'scheduled' && round.status !== 'cancelled';

            return (
              <Card key={round.id} className="gap-0 p-0">
                <div className="flex flex-col gap-3 border-b border-border px-5 py-4">
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
                        {formatDateTime(round.scheduled_at)} · {round.duration_min} min · {round.interviewer_name}
                        {round.interviewer_id === user.id ? ' (you)' : ''}
                        {!round.proctored && ' · not proctored'}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <RoundStatusPill status={round.status} />
                      {(round.status === 'completed' || round.status === 'no_show') && <OutcomePill outcome={round.outcome} />}
                      {round.released_at && <span className="text-[11px] text-muted-foreground">shared</span>}
                    </div>
                  </div>

                  {round.status === 'scheduled' && (
                    <p className="flex items-start gap-1.5 text-xs">
                      <MessageSquareReply className="mt-px size-3.5 shrink-0 text-muted-foreground" />
                      {round.candidate_response === 'accepted' ? (
                        <span className="text-[var(--success)]">{candidateName.split(' ')[0]} accepted this time.</span>
                      ) : round.candidate_response === 'reschedule_requested' ? (
                        <span className="text-[var(--warning)]">
                          Asked for another time{round.reschedule_note ? `: “${round.reschedule_note}”` : '.'}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Waiting for {candidateName.split(' ')[0]} to accept.</span>
                      )}
                    </p>
                  )}

                  <RoundActions
                    interviewId={iv.id}
                    roomHref={`/alumni/interviews/${iv.id}/rounds/${round.id}`}
                    isOwner={isOwner}
                    canEdit={canEdit}
                    round={{
                      id: round.id,
                      title: round.title,
                      kind: round.kind,
                      status: round.status,
                      outcome: round.outcome,
                      scheduled_at: round.scheduled_at,
                      duration_min: round.duration_min,
                      proctored: round.proctored,
                      released_at: round.released_at,
                      content: round.content,
                    }}
                  />
                </div>

                <div className="space-y-5 px-5 py-4">
                  {round.status === 'in_progress' && round.proctored && (
                    <section>
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Live proctoring</h3>
                      <LiveFlags interviewId={iv.id} roundId={round.id} compact announce={false} />
                    </section>
                  )}

                  {round.kind !== 'video' && (
                    <section>
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {round.kind === 'coding' ? 'Submission' : 'Answers'}
                        {submission?.submitted_at && <span className="ml-2 normal-case tracking-normal">submitted {formatTime(submission.submitted_at)}</span>}
                        {submission?.score != null && (
                          <span className="tnum ml-2 rounded-full bg-muted px-2 py-0.5 normal-case tracking-normal text-foreground">
                            {submission.score} / {submission.max_score}
                          </span>
                        )}
                      </h3>
                      {!submission ? (
                        <p className="text-xs text-muted-foreground">Nothing submitted yet.</p>
                      ) : round.kind === 'coding' ? (
                        <details className="group rounded-lg bg-muted">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                            {submission.language ?? 'code'} · {(submission.code ?? '').split('\n').length} lines
                            {!submission.submitted_at && ' · draft'}
                          </summary>
                          <pre className="scrollbar-thin max-h-96 overflow-auto whitespace-pre px-3 pb-3 font-mono text-xs leading-5">{submission.code}</pre>
                        </details>
                      ) : (
                        <details className="rounded-lg bg-muted">
                          <summary className="cursor-pointer px-3 py-2 text-xs font-medium">
                            {Object.keys(submission.answers ?? {}).length} of {round.content.questions?.length ?? 0} answered
                          </summary>
                          <McqReview questions={round.content.questions ?? []} answers={submission.answers ?? {}} />
                        </details>
                      )}
                    </section>
                  )}

                  {round.proctored && started && (
                    <section>
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Proctoring report</h3>
                      {summary ? (
                        <>
                          <IntegritySummaryCard summary={summary} />
                          <details className="mt-3">
                            <summary className="cursor-pointer text-xs font-medium text-primary">Timeline ({roundEvents.length} events)</summary>
                            <div className="mt-2">
                              <ProctorTimeline events={roundEvents} />
                            </div>
                          </details>
                        </>
                      ) : (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <ShieldOff className="size-3.5" /> No monitoring data — the candidate did not start this round in their browser.
                        </p>
                      )}
                    </section>
                  )}

                  {started && (
                    <section>
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Scorecards</h3>
                      {cards.filter((c) => c.reviewer_id !== user.id).map((c) => (
                        <div key={c.id} className="mb-3 rounded-lg border border-border p-3">
                          <p className="text-xs font-medium">
                            {c.reviewer_name}
                            {c.recommendation && <span className="ml-2 text-muted-foreground">{RECOMMENDATION_LABEL[c.recommendation]}</span>}
                            {averageRating(c.ratings) !== null && <span className="tnum ml-2 text-muted-foreground">avg {averageRating(c.ratings)}</span>}
                          </p>
                          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                            {Object.entries(c.ratings).map(([k, v]) => (
                              <li key={k}>
                                {k}: <span className="tnum font-medium text-foreground">{v}</span>
                              </li>
                            ))}
                          </ul>
                          {c.notes && <p className="mt-2 whitespace-pre-wrap text-xs">{c.notes}</p>}
                          {c.feedback && <p className="mt-1 whitespace-pre-wrap text-xs text-muted-foreground">To candidate: {c.feedback}</p>}
                        </div>
                      ))}
                      <ScorecardForm
                        interviewId={iv.id}
                        roundId={round.id}
                        kind={round.kind}
                        initial={mine ? { ratings: mine.ratings, recommendation: mine.recommendation, notes: mine.notes, feedback: mine.feedback } : null}
                      />
                    </section>
                  )}
                </div>
              </Card>
            );
          })}

          {isOwner && iv.status !== 'cancelled' && iv.rounds.length < 8 && (
            <AddRoundDialog
              interviewId={iv.id}
              selfId={user.id}
              people={[{ id: user.id, full_name: `${user.full_name} (you)` }, ...panel.map((p) => ({ id: p.id, full_name: p.full_name }))]}
            />
          )}
        </div>

        <aside className="space-y-4 lg:sticky lg:top-4">
          <Card className="gap-3 p-4">
            <div className="flex items-center gap-3">
              <MemberAvatar name={candidateName} url={iv.candidate?.avatar_url} size="lg" />
              <div className="min-w-0">
                <Link href={`/alumni/people/${iv.candidate_id}`} className="block truncate text-sm font-semibold hover:underline">
                  {candidateName}
                </Link>
                <p className="line-clamp-2 text-xs text-muted-foreground">{iv.candidate?.headline}</p>
              </div>
            </div>
            <dl className="space-y-1.5 text-xs">
              {iv.opportunity && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Briefcase className="size-3.5 shrink-0" />
                  <span className="truncate">{iv.opportunity.title}</span>
                </div>
              )}
              {iv.request && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="size-3.5 shrink-0" />
                  {REQUEST_LABEL[iv.request.type] ?? iv.request.type} request
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <CalendarClock className="size-3.5 shrink-0" />
                Created {formatFullDateTime(iv.created_at)}
              </div>
              {!isOwner && iv.owner && <div className="text-muted-foreground">Run by {iv.owner.full_name}</div>}
            </dl>
            {iv.description && <p className="whitespace-pre-wrap border-t border-border pt-3 text-xs leading-relaxed">{iv.description}</p>}
          </Card>

          <Card className="gap-3 p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Decision</h2>
              <DecisionPill decision={iv.decision} />
            </div>
            {isOwner ? (
              <DecisionPanel
                interviewId={iv.id}
                decision={iv.decision}
                note={iv.decision_note}
                releasedAt={iv.decision_released_at}
                status={iv.status}
              />
            ) : (
              <p className="text-xs text-muted-foreground">{iv.owner?.full_name ?? 'The owner'} records the decision.</p>
            )}
          </Card>
        </aside>
      </div>
    </DashboardShell>
  );
}
