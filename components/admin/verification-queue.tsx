'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, X, Loader2, ShieldCheck, ExternalLink, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InitialsAvatar, Field, SkillTags, EmptyState } from '@/components/patterns';

export type ClaimRow = {
  id: string;
  student_id: string;
  full_name: string;
  branch: string;
  batch_year: number;
  city: string | null;
  first_role: string | null;
  first_ctc_lpa: number | null;
  first_company: string | null;
  claimed_at: string | null;
  claimant: { id: string; full_name: string; email: string } | null;
  profile: {
    designation: string | null;
    location: string | null;
    linkedin_url: string | null;
    experience_years: number | null;
    skills: string[];
    company: string | null;
  } | null;
};

export function VerificationQueue({ claims }: { claims: ClaimRow[] }) {
  const [filter, setFilter] = React.useState('');

  const visible = filter
    ? claims.filter((c) =>
        `${c.full_name} ${c.student_id} ${c.branch} ${c.batch_year} ${c.claimant?.email ?? ''}`
          .toLowerCase()
          .includes(filter.toLowerCase())
      )
    : claims;

  if (claims.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="The queue is clear"
        description="Every claimed record has been reviewed. New claims will appear here as alumni link their accounts."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter by name, student ID, branch or email…"
        aria-label="Filter the queue"
        className="h-9 max-w-md"
      />

      {visible.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No claims match that filter" />
      ) : (
        <div className="space-y-3">
          {visible.map((claim) => (
            <ClaimCard key={claim.id} claim={claim} />
          ))}
        </div>
      )}
    </div>
  );
}

function ClaimCard({ claim }: { claim: ClaimRow }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState(false);

  const waitedDays = claim.claimed_at
    ? Math.floor((Date.now() - new Date(claim.claimed_at).getTime()) / 86_400_000)
    : null;

  async function decide(action: 'verified' | 'rejected') {
    setBusy(action);
    try {
      const res = await fetch('/api/admin/verification', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: claim.id, action }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not record the decision');
      toast.success(action === 'verified' ? `${claim.full_name} verified.` : `Claim rejected.`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="gap-0 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <InitialsAvatar name={claim.full_name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{claim.full_name}</h3>
            <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
              {claim.student_id}
            </span>
            {waitedDays !== null && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[11px] font-medium',
                  waitedDays > 14
                    ? 'bg-destructive/10 text-destructive'
                    : waitedDays > 5
                      ? 'bg-[color-mix(in_oklch,var(--warning),transparent_88%)] text-[var(--warning)]'
                      : 'bg-muted text-muted-foreground'
                )}
              >
                waiting {waitedDays}d
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {claim.branch} · {claim.batch_year} · claimed by{' '}
            {claim.claimant?.email ?? 'an account with no email on file'}
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => decide('verified')} disabled={busy !== null}>
            {busy === 'verified' ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            Verify
          </Button>
          <Button size="sm" variant="destructive" onClick={() => decide('rejected')} disabled={busy !== null}>
            {busy === 'rejected' ? <Loader2 className="size-3.5 animate-spin" /> : <X className="size-3.5" />}
            Reject
          </Button>
        </div>
      </div>

      <button
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 flex w-full items-center gap-1.5 border-t border-border pt-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={expanded}
      >
        <ChevronDown className={cn('size-3.5 transition-transform', expanded && 'rotate-180')} />
        {expanded ? 'Hide' : 'Compare'} the record against the claim
      </button>

      {expanded && (
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div className="rounded-lg bg-muted/50 p-4">
            <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              College record
            </h4>
            <dl className="space-y-2.5">
              <Field label="Name">{claim.full_name}</Field>
              <Field label="Branch and batch">
                {claim.branch} · {claim.batch_year}
              </Field>
              <Field label="Home city">{claim.city ?? '—'}</Field>
              <Field label="First employer">{claim.first_company ?? '—'}</Field>
              <Field label="First role">{claim.first_role ?? '—'}</Field>
              <Field label="First CTC">{claim.first_ctc_lpa ? `${claim.first_ctc_lpa} LPA` : '—'}</Field>
            </dl>
          </div>

          <div className="rounded-lg bg-card p-4 ring-1 ring-border">
            <h4 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              What the claimant says
            </h4>
            {claim.profile ? (
              <dl className="space-y-2.5">
                <Field label="Account">{claim.claimant?.full_name ?? '—'}</Field>
                <Field label="Current employer">{claim.profile.company ?? '—'}</Field>
                <Field label="Designation">{claim.profile.designation ?? '—'}</Field>
                <Field label="Location">{claim.profile.location ?? '—'}</Field>
                <Field label="Experience">
                  {claim.profile.experience_years ? `${claim.profile.experience_years} years` : '—'}
                </Field>
                <Field label="LinkedIn">
                  {claim.profile.linkedin_url ? (
                    <a
                      href={claim.profile.linkedin_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Open profile
                      <ExternalLink className="size-3" />
                    </a>
                  ) : (
                    '—'
                  )}
                </Field>
                <Field label="Skills">
                  <SkillTags skills={claim.profile.skills} max={10} />
                </Field>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">
                The account claimed this record but has not filled in a profile yet. There is nothing
                to check against — consider waiting before deciding.
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
