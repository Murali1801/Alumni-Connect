import { cn } from '@/lib/utils';
import {
  DECISION_LABEL,
  ROUND_STATUS_LABEL,
  type Decision,
  type RoundOutcome,
  type RoundStatus,
} from '@/lib/interview-logic';

const TONE = {
  success: 'bg-[color-mix(in_oklch,var(--success),transparent_88%)] text-[var(--success)]',
  info: 'bg-[color-mix(in_oklch,var(--info),transparent_88%)] text-[var(--info)]',
  warning: 'bg-[color-mix(in_oklch,var(--warning),transparent_88%)] text-[var(--warning)]',
  danger: 'bg-destructive/10 text-destructive',
  muted: 'bg-muted text-muted-foreground',
} as const;

function Pill({ tone, children, className }: { tone: keyof typeof TONE; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium', TONE[tone], className)}>
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {children}
    </span>
  );
}

const STATUS_TONE: Record<RoundStatus, keyof typeof TONE> = {
  scheduled: 'info',
  in_progress: 'warning',
  completed: 'success',
  cancelled: 'muted',
  no_show: 'danger',
};

export function RoundStatusPill({ status, className }: { status: RoundStatus; className?: string }) {
  return (
    <Pill tone={STATUS_TONE[status]} className={className}>
      {ROUND_STATUS_LABEL[status]}
    </Pill>
  );
}

export function OutcomePill({ outcome, className }: { outcome: RoundOutcome; className?: string }) {
  if (outcome === 'pending') return <Pill tone="muted" className={className}>Result pending</Pill>;
  return (
    <Pill tone={outcome === 'passed' ? 'success' : 'danger'} className={className}>
      {outcome === 'passed' ? 'Passed' : 'Not passed'}
    </Pill>
  );
}

export function DecisionPill({ decision, className }: { decision: Decision; className?: string }) {
  const tone = decision === 'selected' ? 'success' : decision === 'rejected' ? 'danger' : decision === 'on_hold' ? 'warning' : 'muted';
  return (
    <Pill tone={tone} className={className}>
      {DECISION_LABEL[decision]}
    </Pill>
  );
}
