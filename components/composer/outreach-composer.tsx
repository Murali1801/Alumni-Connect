'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Copy, Loader2, RefreshCw, Send, Check, Info } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { InitialsAvatar, MatchScore, EmptyState } from '@/components/patterns';

export type ComposerTarget = {
  recordId: string;
  userId: string;
  name: string;
  designation: string | null;
  company: string | null;
  batch: number;
  branch: string;
  score: number;
  offers: Record<'mentorship' | 'mock_interview' | 'referral' | 'internship', boolean>;
};

type Student = {
  name: string;
  branch: string;
  batchYear: number;
  targetRole: string | null;
  targetCompany: string | null;
  targetIndustry: string | null;
  skills: string[];
};

const ASKS = [
  {
    key: 'mentorship' as const,
    label: 'Mentorship',
    ask: 'Would you be open to a short call so I can sanity-check my plan for the next six months?',
  },
  {
    key: 'mock_interview' as const,
    label: 'Mock interview',
    ask: 'Would you be willing to run one mock interview and tell me honestly where I am weakest?',
  },
  {
    key: 'referral' as const,
    label: 'Referral',
    ask: 'If my profile looks reasonable to you, would you consider referring me?',
  },
  {
    key: 'internship' as const,
    label: 'Internship',
    ask: 'Does your team take interns this cycle, and if so who should I be talking to?',
  },
];

/**
 * Assembles a first-contact message from the two profiles. This is string
 * composition, not generation — the same inputs always produce the same draft,
 * and the student is expected to edit it.
 */
function buildDraft(student: Student, target: ComposerTarget, askKey: string) {
  const first = target.name.trim().split(/\s+/)[0];
  const ask = ASKS.find((a) => a.key === askKey)?.ask ?? ASKS[0].ask;

  const year = new Date().getFullYear();
  const yearsOut = Math.max(0, year - target.batch);
  const seniority =
    yearsOut >= 8 ? 'a long way ahead of me' : yearsOut >= 4 ? 'several years ahead of me' : 'a few years ahead of me';

  // Only claim a connection the data actually supports.
  const links: string[] = [];
  if (student.targetCompany && target.company &&
      target.company.toLowerCase().includes(student.targetCompany.toLowerCase())) {
    links.push(`${target.company} is the company I am aiming for`);
  } else if (target.company) {
    links.push(`you are at ${target.company}`);
  }
  if (student.branch === target.branch) {
    links.push(`we are both ${target.branch}`);
  }
  if (student.targetRole && target.designation) {
    links.push(`you are working as a ${target.designation} and I am targeting ${student.targetRole} roles`);
  }

  const why = links.length
    ? `I am reaching out to you specifically because ${links.slice(0, 2).join(', and ')}.`
    : `I am reaching out because your path from SJCEM is close to the one I am trying to take.`;

  const skills = student.skills.slice(0, 4);
  const standing = skills.length
    ? ` So far I have been working mainly with ${skills.slice(0, -1).join(', ')}${
        skills.length > 1 ? ` and ${skills[skills.length - 1]}` : skills[0]
      }.`
    : '';

  return [
    `Hello ${first},`,
    '',
    `I am ${student.name}, ${student.branch} at St John College, graduating in ${student.batchYear}. You are ${seniority} from the same branch.`,
    '',
    `${why}${standing}`,
    '',
    ask,
    '',
    'Either way, thank you for reading.',
  ].join('\n');
}

