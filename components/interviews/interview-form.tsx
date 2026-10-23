'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ROUND_KINDS, fromIstInput, shiftIstInput, type RoundKind } from '@/lib/interview-logic';
import { RoundContentEditor, emptyContent, type ContentDraft } from '@/components/interviews/round-content-editor';

type Person = { id: string; full_name: string; headline: string };
type Candidate = Person & { requests: { id: string; type: string; status: string }[] };

type RoundDraft = {
  key: string;
  title: string;
  kind: RoundKind;
  when: string;
  duration_min: number;
  interviewer_id: string;
  proctored: boolean;
  content: ContentDraft;
};

const SELECT =
  'h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30';

const PRESETS: { label: string; title: string; kind: RoundKind; duration: number }[] = [
  { label: 'Aptitude MCQ', title: 'Aptitude', kind: 'mcq', duration: 30 },
  { label: 'Technical coding', title: 'Technical — coding', kind: 'coding', duration: 60 },
  { label: 'Technical video', title: 'Technical interview', kind: 'video', duration: 45 },
  { label: 'HR video', title: 'HR', kind: 'video', duration: 30 },
];

const REQUEST_LABEL: Record<string, string> = {
  mentorship: 'Mentorship',
  mock_interview: 'Mock interview',
  referral: 'Referral',
  internship: 'Internship',
};

let keyCounter = 0;
const nextKey = () => `r${keyCounter++}`;

