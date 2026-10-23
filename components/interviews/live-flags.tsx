'use client';

import * as React from 'react';
import { Radio } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { PROCTOR_META, type IntegritySummary } from '@/lib/interview-logic';
import { IntegritySummaryCard, ProctorTimeline, type ReportEvent } from '@/components/interviews/proctor-report';

const POLL_MS = 4000;

/**
 * The interviewer's live view of a proctored round, polled. A new high-severity
 * event also arrives as a toast, since the panel may be scrolled away.
 */
export function LiveFlags({
  interviewId,
  roundId,
  compact,
  announce = true,
}: {
  interviewId: string;
  roundId: string;
  compact?: boolean;
  announce?: boolean;
}) {
  const [data, setData] = React.useState<{ summary: IntegritySummary; events: ReportEvent[] } | null>(null);
  const [error, setError] = React.useState(false);
  const seen = React.useRef<Set<string> | null>(null);

  React.useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      try {
        const res = await fetch(`/api/interviews/${interviewId}/proctor?round=${roundId}`, { cache: 'no-store' });
        if (!res.ok) throw new Error();
        const next = (await res.json()) as { summary: IntegritySummary; events: ReportEvent[] };
        if (stopped) return;
        // The first load is history; only what arrives after it is announced.
        if (seen.current && announce) {
          for (const e of next.events) {
            if (seen.current.has(e.id)) continue;
            if (PROCTOR_META[e.type]?.severity === 'high') toast.warning(PROCTOR_META[e.type].label);
          }
        }
        seen.current = new Set(next.events.map((e) => e.id));
        setData(next);
        setError(false);
      } catch {
        if (!stopped) setError(true);
      }
      if (!stopped && document.visibilityState !== 'hidden') timer = setTimeout(() => void poll(), POLL_MS);
      else if (!stopped) timer = setTimeout(() => void poll(), POLL_MS * 4);
    };
    void poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [interviewId, roundId, announce]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className={cn('inline-flex items-center gap-1.5 text-xs font-medium', error ? 'text-destructive' : 'text-[var(--success)]')}>
          <Radio className="size-3.5" />
          {error ? 'Live updates paused — retrying' : 'Live'}
        </span>
        {data && (
          <span className="tnum ml-auto text-xs text-muted-foreground">
            {data.summary.totalFlags} flag{data.summary.totalFlags === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {data ? (
        <>
          <IntegritySummaryCard summary={data.summary} compact />
          {!compact && <ProctorTimeline events={data.events} limit={30} />}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Loading…</p>
      )}
    </div>
  );
}
