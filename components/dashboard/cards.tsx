'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { Plus, Video, ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InitialsAvatar } from '@/components/patterns';
import { formatDateTime } from '@/lib/format';

/* ------------------------------------------------------------------ */
/* Stat tiles                                                          */
/* ------------------------------------------------------------------ */

export type Stat = { title: string; value: string | number; subtitle: string; href?: string };

export function StatsCards({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, i) => {
        const inner = (
          <Card
            className="animate-slide-in-up gap-0 rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <h3 className="mb-3 text-xs font-medium text-muted-foreground">{stat.title}</h3>
            <p className="tnum mb-1 font-display text-3xl text-foreground">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.subtitle}</p>
          </Card>
        );
        return stat.href ? (
          <Link key={stat.title} href={stat.href} className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {inner}
          </Link>
        ) : (
          <React.Fragment key={stat.title}>{inner}</React.Fragment>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bar chart panel                                                     */
/* ------------------------------------------------------------------ */

const BAR_COLORS = ['#6366f1', '#8b5cf6', '#a855f7', '#6366f1', '#8b5cf6', '#a855f7', '#6366f1', '#8b5cf6', '#a855f7', '#6366f1'];

export function ActivityChart({
  title,
  legend,
  data,
  unit = '',
  emptyText = 'No activity in this window yet.',
}: {
  title: string;
  legend: string;
  data: { label: string; value: number }[];
  unit?: string;
  emptyText?: string;
}) {
  const [hovered, setHovered] = React.useState<number | null>(null);
  const values = data.map((d) => d.value);
  const max = values.length ? Math.max(...values) : 0;
  const average = values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  const isEmpty = max === 0;

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background shadow-lg">
        <p className="tnum font-bold">
          {payload[0].value}
          {unit}
        </p>
        <p className="text-[10px] opacity-80">{payload[0].payload.label}</p>
      </div>
    );
  };

  return (
    <Card className="animate-slide-in-up gap-0 p-5" style={{ animationDelay: '120ms' }}>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-2 rounded-full bg-primary" />
          <span>{legend}</span>
        </div>
      </div>

      {isEmpty ? (
        <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          {emptyText}
        </div>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 12, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/30" vertical={false} />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'currentColor', fontSize: 11 }}
                className="text-muted-foreground"
                interval="preserveStartEnd"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tick={{ fill: 'currentColor', fontSize: 11 }}
                className="text-muted-foreground"
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
              <Bar
                dataKey="value"
                radius={[8, 8, 8, 8]}
                maxBarSize={44}
                onMouseEnter={(_, index) => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
              >
                {data.map((_, index) => (
                  <Cell
                    key={index}
                    fill={BAR_COLORS[index % BAR_COLORS.length]}
                    style={{
                      filter: hovered === index ? 'brightness(1.15)' : 'none',
                      transition: 'filter 200ms',
                    }}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-sm">
        <span className="text-muted-foreground">
          Average: <span className="tnum font-semibold text-foreground">{average}{unit}</span>
        </span>
        <span className="text-muted-foreground">
          Peak: <span className="tnum font-semibold text-primary">{max}{unit}</span>
        </span>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* People list (Team Collaboration equivalent)                         */
/* ------------------------------------------------------------------ */

export type PersonRow = {
  id: string;
  name: string;
  detail: string;
  status: string;
  tone: 'success' | 'warning' | 'danger' | 'muted';
  href?: string;
};

const TONE: Record<PersonRow['tone'], string> = {
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400',
  danger: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-400',
  muted: 'bg-muted text-muted-foreground',
};

export function PeopleCard({
  title,
  people,
  action,
  emptyText,
}: {
  title: string;
  people: PersonRow[];
  action?: { label: string; href: string };
  emptyText: string;
}) {
  return (
    <Card className="animate-slide-in-up gap-0 p-5" style={{ animationDelay: '180ms' }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {action && (
          <Button variant="outline" size="sm" render={<Link href={action.href} />}>
            <Plus className="size-3.5" />
            {action.label}
          </Button>
        )}
      </div>

      {people.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-1">
          {people.map((p) => {
            const row = (
              <div className="group flex items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-secondary">
                <InitialsAvatar name={p.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{p.detail}</p>
                </div>
                <span
                  className={cn(
                    'shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium capitalize',
                    TONE[p.tone]
                  )}
                >
                  {p.status}
                </span>
              </div>
            );
            return p.href ? (
              <Link key={p.id} href={p.href} className="block">
                {row}
              </Link>
            ) : (
              <React.Fragment key={p.id}>{row}</React.Fragment>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Upcoming session (Reminders equivalent) — the video-call entry point */
/* ------------------------------------------------------------------ */

export type UpcomingSession = {
  room_id: string;
  title: string;
  scheduled_at: string;
  duration_min: number;
  peer_name: string;
};

export function UpcomingSessionCard({
  sessions,
  scheduleHref,
}: {
  sessions: UpcomingSession[];
  scheduleHref: string;
}) {
  return (
    <Card className="animate-slide-in-up gap-0 p-5" style={{ animationDelay: '240ms' }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">Upcoming sessions</h2>
        <Button variant="ghost" size="sm" render={<Link href={scheduleHref} />}>
          All
          <ArrowRight className="size-3.5" />
        </Button>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No video sessions scheduled.</p>
          <Button size="sm" className="mt-3" render={<Link href={scheduleHref} />}>
            Schedule one
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.slice(0, 2).map((s) => (
            <div
              key={s.room_id}
              className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md"
            >
              <h3 className="mb-1 font-semibold text-foreground">{s.title}</h3>
              <p className="mb-1 text-sm text-muted-foreground">with {s.peer_name}</p>
              <p className="mb-4 text-sm text-muted-foreground">
                {formatDateTime(s.scheduled_at)}{' '}
                · {s.duration_min} min
              </p>
              <Button className="w-full" render={<Link href={`/call/${s.room_id}`} />}>
                <Video className="size-4" />
                Join video room
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Radial progress (Project Progress equivalent)                       */
/* ------------------------------------------------------------------ */

export function ProgressRing({
  title,
  value,
  caption,
  legend,
  footer,
}: {
  title: string;
  value: number;
  caption: string;
  legend?: { label: string; className: string }[];
  footer?: React.ReactNode;
}) {
  const [shown, setShown] = React.useState(0);
  React.useEffect(() => {
    // Ease toward the real number so the ring reads as a measurement settling,
    // not a decorative loop.
    const id = setInterval(() => {
      setShown((prev) => {
        if (prev >= value) {
          clearInterval(id);
          return value;
        }
        return prev + Math.max(1, Math.ceil((value - prev) / 8));
      });
    }, 24);
    return () => clearInterval(id);
  }, [value]);

  const circumference = 2 * Math.PI * 70;
  const offset = circumference - (shown / 100) * circumference;

  return (
    <Card className="animate-slide-in-up gap-0 overflow-hidden p-5" style={{ animationDelay: '300ms' }}>
      <h2 className="mb-4 text-base font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col items-center">
        <div className="relative mb-4 size-40">
          <svg className="size-full -rotate-90" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r="70" stroke="currentColor" strokeWidth="12" fill="none" className="text-muted" />
            <circle
              cx="80"
              cy="80"
              r="70"
              stroke="currentColor"
              strokeWidth="12"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              className="text-primary transition-all duration-500 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="tnum font-display text-4xl text-foreground">{shown}%</span>
            <span className="mt-1 text-xs text-muted-foreground">{caption}</span>
          </div>
        </div>
        {legend && (
          <div className="flex flex-wrap justify-center gap-3 text-xs">
            {legend.map((l) => (
              <div key={l.label} className="flex items-center gap-1.5">
                <span className={cn('size-2.5 shrink-0 rounded-full', l.className)} />
                <span className="whitespace-nowrap text-muted-foreground">{l.label}</span>
              </div>
            ))}
          </div>
        )}
        {footer}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Compact item list (Project List equivalent)                         */
/* ------------------------------------------------------------------ */

export type ListItem = {
  id: string;
  title: string;
  subtitle: string;
  emoji?: string;
  tone?: string;
  href?: string;
};

export function ItemListCard({
  title,
  items,
  action,
  emptyText,
  delay = 360,
}: {
  title: string;
  items: ListItem[];
  action?: { label: string; href: string };
  emptyText: string;
  delay?: number;
}) {
  return (
    <Card className="animate-slide-in-up gap-0 p-5" style={{ animationDelay: `${delay}ms` }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {action && (
          <Button variant="outline" size="sm" render={<Link href={action.href} />}>
            <Plus className="size-3.5" />
            {action.label}
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyText}
        </p>
      ) : (
        <div className="space-y-1">
          {items.map((item) => {
            const row = (
              <div className="group flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-colors hover:bg-secondary">
                <div
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-lg text-lg transition-transform duration-300 group-hover:scale-110',
                    item.tone ?? 'bg-primary/10'
                  )}
                >
                  {item.emoji ?? '•'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{item.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                </div>
              </div>
            );
            return item.href ? (
              <Link key={item.id} href={item.href} className="block">
                {row}
              </Link>
            ) : (
              <React.Fragment key={item.id}>{row}</React.Fragment>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Inverted highlight card (Mobile App Card equivalent)                */
/* ------------------------------------------------------------------ */

export function HighlightCard({
  icon,
  title,
  subtitle,
  children,
  delay = 420,
}: {
  /**
   * A rendered element, not a component reference — server components may only
   * pass plain data and elements across the client boundary.
   */
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children?: React.ReactNode;
  delay?: number;
}) {
  return (
    <Card
      className="animate-slide-in-up relative gap-0 overflow-hidden bg-foreground p-5 text-background"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 overflow-hidden opacity-30">
        <svg className="absolute bottom-0 w-full" viewBox="0 0 200 60" preserveAspectRatio="none" style={{ height: 100 }}>
          <path d="M0,30 Q25,15 50,30 T100,30 T150,30 T200,30 L200,60 L0,60 Z" fill="currentColor" opacity="0.35" />
          <path d="M0,42 Q25,27 50,42 T100,42 T150,42 T200,42 L200,60 L0,60 Z" fill="currentColor" opacity="0.6" />
        </svg>
      </div>
      <div className="relative z-10">
        <span className="mb-3 block [&>svg]:size-6">{icon}</span>
        <h2 className="mb-1 font-display text-xl">{title}</h2>
        <p className="mb-4 text-xs opacity-80">{subtitle}</p>
        {children}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Countdown / live metric card (Time Tracker equivalent)              */
/* ------------------------------------------------------------------ */

export function CountdownCard({
  title,
  target,
  caption,
  fallback,
  delay = 480,
}: {
  title: string;
  /** ISO timestamp being counted down to. */
  target: string | null;
  caption: string;
  fallback: React.ReactNode;
  delay?: number;
}) {
  const [now, setNow] = React.useState<number | null>(null);

  React.useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = target && now ? new Date(target).getTime() - now : null;

  return (
    <Card
      className="animate-slide-in-up relative gap-0 overflow-hidden bg-foreground p-5 text-background"
      style={{ animationDelay: `${delay}ms` }}
    >
      <h2 className="mb-4 text-base font-semibold">{title}</h2>
      {remaining === null ? (
        <div className="text-sm opacity-80">{fallback}</div>
      ) : remaining <= 0 ? (
        <>
          <div className="mb-2 font-mono text-3xl font-bold tracking-tight">Live now</div>
          <p className="text-xs opacity-80">{caption}</p>
        </>
      ) : (
        <>
          <div className="mb-3 break-all font-mono text-3xl font-bold tracking-tight sm:text-4xl">
            {formatCountdown(remaining)}
          </div>
          <p className="text-xs opacity-80">{caption}</p>
        </>
      )}
    </Card>
  );
}

function formatCountdown(ms: number) {
  const total = Math.floor(ms / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return days > 0
    ? `${days}d ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
