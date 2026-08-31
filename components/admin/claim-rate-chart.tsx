'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card } from '@/components/ui/card';

export type BatchRow = { batch: number; total: number; claimed: number; rate: number };

/**
 * Claim rate per graduating batch. Bars carry the absolute counts and the line
 * carries the rate, because a batch of 700 at 8% and a batch of 11 at 80% are
 * very different problems and a single series hides that.
 */
export function ClaimRateChart({ data }: { data: BatchRow[] }) {
  const overall = data.reduce(
    (acc, d) => ({ total: acc.total + d.total, claimed: acc.claimed + d.claimed }),
    { total: 0, claimed: 0 }
  );
  const overallRate = overall.total ? Math.round((overall.claimed / overall.total) * 100) : 0;

  return (
    <Card className="animate-slide-in-up gap-0 p-5" style={{ animationDelay: '120ms' }}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Claim rate by batch</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Which graduating years have actually come online
          </p>
        </div>
        <span className="tnum rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          {overallRate}% overall
        </span>
      </div>

      {data.length === 0 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          No batch data available.
        </div>
      ) : (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/30" vertical={false} />
              <XAxis
                dataKey="batch"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'currentColor', fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis
                yAxisId="left"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'currentColor', fontSize: 11 }}
                className="text-muted-foreground"
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                axisLine={false}
                tickLine={false}
                domain={[0, 100]}
                unit="%"
                tick={{ fill: 'currentColor', fontSize: 11 }}
                className="text-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--popover)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                  color: 'var(--popover-foreground)',
                }}
                formatter={(value, name) => [name === 'rate' ? `${value}%` : value, String(name)]}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar yAxisId="left" dataKey="total" name="Records" fill="var(--chart-4)" radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Bar yAxisId="left" dataKey="claimed" name="Claimed" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={26} />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="rate"
                name="rate"
                stroke="var(--chart-3)"
                strokeWidth={2}
                dot={{ r: 2.5 }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