export function OutreachComposer({
  student,
  targets,
}: {
  student: Student;
  targets: ComposerTarget[];
}) {
  const router = useRouter();
  const [targetId, setTargetId] = React.useState(targets[0]?.recordId ?? '');
  const target = targets.find((t) => t.recordId === targetId) ?? null;

  const available = React.useMemo(
    () => (target ? ASKS.filter((a) => target.offers[a.key]) : []),
    [target]
  );
  const [askKey, setAskKey] = React.useState(available[0]?.key ?? 'mentorship');
  const [draft, setDraft] = React.useState('');
  const [copied, setCopied] = React.useState(false);
  const [sending, setSending] = React.useState(false);

  // Regenerate whenever the target or the ask changes, unless the student has
  // started editing — their words win over the template.
  const [edited, setEdited] = React.useState(false);
  React.useEffect(() => {
    if (!target) return;
    const nextAsk = target.offers[askKey as keyof typeof target.offers]
      ? askKey
      : (available[0]?.key ?? 'mentorship');
    if (nextAsk !== askKey) setAskKey(nextAsk);
    if (!edited) setDraft(buildDraft(student, target, nextAsk));
  }, [target, askKey, available, student, edited]);

  if (targets.length === 0) {
    return (
      <EmptyState
        icon={Send}
        title="No alumni to write to yet"
        description="Once claimed profiles match your targets they will appear here to address a draft to."
        action={
          <Button size="sm" variant="outline" render={<Link href="/student/directory" />}>
            Browse the directory
          </Button>
        }
      />
    );
  }

  const tooShort = draft.trim().length < 20;

  async function send() {
    if (!target) return;
    setSending(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alumni_id: target.userId,
          type: askKey,
          message: draft.trim().slice(0, 500),
          match_score: target.score,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not send the request');
      toast.success(`Request sent to ${target.name}.`);
      router.push('/student/requests');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Target picker */}
      <Card className="gap-0 p-5">
        <h2 className="mb-1 text-base font-semibold text-foreground">Who are you writing to?</h2>
        <p className="mb-4 text-xs text-muted-foreground">Your strongest matches, best first.</p>
        <div className="scrollbar-thin max-h-[26rem] space-y-1 overflow-y-auto">
          {targets.map((t) => (
            <button
              key={t.recordId}
              onClick={() => {
                setTargetId(t.recordId);
                setEdited(false);
              }}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg p-2.5 text-left transition-colors',
                targetId === t.recordId ? 'bg-primary/10' : 'hover:bg-muted'
              )}
            >
              <InitialsAvatar name={t.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">{t.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t.designation ?? 'Role not shared'}
                  {t.company ? ` · ${t.company}` : ''}
                </span>
              </span>
              <MatchScore score={t.score} size={32} />
            </button>
          ))}
        </div>
      </Card>

      {/* Draft */}
      <Card className="gap-0 p-5 lg:col-span-2">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Your draft</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {target ? `Addressed to ${target.name}` : 'Pick someone on the left'}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (target) {
                setDraft(buildDraft(student, target, askKey));
                setEdited(false);
                toast.success('Draft rebuilt from your profile.');
              }
            }}
          >
            <RefreshCw className="size-3.5" />
            Rebuild
          </Button>
        </div>

        {available.length === 0 ? (
          <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">
            {target?.name} has not switched on any request types, so nothing can be sent to them.
          </p>
        ) : (
          <>
            <div className="mb-4 space-y-2">
              <Label>What are you asking for?</Label>
              <div className="flex flex-wrap gap-2">
                {available.map((a) => (
                  <button
                    key={a.key}
                    onClick={() => {
                      setAskKey(a.key);
                      setEdited(false);
                    }}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-sm transition-colors',
                      askKey === a.key
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="draft">Message</Label>
                <span
                  className={cn(
                    'tnum text-xs',
                    draft.trim().length > 500 || tooShort ? 'text-destructive' : 'text-muted-foreground'
                  )}
                >
                  {draft.trim().length} / 500
                </span>
              </div>
              <Textarea
                id="draft"
                rows={14}
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setEdited(true);
                }}
                className="font-mono text-[13px] leading-relaxed"
              />
              {draft.trim().length > 500 && (
                <p className="text-xs text-destructive">
                  Requests are capped at 500 characters — trim before sending.
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={send} disabled={sending || tooShort || draft.trim().length > 500}>
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                {sending ? 'Sending…' : 'Send as a request'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard
                    .writeText(draft)
                    .then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    })
                    .catch(() => toast.error('Could not copy.'));
                }}
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
              {target && (
                <Button variant="ghost" render={<Link href={`/student/directory/${target.recordId}`} />}>
                  View their profile
                </Button>
              )}
            </div>

            {edited && (
              <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Badge variant="secondary" className="font-normal">
                  Edited
                </Badge>
                Your changes are kept — “Rebuild” will discard them.
              </p>
            )}
          </>
        )}

        <p className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          This is a template filled from your profile and theirs, not a generated message. It only
          claims a connection the data supports. Editing it into your own voice is the point — an
          obviously templated message is the fastest way to be ignored.
        </p>
      </Card>
    </div>
  );
}
