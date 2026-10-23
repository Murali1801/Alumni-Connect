'use client';

import * as React from 'react';
import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  PROCTOR_META,
  formatDuration,
  isFlag,
  type IntegritySummary,
  type ProctorType,
  type Severity,
} from '@/lib/interview-logic';

export type ReportEvent = {
  id: string;
  type: ProctorType;
  occurred_at: string;
  duration_ms: number | null;
  detail: Record<string, unknown>;
};

const SEVERITY_STYLE: Record<Severity, string> = {
  high: 'bg-destructive/10 text-destructive',
  medium: 'bg-[color-mix(in_oklch,var(--warning),transparent_85%)] text-[var(--warning)]',
  low: 'bg-muted text-foreground',
  info: 'bg-muted text-muted-foreground',
};

const SEVERITY_DOT: Record<Severity, string> = {
  high: 'bg-destructive',
  medium: 'bg-[var(--warning)]',
  low: 'bg-foreground/40',
  info: 'bg-border',
};

/** 18:04:09 — seconds matter in a timeline. Pinned like lib/format. */
function clock(value: string) {
  return new Date(value).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'Asia/Kolkata',
  });
}

function describe(e: ReportEvent): string | null {
  const d = e.detail ?? {};
  const bits: string[] = [];
  if (e.duration_ms) bits.push(`away ${formatDuration(e.duration_ms)}`);
  if (typeof d.characters === 'number') bits.push(`${d.characters} characters`);
  if (typeof d.people === 'number') bits.push(`${d.people} people`);
  if (typeof d.screens === 'number') bits.push(`${d.screens} screens`);
  if (typeof d.reason === 'string') bits.push(d.reason);
  return bits.length ? bits.join(' · ') : null;
}

/**
 * The integrity summary: counts and absences, with the reminder that it is a
 * record to read, not a verdict. No score is derived from it on purpose.
 */
export function IntegritySummaryCard({ summary, compact }: { summary: IntegritySummary; compact?: boolean }) {
  const flagged = (Object.entries(summary.byType) as [ProctorType, number][])
    .filter(([t]) => isFlag(t))
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-3">
      <div className={cn('grid gap-2', compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4')}>
        <Stat label="High" value={summary.bySeverity.high} tone="high" />
        <Stat label="Medium" value={summary.bySeverity.medium} tone="medium" />
        <Stat label="Low" value={summary.bySeverity.low} tone="low" />
        {!compact && (
          <div className="rounded-lg bg-muted px-3 py-2">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Longest away</p>
            <p className="tnum mt-0.5 text-lg font-semibold">
              {summary.longestAbsenceMs ? formatDuration(summary.longestAbsenceMs) : '—'}
            </p>
          </div>
        )}
      </div>
      {compact && (
        <p className="text-xs text-muted-foreground">
          Longest away: <span className="tnum font-medium text-foreground">{summary.longestAbsenceMs ? formatDuration(summary.longestAbsenceMs) : 'none'}</span>
          {summary.absences > 0 && <> · {summary.absences} time{summary.absences === 1 ? '' : 's'}, {formatDuration(summary.totalAbsenceMs)} in all</>}
        </p>
      )}
      {!compact && summary.absences > 0 && (
        <p className="text-xs text-muted-foreground">
          Away from the round {summary.absences} time{summary.absences === 1 ? '' : 's'}, {formatDuration(summary.totalAbsenceMs)} in all.
        </p>
      )}
      {flagged.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {flagged.map(([type, n]) => (
            <li key={type} className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', SEVERITY_STYLE[PROCTOR_META[type].severity])}>
              {PROCTOR_META[type].label} <span className="tnum">×{n}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-[var(--success)]" />
          {summary.consented ? 'Nothing flagged.' : 'No monitoring data for this round.'}
        </p>
      )}
      {!summary.visionAvailable && (
        <p className="text-xs text-muted-foreground">The camera checks could not run on the candidate’s device, so phone and person findings are missing.</p>
      )}
      {!compact && (
        <p className="flex gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <ShieldAlert className="mt-px size-3.5 shrink-0" />
          These are signals from the candidate’s browser, not proof. A blur can be a notification; a missed phone is
          possible. Read them alongside what you saw, and ask the candidate before drawing conclusions.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: Severity }) {
  return (
    <div className={cn('rounded-lg px-3 py-2', value > 0 ? SEVERITY_STYLE[tone] : 'bg-muted text-muted-foreground')}>
      <p className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</p>
      <p className="tnum mt-0.5 text-lg font-semibold">{value}</p>
    </div>
  );
}

/** Every event in order, flags emphasised and informational ones muted. */
export function ProctorTimeline({ events, limit }: { events: ReportEvent[]; limit?: number }) {
  const [showAll, setShowAll] = React.useState(false);
  const ordered = [...events].sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  const shown = limit && !showAll ? ordered.slice(-limit) : ordered;
  if (!events.length) return <p className="text-xs text-muted-foreground">No events recorded.</p>;

  return (
    <div className="space-y-2">
      {limit && ordered.length > limit && !showAll && (
        <button type="button" onClick={() => setShowAll(true)} className="text-xs font-medium text-primary hover:underline">
          Show all {ordered.length} events
        </button>
      )}
      <ol className="relative space-y-0 border-l border-border pl-4">
        {shown.map((e) => {
          const meta = PROCTOR_META[e.type];
          const extra = describe(e);
          return (
            <li key={e.id} className="relative py-1.5">
              <span className={cn('absolute -left-[21px] top-3 size-2.5 rounded-full ring-2 ring-card', SEVERITY_DOT[meta.severity])} />
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="tnum font-mono text-[11px] text-muted-foreground">{clock(e.occurred_at)}</span>
                <span className={cn('text-sm', meta.severity === 'info' ? 'text-muted-foreground' : 'font-medium text-foreground')}>
                  {meta.label}
                </span>
                {extra && <span className="text-xs text-muted-foreground">{extra}</span>}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
