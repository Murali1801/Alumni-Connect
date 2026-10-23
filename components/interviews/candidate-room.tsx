'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Camera, CameraOff, CheckCircle2, Clock, Loader2, Maximize, ScanEye, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { VideoRoom } from '@/components/call/video-room';
import { ConsentScreen } from '@/components/interviews/consent-screen';
import { useProctor, type ProctorState } from '@/components/interviews/use-proctor';
import { CodingWorkspace, McqWorkspace, type DraftSubmission } from '@/components/interviews/workspaces';
import type { McqQuestion, RoundKind } from '@/lib/interview-logic';

export type CandidateRoundView = {
  id: string;
  title: string;
  kind: RoundKind;
  scheduled_at: string;
  duration_min: number;
  interviewer_id: string;
  interviewer_name: string;
  proctored: boolean;
  room_id: string;
  started_at: string | null;
  content: { problem?: string; language?: string; starter?: string; instructions?: string; questions?: McqQuestion[] };
};

/**
 * The candidate's side of a round: consent first (for a proctored round), then
 * the call, the coding problem or the questions, with the proctoring layer
 * running underneath and its state shown along the top.
 */
export function CandidateRoom({
  interviewId,
  interviewTitle,
  round,
  selfId,
  selfName,
  backHref,
  initialSubmission,
}: {
  interviewId: string;
  interviewTitle: string;
  round: CandidateRoundView;
  selfId: string;
  selfName: string;
  backHref: string;
  initialSubmission: DraftSubmission | null;
}) {
  const router = useRouter();
  const [phase, setPhase] = React.useState<'consent' | 'live' | 'done'>(round.proctored ? 'consent' : 'live');
  const [callStream, setCallStream] = React.useState<MediaStream | null>(null);
  const [callCamOn, setCallCamOn] = React.useState<boolean | undefined>(undefined);

  const proctor = useProctor({
    interviewId,
    roundId: round.id,
    ownCamera: round.kind !== 'video',
    externalStream: callStream,
    externalCameraOn: callCamOn,
  });

  const accept = () => {
    // Full screen must be asked for inside the click, before anything awaits.
    proctor.requestFullscreen();
    setPhase('live');
    void proctor.start();
  };

  const finish = React.useCallback(
    async (reason: string) => {
      if (round.proctored) await proctor.stop(reason);
      setPhase('done');
      router.refresh();
    },
    [proctor, round.proctored, router]
  );

  const onLocalMedia = React.useCallback((stream: MediaStream | null, camOn: boolean) => {
    setCallStream(stream);
    setCallCamOn(camOn);
  }, []);

  if (phase === 'consent') {
    return (
      <ConsentScreen
        title={`${round.title} · ${interviewTitle}`}
        kind={round.kind}
        interviewerName={round.interviewer_name}
        backHref={backHref}
        onAccept={accept}
        onDecline={() => void proctor.decline()}
      />
    );
  }

  if (phase === 'done' && round.kind !== 'video') {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-[color-mix(in_oklch,var(--success),transparent_85%)] text-[var(--success)]">
          <CheckCircle2 className="size-6" />
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-2xl">Submitted</h1>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            {round.interviewer_name} will review your work. You will see the result on the interview page once they
            share it.
          </p>
        </div>
        <Button render={<Link href={backHref} />}>Back to the interview</Button>
      </div>
    );
  }

  const live = round.proctored && proctor.state.active;
  const needsFullscreen = live && proctor.state.fullscreenSupported && !proctor.state.fullscreen;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {round.proctored && <ProctorBar state={proctor.state} onFullscreen={proctor.requestFullscreen} />}

      <div className="relative min-h-0 flex-1">
        {round.kind === 'video' ? (
          <VideoRoom
            fill
            persistChat={false}
            roomId={round.room_id}
            title={`${round.title} · ${interviewTitle}`}
            selfId={selfId}
            selfName={selfName}
            hostId={round.interviewer_id}
            hostName={round.interviewer_name}
            guestId={selfId}
            guestName={selfName}
            backHref={backHref}
            scheduledAt={round.scheduled_at}
            durationMin={round.duration_min}
            onLocalMedia={onLocalMedia}
            onEnded={() => void finish('left the call')}
          />
        ) : round.kind === 'coding' ? (
          <CodingWorkspace
            interviewId={interviewId}
            round={round}
            initial={initialSubmission}
            preview={proctor.ownStream}
            onSubmitted={() => void finish('submitted')}
          />
        ) : (
          <McqWorkspace
            interviewId={interviewId}
            round={round}
            initial={initialSubmission}
            preview={proctor.ownStream}
            onSubmitted={() => void finish('submitted')}
          />
        )}

        {needsFullscreen && round.kind !== 'video' && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-background/95 px-6 text-center">
            <Maximize className="size-6 text-muted-foreground" />
            <h2 className="font-display text-xl">Return to full screen to continue</h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Leaving full screen has been logged. Your work is saved; nothing is lost.
            </p>
            <Button onClick={proctor.requestFullscreen}>
              <Maximize className="size-4" />
              Back to full screen
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** What the monitoring is doing right now, so the candidate is never guessing. */
function ProctorBar({ state, onFullscreen }: { state: ProctorState; onFullscreen: () => void }) {
  const camera =
    state.camera === 'on'
      ? { label: 'Camera on', tone: 'ok' as const, icon: Camera }
      : state.camera === 'idle'
        ? { label: 'Camera starting', tone: 'idle' as const, icon: Camera }
        : { label: state.camera === 'off' ? 'Camera off' : 'Camera blocked', tone: 'bad' as const, icon: CameraOff };
  const vision =
    state.vision === 'running'
      ? { label: 'Camera check running', tone: 'ok' as const }
      : state.vision === 'loading'
        ? { label: 'Loading camera check', tone: 'idle' as const }
        : state.vision === 'unavailable'
          ? { label: 'Camera check unavailable', tone: 'idle' as const }
          : { label: 'Camera check waiting', tone: 'idle' as const };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2 text-xs">
      <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
        <ShieldCheck className="size-3.5 text-primary" />
        {state.active ? 'Monitoring on' : 'Monitoring stopped'}
      </span>
      <Chip tone={state.fullscreen ? 'ok' : state.fullscreenSupported ? 'bad' : 'idle'}>
        <Maximize className="size-3" />
        {state.fullscreen ? 'Full screen' : state.fullscreenSupported ? 'Not full screen' : 'Full screen not supported'}
      </Chip>
      <Chip tone={camera.tone}>
        <camera.icon className="size-3" />
        {camera.label}
      </Chip>
      <Chip tone={vision.tone}>
        {state.vision === 'loading' ? <Loader2 className="size-3 animate-spin" /> : <ScanEye className="size-3" />}
        {vision.label}
      </Chip>
      {state.displays === 'multiple' && <Chip tone="bad">More than one display</Chip>}
      <span className="ml-auto inline-flex items-center gap-2 text-muted-foreground">
        <Clock className="size-3" />
        <span className="tnum">{state.flagsLogged}</span> events flagged
        {state.active && state.fullscreenSupported && !state.fullscreen && (
          <Button size="xs" variant="outline" onClick={onFullscreen}>
            Full screen
          </Button>
        )}
      </span>
    </div>
  );
}

function Chip({ tone, children }: { tone: 'ok' | 'bad' | 'idle'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-medium',
        tone === 'ok' && 'bg-[color-mix(in_oklch,var(--success),transparent_88%)] text-[var(--success)]',
        tone === 'bad' && 'bg-destructive/10 text-destructive',
        tone === 'idle' && 'bg-muted text-muted-foreground'
      )}
    >
      {children}
    </span>
  );
}
