import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/* ------------------------------------------------------------------ */
/* Page header                                                         */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 space-y-1.5">
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="font-display text-2xl leading-tight text-foreground sm:text-3xl">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Stat tile                                                           */
/* ------------------------------------------------------------------ */

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  trend,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: { value: string; positive?: boolean };
  href?: string;
  className?: string;
}) {
  const body = (
    <Card
      className={cn(
        'gap-0 p-5 transition-shadow',
        href && 'hover:ring-foreground/20 hover:shadow-card',
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" /> : null}
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="tnum font-display text-3xl leading-none text-foreground">{value}</span>
        {trend ? (
          <span
            className={cn(
              'tnum text-xs font-medium',
              trend.positive === false ? 'text-destructive' : 'text-[var(--success)]'
            )}
          >
            {trend.value}
          </span>
        ) : null}
      </div>
      {hint ? <p className="mt-2 text-xs leading-snug text-muted-foreground">{hint}</p> : null}
    </Card>
  );

  return href ? (
    <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}

/* ------------------------------------------------------------------ */
/* Section card — titled container used all over the dashboards        */
/* ------------------------------------------------------------------ */

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <Card className={cn('gap-0 overflow-hidden p-0', className)}>
      {title ? (
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 space-y-0.5">
            <h2 className="text-sm font-semibold text-foreground">{title}</h2>
            {description ? (
              <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Empty state                                                         */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className
      )}
    >
      {Icon ? (
        <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-xs leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Initials avatar — deterministic hue per name, no image dependency   */
/* ------------------------------------------------------------------ */

const AVATAR_SIZES = {
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-xs',
  lg: 'size-14 text-base',
  xl: 'size-20 text-2xl',
} as const;

export function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hueOf(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return h;
}

export function InitialsAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
}) {
  const hue = hueOf(name);
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold ring-1 ring-inset ring-foreground/10',
        AVATAR_SIZES[size],
        className
      )}
      style={{
        backgroundColor: `oklch(0.92 0.045 ${hue})`,
        color: `oklch(0.38 0.11 ${hue})`,
      }}
    >
      {initialsOf(name)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Status pills                                                        */
/* ------------------------------------------------------------------ */

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-[color-mix(in_oklch,var(--warning),transparent_88%)] text-[var(--warning)]',
  accepted: 'bg-[color-mix(in_oklch,var(--success),transparent_88%)] text-[var(--success)]',
  declined: 'bg-destructive/10 text-destructive',
  closed: 'bg-muted text-muted-foreground',
  verified: 'bg-[color-mix(in_oklch,var(--success),transparent_88%)] text-[var(--success)]',
  claimed: 'bg-[color-mix(in_oklch,var(--info),transparent_88%)] text-[var(--info)]',
  unclaimed: 'bg-muted text-muted-foreground',
  rejected: 'bg-destructive/10 text-destructive',
};

export function StatusPill({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium capitalize',
        STATUS_STYLES[status] ?? 'bg-muted text-muted-foreground',
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current opacity-70" />
      {status.replace(/_/g, ' ')}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Match score ring                                                    */
/* ------------------------------------------------------------------ */

export function MatchScore({
  score,
  matchable = true,
  size = 44,
  className,
}: {
  score: number;
  matchable?: boolean;
  size?: number;
  className?: string;
}) {
  const clamped = Math.max(0, Math.min(100, score));
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const tone = !matchable
    ? 'var(--muted-foreground)'
    : clamped >= 60
      ? 'var(--success)'
      : clamped >= 30
        ? 'var(--warning)'
        : 'var(--muted-foreground)';

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (clamped / 100) * c}
        />
      </svg>
      <span
        className="tnum absolute inset-0 flex items-center justify-center font-semibold"
        style={{ fontSize: size * 0.3, color: tone }}
      >
        {clamped}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small labelled key/value row                                        */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('space-y-1', className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function SkillTags({ skills, max = 8 }: { skills?: string[] | null; max?: number }) {
  const list = (skills ?? []).filter(Boolean);
  if (!list.length) return <span className="text-sm text-muted-foreground">—</span>;
  const shown = list.slice(0, max);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((s) => (
        <Badge key={s} variant="secondary" className="font-normal">
          {s}
        </Badge>
      ))}
      {list.length > max ? (
        <Badge variant="outline" className="font-normal text-muted-foreground">
          +{list.length - max}
        </Badge>
      ) : null}
    </div>
  );
}
