import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getStudentDashboard } from '@/lib/dashboard';
import { listCallsForUser } from '@/lib/calls';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { TrendChart, MixChart, FunnelCard, RankingChart } from '@/components/analytics/charts';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

export default async function StudentAnalyticsPage() {
  const user = await requireUser(['student']);
  const [badges, data, calls] = await Promise.all([
    getNavBadges(user),
    getStudentDashboard(user),
    listCallsForUser(user.id),
  ]);

  const byType = ['mentorship', 'mock_interview', 'referral', 'internship'].map((t) => ({
    label: t.replace('_', ' '),
    value: data.requests.filter((r: any) => r.type === t).length,
  }));

  // Which alumni actually replied — a request that sat unanswered is a
  // different failure from one that was declined.
  const answered = data.requests.filter((r: any) => r.responded_at);
  const waitTimes = answered
    .map((r: any) => (new Date(r.responded_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000)
    .sort((a: number, b: number) => a - b);
  const median = waitTimes.length ? Math.round(waitTimes[Math.floor(waitTimes.length / 2)]) : 0;

  const scoreBuckets = [
    { label: '0–24', value: 0 },
    { label: '25–49', value: 0 },
    { label: '50–74', value: 0 },
    { label: '75–100', value: 0 },
  ];
  for (const r of data.requests) {
    const s = r.match_score ?? 0;
    const idx = s >= 75 ? 3 : s >= 50 ? 2 : s >= 25 ? 1 : 0;
    scoreBuckets[idx].value++;
  }

  const sessionsRun = calls.filter(
    (c) => c.status !== 'cancelled' && new Date(c.scheduled_at).getTime() < Date.now()
  ).length;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Analytics"
      description="How your outreach is actually performing — what you sent, what came back, and how long it took."
    >
      <StatsCards
        stats={[
          { title: 'Requests sent', value: data.stats.sent, subtitle: 'All time' },
          {
            title: 'Answered',
            value: data.stats.sent ? `${Math.round((answered.length / data.stats.sent) * 100)}%` : '—',
            subtitle: `${answered.length} of ${data.stats.sent}`,
          },
          {
            title: 'Median wait',
            value: median ? `${median}h` : '—',
            subtitle: 'From sending to a reply',
          },
          { title: 'Sessions held', value: sessionsRun, subtitle: 'Video calls that have happened' },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart
            title="Outreach over time"
            description="Requests you sent, by week"
            data={data.activity}
            seriesLabel="Requests"
            emptyText="You have not sent a request yet."
          />
        </div>
        <FunnelCard
          title="Outreach funnel"
          description="Where your requests end up"
          stages={[
            { label: 'Sent', value: data.stats.sent },
            { label: 'Answered', value: answered.length, hint: 'Alumni who replied either way' },
            { label: 'Accepted', value: data.stats.accepted, hint: 'Agreed to help' },
            { label: 'Sessions held', value: sessionsRun, hint: 'Turned into a real conversation' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MixChart
          title="What you asked for"
          description="Split by request type"
          data={byType.filter((t) => t.value > 0)}
          emptyText="No requests to break down yet."
        />
        <RankingChart
          title="Match score at time of sending"
          description="Higher-scoring requests are answered more often"
          data={scoreBuckets.filter((b) => b.value > 0)}
          emptyText="Send a request to see this."
        />
        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">Reading this page</h2>
          <p className="mb-4 text-xs text-muted-foreground">What the numbers are actually telling you.</p>
          <ul className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">A low answer rate</span> usually means the
              message was generic. Name the specific thing you want.
            </li>
            <li>
              <span className="font-medium text-foreground">Low match scores</span> mean your target
              company and role are blank or far from anyone you are contacting — fix the profile first.
            </li>
            <li>
              <span className="font-medium text-foreground">Accepted but no session</span> is the most
              common leak. Book the video room while the reply is fresh.
            </li>
          </ul>
        </Card>
      </div>
    </DashboardShell>
  );
}