export function InterviewForm({
  self,
  candidates,
  panel,
  opportunities,
  defaults,
  defaultSlot,
}: {
  self: { id: string; full_name: string };
  /** datetime-local value (IST) for the first round, worked out on the server. */
  defaultSlot: string;
  candidates: Candidate[];
  panel: Person[];
  opportunities: { id: string; title: string }[];
  defaults: { candidate_id?: string; request_id?: string; opportunity_id?: string; company?: string };
}) {
  const router = useRouter();
  const [candidateId, setCandidateId] = React.useState(
    candidates.some((c) => c.id === defaults.candidate_id) ? defaults.candidate_id! : ''
  );
  const candidate = candidates.find((c) => c.id === candidateId);
  const [requestId, setRequestId] = React.useState(defaults.request_id ?? '');
  const [opportunityId, setOpportunityId] = React.useState(
    opportunities.some((o) => o.id === defaults.opportunity_id) ? defaults.opportunity_id! : ''
  );
  const [title, setTitle] = React.useState('');
  const [company, setCompany] = React.useState(defaults.company ?? '');
  const [description, setDescription] = React.useState('');
  const [rounds, setRounds] = React.useState<RoundDraft[]>(() => [
    {
      key: nextKey(),
      title: 'Technical interview',
      kind: 'video',
      when: defaultSlot,
      duration_min: 45,
      interviewer_id: self.id,
      proctored: true,
      content: {},
    },
  ]);
  const [saving, setSaving] = React.useState(false);

  function chooseCandidate(id: string) {
    setCandidateId(id);
    // A request only belongs with its own student.
    if (!candidates.find((c) => c.id === id)?.requests.some((r) => r.id === requestId)) setRequestId('');
  }

  const people = [{ id: self.id, full_name: `${self.full_name} (you)`, headline: '' }, ...panel];

  function addRound(preset?: (typeof PRESETS)[number]) {
    const last = rounds[rounds.length - 1];
    setRounds([
      ...rounds,
      {
        key: nextKey(),
        title: preset?.title ?? `Round ${rounds.length + 1}`,
        kind: preset?.kind ?? 'video',
        when: last?.when ? shiftIstInput(last.when, 1) : defaultSlot,
        duration_min: preset?.duration ?? 45,
        interviewer_id: self.id,
        proctored: true,
        content: emptyContent(preset?.kind ?? 'video'),
      },
    ]);
  }

  function update(key: string, patch: Partial<RoundDraft>) {
    setRounds((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function move(i: number, dir: -1 | 1) {
    setRounds((list) => {
      const next = [...list];
      const [item] = next.splice(i, 1);
      next.splice(i + dir, 0, item);
      return next;
    });
  }

  const ready = Boolean(candidateId) && title.trim().length >= 3 && rounds.length > 0 && rounds.every((r) => r.title.trim().length >= 2 && fromIstInput(r.when));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    try {
      const res = await fetch('/api/interviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_id: candidateId,
          title: title.trim(),
          company: company.trim() || undefined,
          description: description.trim() || undefined,
          opportunity_id: opportunityId || null,
          request_id: requestId || null,
          rounds: rounds.map((r) => ({
            title: r.title.trim(),
            kind: r.kind,
            scheduled_at: fromIstInput(r.when),
            duration_min: r.duration_min,
            interviewer_id: r.interviewer_id,
            proctored: r.proctored,
            content: r.kind === 'video' ? {} : r.content,
          })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not create the interview.');
      toast.success(`Interview created. ${candidate?.full_name.split(' ')[0] ?? 'The candidate'} has been notified.`);
      router.push(`/alumni/interviews/${body.id}`);
    } catch (err) {
      toast.error((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Card className="gap-4 p-5">
        <h2 className="text-sm font-semibold">Candidate and role</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="iv-candidate">Candidate</Label>
            <select id="iv-candidate" className={SELECT} value={candidateId} onChange={(e) => chooseCandidate(e.target.value)}>
              <option value="">Choose a student…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name} — {c.headline}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {candidates.length
                ? 'Students who have sent you a request, or are connected with you.'
                : 'No students yet. A student needs to send you a request or connect with you first.'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iv-title">Interview title</Label>
            <Input id="iv-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Software Engineer Intern" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iv-company">Company (optional)</Label>
            <Input id="iv-company" value={company} onChange={(e) => setCompany(e.target.value)} maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iv-opportunity">Linked posting (optional)</Label>
            <select id="iv-opportunity" className={SELECT} value={opportunityId} onChange={(e) => setOpportunityId(e.target.value)}>
              <option value="">None</option>
              {opportunities.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="iv-request">Linked request (optional)</Label>
            <select
              id="iv-request"
              className={SELECT}
              value={requestId}
              onChange={(e) => setRequestId(e.target.value)}
              disabled={!candidate?.requests.length}
            >
              <option value="">None</option>
              {candidate?.requests.map((r) => (
                <option key={r.id} value={r.id}>
                  {REQUEST_LABEL[r.type] ?? r.type} request ({r.status})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="iv-description">Notes for the candidate (optional)</Label>
            <Textarea
              id="iv-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              placeholder="What the role is, what each round covers, and anything to prepare."
            />
          </div>
        </div>
      </Card>

      <Card className="gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Rounds</h2>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <Button key={p.label} type="button" size="xs" variant="outline" onClick={() => addRound(p)} disabled={rounds.length >= 8}>
                <Plus className="size-3" /> {p.label}
              </Button>
            ))}
          </div>
        </div>

        <ol className="space-y-3">
          {rounds.map((r, i) => (
            <li key={r.key} className="space-y-3 rounded-lg border border-border p-4">
              <div className="flex items-center gap-2">
                <span className="tnum flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{i + 1}</span>
                <Input
                  value={r.title}
                  onChange={(e) => update(r.key, { title: e.target.value })}
                  aria-label={`Round ${i + 1} title`}
                  className="h-8 flex-1 font-medium"
                  maxLength={80}
                />
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === rounds.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove round ${i + 1}`}
                  disabled={rounds.length <= 1}
                  onClick={() => setRounds((list) => list.filter((x) => x.key !== r.key))}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {ROUND_KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => update(r.key, { kind: k.value, content: r.kind === k.value ? r.content : emptyContent(k.value) })}
                    className={cn(
                      'rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      r.kind === k.value ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'
                    )}
                  >
                    <span className="font-medium">{k.label}</span>
                    <span className="mt-0.5 hidden text-[11px] text-muted-foreground sm:block">{k.hint}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor={`${r.key}-when`}>Date and time (IST)</Label>
                  <Input id={`${r.key}-when`} type="datetime-local" value={r.when} onChange={(e) => update(r.key, { when: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${r.key}-duration`}>Duration</Label>
                  <select
                    id={`${r.key}-duration`}
                    className={SELECT}
                    value={r.duration_min}
                    onChange={(e) => update(r.key, { duration_min: Number(e.target.value) })}
                  >
                    {[15, 20, 30, 45, 60, 90, 120].map((m) => (
                      <option key={m} value={m}>
                        {m} minutes
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`${r.key}-interviewer`}>Interviewer</Label>
                  <select
                    id={`${r.key}-interviewer`}
                    className={SELECT}
                    value={r.interviewer_id}
                    onChange={(e) => update(r.key, { interviewer_id: e.target.value })}
                  >
                    {people.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.full_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-3 text-sm">
                <Switch checked={r.proctored} onCheckedChange={(v) => update(r.key, { proctored: Boolean(v) })} aria-label="Proctored" />
                <span>
                  <span className="font-medium">Proctored</span>
                  <span className="block text-xs text-muted-foreground">
                    The candidate agrees to browser monitoring before starting: tab switches, full screen, copy and
                    paste, extra displays, and camera checks for people and phones. You get a timeline, not a verdict.
                  </span>
                </span>
              </label>

              <RoundContentEditor
                kind={r.kind}
                value={r.content}
                idPrefix={r.key}
                onChange={(content) => update(r.key, { content })}
              />
            </li>
          ))}
        </ol>

        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => addRound()} disabled={rounds.length >= 8}>
          <Plus className="size-3.5" /> Add a round
        </Button>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" disabled={!ready || saving} className="h-9 px-4">
          {saving && <Loader2 className="size-4 animate-spin" />}
          Create interview and notify the candidate
        </Button>
      </div>
    </form>
  );
}
