'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, DoorOpen, Loader2, PanelRightClose, PanelRightOpen, ShieldOff, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { RoundStatusPill } from '@/components/interviews/pills';
import { VideoRoom } from '@/components/call/video-room';
import { LiveFlags } from '@/components/interviews/live-flags';
import { formatTime } from '@/lib/format';
import type { McqQuestion, RoundKind, RoundStatus } from '@/lib/interview-logic';

export type StaffRoundView = {
  id: string;
  title: string;
  kind: RoundKind;
  status: RoundStatus;
  scheduled_at: string;
  duration_min: number;
  interviewer_id: string;
  interviewer_name: string;
  proctored: boolean;
  room_id: string;
  content: { problem?: string; language?: string; questions?: McqQuestion[] };
};

type LiveSubmission = {
  code: string | null;
  language: string | null;
  answers: Record<string, number>;
  score: number | null;
  max_score: number | null;
  submitted_at: string | null;
  updated_at: string;
} | null;

export async function patchRound(interviewId: string, roundId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/interviews/${interviewId}/rounds/${roundId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Could not update the round.');
}

/** The interviewer's side: the call or the candidate's live work, beside the flags. */
export function InterviewerRoom({
  interviewId,
  interviewTitle,
  round,
  candidate,
  selfId,
  selfName,
  backHref,
}: {
  interviewId: string;
  interviewTitle: string;
  round: StaffRoundView;
  candidate: { id: string; name: string };
  selfId: string;
  selfName: string;
  backHref: string;
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState(round.status);
  const [busy, setBusy] = React.useState(false);
  const [panel, setPanel] = React.useState(true);

  async function move(next: RoundStatus) {
    setBusy(true);
    try {
      await patchRound(interviewId, round.id, { status: next });
      setStatus(next);
      if (next === 'completed') {
        toast.success('Round completed. Add your scorecard next.');
        router.push(backHref);
      } else if (next === 'in_progress') {
        toast.success(`${candidate.name.split(' ')[0]} can join now.`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background lg:flex-row">
      <div className="relative min-h-0 min-w-0 flex-1">
        {round.kind === 'video' ? (
          <VideoRoom
            fill
            persistChat={false}
            roomId={round.room_id}
            title={`${round.title} · ${candidate.name}`}
            selfId={selfId}
            selfName={selfName}
            hostId={round.interviewer_id}
            hostName={round.interviewer_name}
            guestId={candidate.id}
            guestName={candidate.name}
            backHref={backHref}
            scheduledAt={round.scheduled_at}
            durationMin={round.duration_min}
          />
        ) : (
          <LiveWork interviewId={interviewId} round={round} candidateName={candidate.name} backHref={backHref} />
        )}
        <Button
          size="icon-sm"
          variant="secondary"
          className="absolute right-3 top-3 z-10 hidden lg:inline-flex"
          onClick={() => setPanel((p) => !p)}
          aria-label={panel ? 'Hide the proctoring panel' : 'Show the proctoring panel'}
        >
          {panel ? <PanelRightClose className="size-4" /> : <PanelRightOpen className="size-4" />}
        </Button>
      </div>

      <aside
        className={cn(
          'scrollbar-thin max-h-[45%] shrink-0 overflow-y-auto border-t border-border bg-card p-4 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0',
          !panel && 'lg:hidden'
        )}
      >
        <div className="space-y-4">
          <div className="space-y-1">
            <Link href={backHref} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-3" /> {interviewTitle}
            </Link>
            <div className="flex items-center gap-2">
              <h2 className="min-w-0 flex-1 truncate text-sm font-semibold">{round.title}</h2>
              <RoundStatusPill status={status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {candidate.name} · {formatTime(round.scheduled_at)} · {round.duration_min} min
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {status === 'scheduled' && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => void move('in_progress')}>
                <DoorOpen className="size-3.5" />
                Let the candidate in now
              </Button>
            )}
            {(status === 'scheduled' || status === 'in_progress') && (
              <Button size="sm" disabled={busy} onClick={() => void move('completed')}>
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                End round
              </Button>
            )}
            {status === 'scheduled' && (
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void move('no_show')}>
                <X className="size-3.5" />
                No show
              </Button>
            )}
          </div>

          <div className="border-t border-border pt-4">
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Proctoring</h3>
            {round.proctored ? (
              <LiveFlags interviewId={interviewId} roundId={round.id} />
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldOff className="size-3.5" />
                This round is not proctored.
              </p>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

/** The candidate's code or answers, polled while they work. */
function LiveWork({
  interviewId,
  round,
  candidateName,
  backHref,
}: {
  interviewId: string;
  round: StaffRoundView;
  candidateName: string;
  backHref: string;
}) {
  const [sub, setSub] = React.useState<LiveSubmission>(null);
  const [loaded, setLoaded] = React.useState(false);

  React.useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const res = await fetch(`/api/interviews/${interviewId}/rounds/${round.id}/submission`, { cache: 'no-store' });
        if (res.ok && !stopped) {
          const next = (await res.json()) as LiveSubmission;
          setSub(next);
          setLoaded(true);
          if (next?.submitted_at) return;
        }
      } catch {
        /* the next poll will try again */
      }
      if (!stopped) timer = setTimeout(() => void poll(), 4000);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [interviewId, round.id]);

  const questions = round.content.questions ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <h1 className="text-sm font-semibold">
          {candidateName}’s {round.kind === 'coding' ? 'code' : 'answers'}
        </h1>
        <span className="text-xs text-muted-foreground">
          {!loaded
            ? 'Loading…'
            : sub?.submitted_at
              ? `Submitted at ${formatTime(sub.submitted_at)}`
              : sub
                ? `Live · last saved ${formatTime(sub.updated_at)}`
                : 'Nothing saved yet'}
        </span>
        {sub?.submitted_at && round.kind === 'mcq' && sub.score !== null && (
          <span className="tnum rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            Score {sub.score} / {sub.max_score}
          </span>
        )}
        <Button size="sm" variant="outline" className="ml-auto" render={<Link href={backHref} />}>
          Back to the interview
        </Button>
      </div>
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto">
        {round.kind === 'coding' ? (
          <div className="grid min-h-full lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section className="border-b border-border p-5 lg:border-b-0 lg:border-r">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Problem</p>
              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{round.content.problem}</div>
            </section>
            <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-6">
              {sub?.code || <span className="text-muted-foreground">{'// The candidate has not written anything yet.'}</span>}
            </pre>
          </div>
        ) : (
          <McqReview questions={questions} answers={sub?.answers ?? {}} />
        )}
      </div>
    </div>
  );
}

/** Questions with the candidate's pick and the key, for staff only. */
export function McqReview({ questions, answers }: { questions: McqQuestion[]; answers: Record<string, number> }) {
  return (
    <ol className="mx-auto max-w-2xl space-y-3 px-4 py-5">
      {questions.map((q, i) => {
        const picked = answers[q.id];
        return (
          <li key={q.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <p className="text-sm font-medium">
              <span className="tnum mr-2 text-muted-foreground">{i + 1}.</span>
              {q.prompt}
            </p>
            <ul className="mt-2 space-y-1">
              {q.options.map((opt, j) => (
                <li
                  key={j}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-2 py-1 text-sm',
                    j === q.answer && 'bg-[color-mix(in_oklch,var(--success),transparent_88%)]',
                    picked === j && j !== q.answer && 'bg-destructive/10'
                  )}
                >
                  <span className="w-16 shrink-0 text-[11px] text-muted-foreground">
                    {picked === j ? 'Picked' : ''}
                    {j === q.answer ? (picked === j ? ' · key' : 'Key') : ''}
                  </span>
                  {opt}
                </li>
              ))}
            </ul>
            {picked === undefined && <p className="mt-1 text-[11px] text-muted-foreground">Not answered</p>}
          </li>
        );
      })}
    </ol>
  );
}
