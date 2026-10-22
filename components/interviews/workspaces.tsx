'use client';

import * as React from 'react';
import { Check, Loader2, Send, Timer } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { formatTime } from '@/lib/format';
import type { McqQuestion } from '@/lib/interview-logic';

export type DraftSubmission = {
  code: string | null;
  language: string | null;
  answers: Record<string, number>;
  submitted_at: string | null;
};

type WorkspaceRound = {
  id: string;
  title: string;
  duration_min: number;
  started_at: string | null;
  content: { problem?: string; language?: string; starter?: string; instructions?: string; questions?: McqQuestion[] };
};

const AUTOSAVE_MS = 1500;

async function save(interviewId: string, roundId: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/interviews/${interviewId}/rounds/${roundId}/submission`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Could not save.');
  return json as { saved_at: string };
}

/**
 * Debounced autosave plus an explicit submit, shared by both workspaces.
 * Saves are serialised so an older body can never land after a newer one.
 */
function useAutosave(interviewId: string, roundId: string, onSubmitted: () => void) {
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const pending = React.useRef<Record<string, unknown> | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const chain = React.useRef<Promise<void>>(Promise.resolve());
  const done = React.useRef(false);

  const flush = React.useCallback(() => {
    const body = pending.current;
    pending.current = null;
    if (!body || done.current) return chain.current;
    chain.current = chain.current.then(async () => {
      setSaving(true);
      try {
        const r = await save(interviewId, roundId, body);
        setSavedAt(r.saved_at);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setSaving(false);
      }
    });
    return chain.current;
  }, [interviewId, roundId]);

  const queue = React.useCallback(
    (body: Record<string, unknown>) => {
      pending.current = body;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), AUTOSAVE_MS);
    },
    [flush]
  );

  const submit = React.useCallback(
    async (body: Record<string, unknown>) => {
      if (done.current) return;
      if (timer.current) clearTimeout(timer.current);
      pending.current = null;
      setSubmitting(true);
      try {
        await chain.current;
        await save(interviewId, roundId, { ...body, final: true });
        done.current = true;
        onSubmitted();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setSubmitting(false);
      }
    },
    [interviewId, onSubmitted, roundId]
  );

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  return { queue, submit, savedAt, saving, submitting, flush };
}

/** Counts down from the round's start (or from now) and calls `onExpire` once. */
function Countdown({ round, onExpire }: { round: WorkspaceRound; onExpire: () => void }) {
  const [left, setLeft] = React.useState<number | null>(null);
  const fired = React.useRef(false);
  const onExpireRef = React.useRef(onExpire);
  React.useEffect(() => {
    onExpireRef.current = onExpire;
  });

  React.useEffect(() => {
    // Read the clock only after mount, so server and client render the same.
    const start = round.started_at ? new Date(round.started_at).getTime() : Date.now();
    const deadline = start + round.duration_min * 60_000;
    const tick = () => {
      const ms = deadline - Date.now();
      setLeft(Math.max(0, ms));
      if (ms <= 0 && !fired.current) {
        fired.current = true;
        onExpireRef.current();
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [round.started_at, round.duration_min]);

  if (left === null) return null;
  const s = Math.floor(left / 1000);
  const label = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  return (
    <span
      className={cn(
        'tnum inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        left < 5 * 60_000 ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
      )}
    >
      <Timer className="size-3.5" />
      {label} left
    </span>
  );
}

function CameraPreview({ stream }: { stream: MediaStream | null }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  if (!stream) return null;
  return (
    <div className="pointer-events-none absolute bottom-4 left-4 z-10 w-36 overflow-hidden rounded-lg bg-muted ring-1 ring-border">
      <video ref={ref} autoPlay playsInline muted className="aspect-[4/3] w-full -scale-x-100 object-cover" />
      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium text-white">
        Your camera
      </span>
    </div>
  );
}

/**
 * Two clicks to submit. A browser confirm() dialog would take focus from the
 * window and log a blur against the candidate for pressing their own button.
 */
function ConfirmSubmit({
  submitting,
  warning,
  onConfirm,
}: {
  submitting: boolean;
  warning: string;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = React.useState(false);
  React.useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 5000);
    return () => clearTimeout(t);
  }, [armed]);

  if (!armed) {
    return (
      <Button size="sm" disabled={submitting} onClick={() => setArmed(true)}>
        {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
        Submit
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground sm:inline">{warning}</span>
      <Button size="sm" variant="outline" onClick={() => setArmed(false)}>
        Keep working
      </Button>
      <Button
        size="sm"
        disabled={submitting}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        <Send className="size-3.5" />
        Confirm submit
      </Button>
    </span>
  );
}

function SaveState({ saving, savedAt }: { saving: boolean; savedAt: string | null }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      {saving ? <Loader2 className="size-3 animate-spin" /> : savedAt ? <Check className="size-3" /> : null}
      {saving ? 'Saving…' : savedAt ? `Saved ${formatTime(savedAt)}` : 'Autosaves as you work'}
    </span>
  );
}

/* ------------------------------------------------------------------ */

export function CodingWorkspace({
  interviewId,
  round,
  initial,
  preview,
  onSubmitted,
}: {
  interviewId: string;
  round: WorkspaceRound;
  initial: DraftSubmission | null;
  preview: MediaStream | null;
  onSubmitted: () => void;
}) {
  const language = initial?.language ?? round.content.language ?? 'javascript';
  const [code, setCode] = React.useState(initial?.code ?? round.content.starter ?? '');
  const codeRef = React.useRef(code);
  const { queue, submit, savedAt, saving, submitting } = useAutosave(interviewId, round.id, onSubmitted);

  function change(next: string) {
    setCode(next);
    codeRef.current = next;
    queue({ code: next, language });
  }

  // Tab indents instead of leaving the editor.
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    const el = e.currentTarget;
    const { selectionStart: a, selectionEnd: b } = el;
    const next = code.slice(0, a) + '  ' + code.slice(b);
    change(next);
    requestAnimationFrame(() => el.setSelectionRange(a + 2, a + 2));
  }

  return (
    <div className="relative flex h-full flex-col lg:flex-row">
      <section className="scrollbar-thin max-h-[40%] overflow-y-auto border-b border-border p-5 lg:max-h-none lg:w-[40%] lg:border-b-0 lg:border-r">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Problem</p>
        <h1 className="mt-1 font-display text-xl">{round.title}</h1>
        <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {round.content.problem ?? 'Your interviewer has not added a problem statement.'}
        </div>
      </section>

      <section className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">{language}</span>
          <SaveState saving={saving} savedAt={savedAt} />
          <span className="ml-auto flex items-center gap-2">
            <Countdown round={round} onExpire={() => void submit({ code: codeRef.current, language })} />
            <ConfirmSubmit
              submitting={submitting}
              warning="You cannot change it afterwards."
              onConfirm={() => void submit({ code: codeRef.current, language })}
            />
          </span>
        </div>
        <textarea
          value={code}
          onChange={(e) => change(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          aria-label="Your code"
          className="min-h-0 flex-1 resize-none bg-background p-4 font-mono text-[13px] leading-6 text-foreground outline-none"
          placeholder="// Write your solution here"
        />
      </section>

      <CameraPreview stream={preview} />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function McqWorkspace({
  interviewId,
  round,
  initial,
  preview,
  onSubmitted,
}: {
  interviewId: string;
  round: WorkspaceRound;
  initial: DraftSubmission | null;
  preview: MediaStream | null;
  onSubmitted: () => void;
}) {
  const questions = round.content.questions ?? [];
  const [answers, setAnswers] = React.useState<Record<string, number>>(initial?.answers ?? {});
  const answersRef = React.useRef(answers);
  const { queue, submit, savedAt, saving, submitting } = useAutosave(interviewId, round.id, onSubmitted);
  const answered = questions.filter((q) => answers[q.id] !== undefined).length;

  function choose(qid: string, option: number) {
    const next = { ...answersRef.current, [qid]: option };
    answersRef.current = next;
    setAnswers(next);
    queue({ answers: next });
  }

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <h1 className="text-sm font-semibold">{round.title}</h1>
        <span className="tnum text-xs text-muted-foreground">
          {answered} of {questions.length} answered
        </span>
        <SaveState saving={saving} savedAt={savedAt} />
        <span className="ml-auto flex items-center gap-2">
          <Countdown round={round} onExpire={() => void submit({ answers: answersRef.current })} />
          <ConfirmSubmit
            submitting={submitting}
            warning={
              questions.length - answered
                ? `${questions.length - answered} unanswered.`
                : 'You cannot change your answers afterwards.'
            }
            onConfirm={() => void submit({ answers: answersRef.current })}
          />
        </span>
      </div>

      <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
        <ol className="mx-auto max-w-2xl space-y-4 px-4 py-6">
          {round.content.instructions && (
            <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">{round.content.instructions}</p>
          )}
          {questions.map((q, i) => (
            <li key={q.id} className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">
              <p className="text-sm font-medium">
                <span className="tnum mr-2 text-muted-foreground">{i + 1}.</span>
                <span className="whitespace-pre-wrap">{q.prompt}</span>
              </p>
              <div className="mt-3 space-y-1.5" role="radiogroup" aria-label={`Question ${i + 1}`}>
                {q.options.map((opt, j) => {
                  const picked = answers[q.id] === j;
                  return (
                    <button
                      key={j}
                      type="button"
                      role="radio"
                      aria-checked={picked}
                      onClick={() => choose(q.id, j)}
                      className={cn(
                        'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                        picked ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                      )}
                    >
                      <span
                        className={cn(
                          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border',
                          picked ? 'border-primary bg-primary text-primary-foreground' : 'border-border'
                        )}
                      >
                        {picked && <span className="size-1.5 rounded-full bg-current" />}
                      </span>
                      {opt}
                    </button>
                  );
                })}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <CameraPreview stream={preview} />
    </div>
  );
}
