'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, Check, DoorOpen, Loader2, Pencil, Plus, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DECISION_LABEL,
  DEFAULT_CRITERIA,
  RECOMMENDATION_LABEL,
  ROUND_KINDS,
  averageRating,
  canRelease,
  fromIstInput,
  toIstInput,
  type Decision,
  type Recommendation,
  type RoundKind,
  type RoundOutcome,
  type RoundStatus,
} from '@/lib/interview-logic';
import { RoundContentEditor, emptyContent, type ContentDraft } from '@/components/interviews/round-content-editor';

const SELECT =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Something went wrong.');
  return json;
}

function useAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = React.useCallback(
    async (key: string, fn: () => Promise<unknown>, success?: string) => {
      setBusy(key);
      try {
        await fn();
        if (success) toast.success(success);
        router.refresh();
        return true;
      } catch (err) {
        toast.error((err as Error).message);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [router]
  );
  return { busy, run };
}

/* ------------------------------------------------------------------ */
/* Round actions                                                       */
/* ------------------------------------------------------------------ */

export type StaffRoundSummary = {
  id: string;
  title: string;
  kind: RoundKind;
  status: RoundStatus;
  outcome: RoundOutcome;
  scheduled_at: string;
  duration_min: number;
  proctored: boolean;
  released_at: string | null;
  content: ContentDraft;
};

export function RoundActions({
  interviewId,
  round,
  roomHref,
  isOwner,
  canEdit,
}: {
  interviewId: string;
  round: StaffRoundSummary;
  roomHref: string;
  isOwner: boolean;
  /** The owner, or the interviewer on this round. */
  canEdit: boolean;
}) {
  const { busy, run } = useAction();
  const url = `/api/interviews/${interviewId}/rounds/${round.id}`;
  const patch = (key: string, body: Record<string, unknown>, success?: string) => run(key, () => send(url, 'PATCH', body), success);
  const [reschedule, setReschedule] = React.useState(false);
  const [when, setWhen] = React.useState('');
  const [editing, setEditing] = React.useState(false);
  const [content, setContent] = React.useState<ContentDraft>(round.content);

  const open = round.status === 'scheduled' || round.status === 'in_progress';
  const finished = round.status === 'completed' || round.status === 'no_show';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {open && (
        <Button size="sm" render={<Link href={roomHref} />}>
          <DoorOpen className="size-3.5" />
          {round.kind === 'video' ? 'Open room' : 'Watch live'}
        </Button>
      )}
      {canEdit && (
        <>
          {open && (
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void patch('complete', { status: 'completed' }, 'Round marked completed.')}>
              <Check className="size-3.5" /> Mark completed
            </Button>
          )}
          {round.status === 'scheduled' && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setWhen(toIstInput(round.scheduled_at));
                  setReschedule(true);
                }}
              >
                <CalendarClock className="size-3.5" /> Reschedule
              </Button>
              {round.kind !== 'video' && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setContent(round.content.questions || round.content.problem ? round.content : emptyContent(round.kind));
                    setEditing(true);
                  }}
                >
                  <Pencil className="size-3.5" /> Edit {round.kind === 'mcq' ? 'questions' : 'problem'}
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void patch('noshow', { status: 'no_show' }, 'Marked as a no-show.')}>
                No show
              </Button>
              <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void patch('cancel', { status: 'cancelled' }, 'Round cancelled.')}>
                <X className="size-3.5" /> Cancel
              </Button>
            </>
          )}
          {(round.status === 'cancelled' || (round.status === 'no_show' && !round.released_at)) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setWhen(toIstInput(new Date(Date.now() + 86_400_000).toISOString()));
                setReschedule(true);
              }}
            >
              <CalendarClock className="size-3.5" /> Reschedule
            </Button>
          )}
          {finished && !round.released_at && (
            <span className="inline-flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Result:</span>
              {(['passed', 'failed'] as const).map((o) => (
                <Button
                  key={o}
                  size="sm"
                  variant={round.outcome === o ? 'default' : 'outline'}
                  disabled={!!busy || (round.status === 'no_show' && o === 'passed')}
                  onClick={() => void patch(`outcome-${o}`, { outcome: round.outcome === o ? 'pending' : o })}
                >
                  {o === 'passed' ? 'Passed' : 'Not passed'}
                </Button>
              ))}
            </span>
          )}
          {finished && !round.released_at && canRelease(round.status, round.outcome) && (
            <Button size="sm" disabled={!!busy} onClick={() => void patch('release', { release: true }, 'Result shared with the candidate.')}>
              {busy === 'release' ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Share result
            </Button>
          )}
          {isOwner && (round.status === 'scheduled' || round.status === 'cancelled') && (
            <Button
              size="icon-sm"
              variant="ghost"
              aria-label="Remove round"
              disabled={!!busy}
              onClick={() => void run('delete', () => send(url, 'DELETE'), 'Round removed.')}
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </>
      )}

      <Dialog open={reschedule} onOpenChange={setReschedule}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Reschedule {round.title}</DialogTitle>
            <DialogDescription>The candidate is notified and asked to accept the new time.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${round.id}-when`}>New date and time (IST)</Label>
            <Input id={`${round.id}-when`} type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReschedule(false)}>
              Close
            </Button>
            <Button
              disabled={!fromIstInput(when) || !!busy}
              onClick={async () => {
                const ok = await patch('reschedule', { scheduled_at: fromIstInput(when) }, 'Rescheduled. The candidate has been told.');
                if (ok) setReschedule(false);
              }}
            >
              {busy === 'reschedule' && <Loader2 className="size-3.5 animate-spin" />}
              Save new time
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{round.kind === 'mcq' ? 'Questions' : 'Problem'} for {round.title}</DialogTitle>
            <DialogDescription>Editable until the round starts.</DialogDescription>
          </DialogHeader>
          <RoundContentEditor kind={round.kind} value={content} onChange={setContent} idPrefix={`edit-${round.id}`} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>
              Close
            </Button>
            <Button
              disabled={!!busy}
              onClick={async () => {
                const ok = await patch('content', { content }, 'Saved.');
                if (ok) setEditing(false);
              }}
            >
              {busy === 'content' && <Loader2 className="size-3.5 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scorecard                                                           */
/* ------------------------------------------------------------------ */

export function ScorecardForm({
  interviewId,
  roundId,
  kind,
  initial,
}: {
  interviewId: string;
  roundId: string;
  kind: RoundKind;
  initial: { ratings: Record<string, number>; recommendation: Recommendation | null; notes: string | null; feedback: string | null } | null;
}) {
  const { busy, run } = useAction();
  const criteria = Object.keys(initial?.ratings ?? {}).length ? Object.keys(initial!.ratings) : DEFAULT_CRITERIA[kind];
  const [list, setList] = React.useState<string[]>(criteria);
  const [ratings, setRatings] = React.useState<Record<string, number>>(initial?.ratings ?? {});
  const [recommendation, setRecommendation] = React.useState<Recommendation | ''>(initial?.recommendation ?? '');
  const [notes, setNotes] = React.useState(initial?.notes ?? '');
  const [feedback, setFeedback] = React.useState(initial?.feedback ?? '');
  const [newCriterion, setNewCriterion] = React.useState('');
  const rated = Object.fromEntries(Object.entries(ratings).filter(([k]) => list.includes(k)));
  const avg = averageRating(rated);

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {list.map((c) => (
          <li key={c} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-sm">{c}</span>
            <span className="flex gap-1" role="radiogroup" aria-label={c}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={ratings[c] === n}
                  aria-label={`${c}: ${n} of 5`}
                  onClick={() => setRatings((r) => ({ ...r, [c]: n }))}
                  className={cn(
                    'tnum size-7 rounded-md border text-xs font-medium transition-colors',
                    ratings[c] === n
                      ? 'border-primary bg-primary text-primary-foreground'
                      : ratings[c] !== undefined && ratings[c] > n
                        ? 'border-primary/40 bg-primary/10'
                        : 'border-border hover:bg-muted'
                  )}
                >
                  {n}
                </button>
              ))}
            </span>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Remove ${c}`}
              onClick={() => {
                setList((l) => l.filter((x) => x !== c));
                setRatings((r) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== c)));
              }}
            >
              <X className="size-3" />
            </Button>
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const c = newCriterion.trim();
          if (!c || list.includes(c) || list.length >= 12) return;
          setList((l) => [...l, c]);
          setNewCriterion('');
        }}
      >
        <Input value={newCriterion} onChange={(e) => setNewCriterion(e.target.value)} placeholder="Add a criterion" className="h-8" maxLength={60} />
        <Button type="submit" size="sm" variant="outline" disabled={!newCriterion.trim()}>
          <Plus className="size-3.5" />
        </Button>
      </form>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${roundId}-rec`}>Recommendation</Label>
          <select id={`${roundId}-rec`} className={SELECT} value={recommendation} onChange={(e) => setRecommendation(e.target.value as Recommendation | '')}>
            <option value="">No recommendation</option>
            {(Object.keys(RECOMMENDATION_LABEL) as Recommendation[]).map((r) => (
              <option key={r} value={r}>
                {RECOMMENDATION_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-end text-sm text-muted-foreground">
          {avg !== null && (
            <span>
              Average <span className="tnum font-semibold text-foreground">{avg}</span> / 5
            </span>
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${roundId}-notes`}>Private notes</Label>
        <Textarea id={`${roundId}-notes`} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} placeholder="Only interviewers see these." />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${roundId}-feedback`}>Feedback for the candidate</Label>
        <Textarea
          id={`${roundId}-feedback`}
          rows={3}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          maxLength={2000}
          placeholder="Shown to the candidate when you share the result."
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={!Object.keys(rated).length || !!busy}
          onClick={() =>
            void run(
              'score',
              () =>
                send(`/api/interviews/${interviewId}/rounds/${roundId}/scorecard`, 'PUT', {
                  ratings: rated,
                  recommendation: recommendation || null,
                  notes: notes || null,
                  feedback: feedback || null,
                }),
              'Scorecard saved.'
            )
          }
        >
          {busy === 'score' && <Loader2 className="size-3.5 animate-spin" />}
          Save scorecard
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Decision and pipeline                                               */
/* ------------------------------------------------------------------ */

export function DecisionPanel({
  interviewId,
  decision: initialDecision,
  note: initialNote,
  releasedAt,
  status,
}: {
  interviewId: string;
  decision: Decision;
  note: string | null;
  releasedAt: string | null;
  status: 'active' | 'completed' | 'cancelled';
}) {
  const { busy, run } = useAction();
  const [decision, setDecision] = React.useState<Decision>(initialDecision);
  const [note, setNote] = React.useState(initialNote ?? '');
  const url = `/api/interviews/${interviewId}`;
  const router = useRouter();

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="iv-decision">Decision</Label>
        <select
          id="iv-decision"
          className={SELECT}
          value={decision}
          disabled={Boolean(releasedAt)}
          onChange={(e) => setDecision(e.target.value as Decision)}
        >
          {(Object.keys(DECISION_LABEL) as Decision[]).map((d) => (
            <option key={d} value={d}>
              {DECISION_LABEL[d]}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="iv-note">Message to the candidate</Label>
        <Textarea id="iv-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Shown with the decision." />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={!!busy}
          onClick={() => void run('save', () => send(url, 'PATCH', releasedAt ? { decision_note: note || null } : { decision, decision_note: note || null }), 'Saved.')}
        >
          Save
        </Button>
        {!releasedAt && (
          <Button
            size="sm"
            disabled={decision === 'pending' || !!busy}
            onClick={() =>
              void run(
                'release',
                () => send(url, 'PATCH', { decision, decision_note: note || null, release_decision: true }),
                'Decision shared with the candidate.'
              )
            }
          >
            <Send className="size-3.5" /> Share decision
          </Button>
        )}
      </div>
      {releasedAt && <p className="text-xs text-muted-foreground">Shared with the candidate. The decision can no longer change.</p>}

      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        {status === 'cancelled' ? (
          <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void run('reopen', () => send(url, 'PATCH', { status: 'active' }), 'Interview reopened.')}>
            Reopen interview
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy}
            onClick={() => void run('withdraw', () => send(url, 'PATCH', { status: 'cancelled' }), 'Interview withdrawn; upcoming rounds cancelled.')}
          >
            Withdraw interview
          </Button>
        )}
        <Button
          size="sm"
          variant="destructive"
          disabled={!!busy}
          onClick={async () => {
            if (!window.confirm('Delete this interview, its rounds, scorecards and proctoring records? This cannot be undone.')) return;
            const ok = await run('delete', () => send(url, 'DELETE'));
            if (ok) {
              toast.success('Interview deleted.');
              router.push('/alumni/interviews');
            }
          }}
        >
          <Trash2 className="size-3.5" /> Delete
        </Button>
      </div>
    </div>
  );
}

export function AddRoundDialog({
  interviewId,
  people,
  selfId,
}: {
  interviewId: string;
  people: { id: string; full_name: string }[];
  selfId: string;
}) {
  const { busy, run } = useAction();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [kind, setKind] = React.useState<RoundKind>('video');
  const [when, setWhen] = React.useState('');
  const [duration, setDuration] = React.useState(45);
  const [interviewer, setInterviewer] = React.useState(selfId);
  const [proctored, setProctored] = React.useState(true);
  const [content, setContent] = React.useState<ContentDraft>({});

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setWhen(toIstInput(new Date(Date.now() + 2 * 86_400_000).toISOString()));
          setOpen(true);
        }}
      >
        <Plus className="size-3.5" /> Add a round
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add a round</DialogTitle>
            <DialogDescription>The candidate is notified about the new round.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Round title, e.g. HR" aria-label="Round title" maxLength={80} />
            <div className="grid grid-cols-3 gap-2">
              {ROUND_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => {
                    setKind(k.value);
                    setContent(emptyContent(k.value));
                  }}
                  className={cn('rounded-lg border px-3 py-2 text-sm font-medium', kind === k.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted')}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Date and time (IST)" />
              <select className={SELECT} value={duration} onChange={(e) => setDuration(Number(e.target.value))} aria-label="Duration">
                {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} minutes
                  </option>
                ))}
              </select>
              <select className={SELECT} value={interviewer} onChange={(e) => setInterviewer(e.target.value)} aria-label="Interviewer">
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Switch checked={proctored} onCheckedChange={(v) => setProctored(Boolean(v))} aria-label="Proctored" />
              Proctored
            </label>
            <RoundContentEditor kind={kind} value={content} onChange={setContent} idPrefix="add-round" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button
              disabled={title.trim().length < 2 || !fromIstInput(when) || !!busy}
              onClick={async () => {
                const ok = await run(
                  'add',
                  () =>
                    send(`/api/interviews/${interviewId}/rounds`, 'POST', {
                      title: title.trim(),
                      kind,
                      scheduled_at: fromIstInput(when),
                      duration_min: duration,
                      interviewer_id: interviewer,
                      proctored,
                      content: kind === 'video' ? {} : content,
                    }),
                  'Round added.'
                );
                if (ok) {
                  setOpen(false);
                  setTitle('');
                }
              }}
            >
              {busy === 'add' && <Loader2 className="size-3.5 animate-spin" />}
              Add round
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
