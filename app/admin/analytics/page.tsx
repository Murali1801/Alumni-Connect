import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAdminDashboard } from '@/lib/dashboard';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { ClaimRateChart } from '@/components/admin/claim-rate-chart';
import { TrendChart, MixChart, FunnelCard, RankingChart } from '@/components/analytics/charts';

export const metadata = { title: 'Analytics' };
export const dynamic = 'force-dynamic';

export default async function AdminAnalyticsPage() {
  const user = await requireUser(['admin']);
  const [badges, data] = await Promise.all([getNavBadges(user), getAdminDashboard()]);

  const answered = Math.round((data.stats.responseRate / 100) * data.stats.requestsTotal);

  // Batches with the worst claim rates are where outreach should go next.
  const weakest = [...data.claimRateByBatch]
    .filter((b) => b.total >= 20)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 8)
    .map((b) => ({ label: `Batch ${b.batch}`, value: b.rate }));

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Analytics"
      description="Claim coverage, request throughput and where the network is thin enough to need intervention."
    >
      <StatsCards
        stats={[
          {
            title: 'Claim rate',
            value: `${data.stats.claimRate}%`,
            subtitle: `${data.stats.claimedCount.toLocaleString()} of ${data.stats.totalRecords.toLocaleString()} records`,
          },
          {
            title: 'Verified',
            value: data.stats.verifiedCount.toLocaleString(),
            subtitle: `${data.stats.queue} still in the queue`,
          },
          {
            title: 'Request response rate',
            value: `${data.stats.responseRate}%`,
            subtitle: `median ${data.stats.medianHours}h to a reply`,
          },
          {
            title: 'Sessions booked',
            value: data.stats.sessions,
            subtitle: 'Video calls scheduled network-wide',
          },
        ]}
      />

      <ClaimRateChart data={data.claimRateByBatch} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart
            title="Request volume"
            description="Network-wide, by week"
            data={data.activity}
            seriesLabel="Requests"
            emptyText="No requests have been sent on the network yet."
          />
        </div>
        <FunnelCard
          title="Network funnel"
          description="From an institutional record to a real conversation"
          stages={[
            { label: 'Records on file', value: data.stats.totalRecords },
            { label: 'Claimed', value: data.stats.claimedCount, hint: 'An account is attached' },
            { label: 'Verified', value: data.stats.verifiedCount, hint: 'An administrator confirmed it' },
            { label: 'Sessions booked', value: data.stats.sessions, hint: 'Turned into a live conversation' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MixChart
          title="Request mix"
          description="What students are asking alumni for"
          data={data.requestMix.filter((r) => r.value > 0)}
          emptyText="No requests to break down yet."
        />
        <RankingChart
          title="Batches needing outreach"
          description="Lowest claim rate among batches with 20+ records"
          data={weakest}
          emptyText="Not enough batch data yet."
        />
        <RankingChart
          title="Largest employer clusters"
          description="Claimed alumni by current employer"
          data={data.companyClusters.map((c) => ({ label: c.company, value: c.alumni }))}
          emptyText="No claimed profiles list an employer yet."
        />
      </div>

      <FunnelCard
        title="Request outcomes"
        description="What happens after a student presses send"
        stages={[
          { label: 'Sent', value: data.stats.requestsTotal },
          { label: 'Answered', value: answered, hint: 'Accepted or declined' },
          { label: 'Still pending', value: data.stats.requestsPending, hint: 'No reply yet' },
        ]}
      />
    </DashboardShell>
  );
}
