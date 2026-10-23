'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, EyeOff, Maximize, ShieldCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { RoundKind } from '@/lib/interview-logic';

/**
 * What the candidate agrees to before a proctored round. The list is the
 * whole of what the proctoring layer does — if a check is added to
 * use-proctor.ts, it is added here too.
 */
const MONITORED = [
  'Switching to another tab or app, minimising the window, and how long you were away.',
  'Leaving full screen. The round asks for full screen when it starts.',
  'Copy, cut and paste (the fact and the number of characters pasted, never the text), and opening the right-click menu.',
  'Whether more than one display is connected, where your browser reports it. You will not be asked for extra permission for this.',
  'Your camera being turned off, blocked or disconnected.',
  'Every two seconds, a small still from your camera is checked on this device for how many people are in view and whether a mobile phone is visible.',
];

const NOT_DONE = [
  'No video, audio or images are recorded or uploaded by the monitoring. Only a list of events with times is sent.',
  'It cannot see anything outside the camera’s view — a phone held below the desk, notes on a wall, or someone off-camera.',
  'It cannot detect Bluetooth devices, smart watches, earphones, or other devices and networks around you.',
  'It does not read your screen, other tabs, your files or your keystrokes.',
  'It does not decide anything. Your interviewer sees the events and judges them; a flag is not a verdict.',
];

export function ConsentScreen({
  title,
  kind,
  interviewerName,
  backHref,
  onAccept,
  onDecline,
  busy,
}: {
  title: string;
  kind: RoundKind;
  interviewerName: string;
  backHref: string;
  /** Called from the click itself, so full screen can be requested in the same gesture. */
  onAccept: () => void;
  onDecline: () => void;
  busy?: boolean;
}) {
  const [agreed, setAgreed] = React.useState(false);
  const [declined, setDeclined] = React.useState(false);

  if (declined) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-muted">
          <X className="size-5 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <h1 className="font-display text-2xl">You have not started this round</h1>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            This round is proctored, so it cannot start without your agreement. {interviewerName} can see that you
            chose not to continue. If you have a reason — an accessibility need, a shared room — message them to
            arrange an alternative.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setDeclined(false)}>
            Review again
          </Button>
          <Button render={<Link href={backHref} />}>Back to the interview</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="space-y-2">
          <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="size-5" />
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Proctored {kind === 'video' ? 'video' : kind === 'coding' ? 'coding' : 'MCQ'} round
          </p>
          <h1 className="font-display text-2xl leading-tight sm:text-3xl">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {interviewerName} has asked for this round to be monitored in your browser. Read what that means before
            you start. Monitoring begins only when you agree, and stops when you leave the round.
          </p>
        </div>

        <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
          <h2 className="mb-3 text-sm font-semibold">What is monitored</h2>
          <ul className="space-y-2.5">
            {MONITORED.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed">
                <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl bg-muted p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <EyeOff className="size-4 text-muted-foreground" />
            What it does not do, and cannot do
          </h2>
          <ul className="space-y-2.5">
            {NOT_DONE.map((item) => (
              <li key={item} className="flex gap-2.5 text-sm leading-relaxed text-muted-foreground">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-current" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Your interviewer sees each event with its time, and a summary after the round.
            {kind === 'video'
              ? ' They also see and hear you through the call itself, as in any video interview.'
              : ' The camera check needs your camera; it shows you a small preview so you know when it is on.'}
          </p>
        </section>

        <label className="flex cursor-pointer items-start gap-3 rounded-xl p-1 text-sm">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 accent-[var(--primary)]"
          />
          <span>I have read what is monitored and agree to it for this round.</span>
        </label>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={() => {
              setDeclined(true);
              onDecline();
            }}
          >
            I do not agree
          </Button>
          <Button disabled={!agreed || busy} onClick={onAccept} className="h-9 px-4">
            <Maximize className="size-4" />
            Agree and start in full screen
          </Button>
        </div>
      </div>
    </div>
  );
}
