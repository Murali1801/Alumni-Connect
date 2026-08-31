'use client';

import * as React from 'react';
import {
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';

const PIE_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'];

const TOOLTIP_STYLE = {
  background: 'var(--popover)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--popover-foreground)',
} as const;

function Empty({ text }: { text: string }) {
  return (
    <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
      {text}
    </div>
  );
}

/* ---------------- trend over time ---------------- */

export function TrendChart({
  title,
  description,
  data,
  seriesLabel,
  emptyText = 'Nothing recorded in this window.',
}: {
  title: string;
  description?: string;
  data: { label: string; value: number }[];
  seriesLabel: string;
  emptyText?: string;
}) {
  const isEmpty = data.every((d) => d.value === 0);
  return (
    <Card className="animate-slide-in-up gap-0 p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {isEmpty ? (
        <Empty text={emptyText} />
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
              <defs>
                <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
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
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area
                type="monotone"
                dataKey="value"
                name={seriesLabel}
                stroke="var(--chart-1)"
                strokeWidth={2}
                fill="url(#trendFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}

/* ---------------- categorical mix ---------------- */

export function MixChart({
  title,
  description,
  data,
  emptyText = 'No data to break down yet.',
}: {
  title: string;
  description?: string;
  data: { label: string; value: number }[];
  emptyText?: string;
}) {
  const total = data.reduce((a, b) => a + b.value, 0);

  return (
    <Card className="animate-slide-in-up gap-0 p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>

      {total === 0 ? (
        <Empty text={emptyText} />
      ) : (
        <>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="55%"
                  outerRadius="85%"
                  paddingAngle={2}
                  stroke="none"
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, textTransform: 'capitalize' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="mt-3 space-y-1.5 border-t border-border pt-3">
            {data.map((d, i) => (
              <li key={d.label} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                />
                <span className="flex-1 capitalize text-muted-foreground">{d.label}</span>
                <span className="tnum font-medium text-foreground">{d.value}</span>
                <span className="tnum w-10 text-right text-xs text-muted-foreground">
                  {Math.round((d.value / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/* ---------------- funnel ---------------- */

export function FunnelCard({
  title,
  description,
  stages,
}: {
  title: string;
  description?: string;
  stages: { label: string; value: number; hint?: string }[];
}) {
  const max = Math.max(1, ...stages.map((s) => s.value));

  return (
    <Card className="animate-slide-in-up gap-0 p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <ol className="space-y-3">
        {stages.map((s, i) => {
          const pct = Math.round((s.value / max) * 100);
          const dropFromPrev =
            i > 0 && stages[i - 1].value > 0 ? Math.round((s.value / stages[i - 1].value) * 100) : null;
          return (
            <li key={s.label}>
              <div className="mb-1 flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">{s.label}</span>
                <span className="tnum text-sm text-foreground">
                  {s.value}
                  {dropFromPrev !== null && (
                    <span className="ml-1.5 text-xs text-muted-foreground">{dropFromPrev}%</span>
                  )}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn('h-full rounded-full transition-all', i === 0 ? 'bg-chart-1' : 'bg-chart-2')}
                  style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                />
              </div>
              {s.hint && <p className="mt-1 text-xs text-muted-foreground">{s.hint}</p>}
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/* ---------------- horizontal ranking ---------------- */

export function RankingChart({
  title,
  description,
  data,
  emptyText = 'Nothing to rank yet.',
}: {
  title: string;
  description?: string;
  data: { label: string; value: number }[];
  emptyText?: string;
}) {
  return (
    <Card className="animate-slide-in-up gap-0 p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {data.length === 0 ? (
        <Empty text={emptyText} />
      ) : (
        <div style={{ height: Math.max(180, data.length * 34) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/30" horizontal={false} />
              <XAxis
                type="number"
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                tick={{ fill: 'currentColor', fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis
                type="category"
                dataKey="label"
                width={130}
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'currentColor', fontSize: 11 }}
                className="text-muted-foreground"
              />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)' }} />
              <Bar dataKey="value" fill="var(--chart-1)" radius={[0, 4, 4, 0]} maxBarSize={18} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
