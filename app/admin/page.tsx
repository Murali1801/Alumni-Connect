import Link from 'next/link';
import { ShieldCheck, Download, Database } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAdminDashboard } from '@/lib/dashboard';
import { DashboardShell } from '@/components/dashboard/shell';
import {
  StatsCards,
  ActivityChart,
  PeopleCard,
  UpcomingSessionCard,
  ProgressRing,
  ItemListCard,
  HighlightCard,
  type PersonRow,
} from '@/components/dashboard/cards';
import { ClaimRateChart } from '@/components/admin/claim-rate-chart';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { formatFullDateTime, formatNumber } from '@/lib/format';

export const metadata = { title: 'Overview' };
export const dynamic = 'force-dynamic';

export default async function AdminOverviewPage() {
  const user = await requireUser(['admin']);
  const [badges, data] = await Promise.all([getNavBadges(user), getAdminDashboard()]);

  const queue: PersonRow[] = data.recentClaims.map((r: any) => ({
    id: r.id,
    name: r.full_name,
    detail: `${r.branch} ${r.batch_year} · ${r.email ?? 'no email on file'}`,
    status: 'awaiting review',
    tone: 'warning',
    href: '/admin/verification',
  }));

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Network overview"
      description="Claim health, verification workload and request throughput across the whole alumni network."
      actions={
        <>
          <Button className="h-9 w-full px-4 sm:w-auto" render={<Link href="/admin/verification" />}>
            <ShieldCheck className="size-4" />
            Work the queue
            {data.stats.queue > 0 ? (
              <span className="tnum ml-1 rounded bg-primary-foreground/20 px-1.5 text-[11px]">
                {data.stats.queue}
              </span>
            ) : null}
          </Button>
          <Button
            variant="outline"
            className="h-9 w-full px-4 sm:w-auto"
            render={<Link href="/admin/reports" />}
          >
            <Download className="size-4" />
            Reports and export
          </Button>
        </>
      }
    >
      <StatsCards
        stats={[
          {
            title: 'Alumni records',
            value: formatNumber(data.stats.totalRecords),
            subtitle: `${formatNumber(data.stats.companies)} employers on file`,
            href: '/admin/records',
          },
          {
            title: 'Claim rate',
            value: `${data.stats.claimRate}%`,
            subtitle: `${formatNumber(data.stats.claimedCount)} claimed, ${formatNumber(data.stats.verifiedCount)} verified`,
            href: '/admin/records',
          },
          {
            title: 'Verification queue',
            value: data.stats.queue,
            subtitle: data.stats.queue ? 'Claims awaiting a decision' : 'Queue is clear',
            href: '/admin/verification',
          },
          {
            title: 'Requests',
            value: formatNumber(data.stats.requestsTotal),
            subtitle: `${data.stats.responseRate}% answered · median ${data.stats.medianHours}h`,
            href: '/admin/requests',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ClaimRateChart data={data.claimRateByBatch} />
          <PeopleCard
            title="Awaiting verification"
            people={queue}
            action={{ label: 'Open queue', href: '/admin/verification' }}
            emptyText="No claims are waiting. Every claimed record has been reviewed."
          />
        </div>

        <div className="space-y-4">
          <ProgressRing
            title="Network liveness"
            value={data.stats.claimRate}
            caption="Records claimed"
            legend={[
              { label: 'Claimed', className: 'bg-primary' },
              { label: 'Dormant', className: 'bg-muted' },
            ]}
            footer={
              <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
                {formatNumber(data.stats.claimedCount)} of{' '}
                {formatNumber(data.stats.totalRecords)} institutional records have been claimed by
                a real account.
              </p>
            }
          />
          <UpcomingSessionCard
            sessions={data.upcoming.slice(0, 2).map((s) => ({
              room_id: s.room_id,
              title: s.title,
              scheduled_at: s.scheduled_at,
              duration_min: s.duration_min,
              peer_name: `${s.host_name} · ${s.guest_name}`,
            }))}
            scheduleHref="/admin/calendar"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <ActivityChart
          title="Request volume"
          legend="Network-wide, per week"
          data={data.activity}
          emptyText="No requests have been sent on the network yet."
        />

        <ItemListCard
          title="Company clusters"
          items={data.companyClusters.map((c) => ({
            id: c.company,
            title: c.company,
            subtitle: `${c.alumni} alumni · ${c.mentors} mentoring · ${c.referrers} referring`,
            emoji: '🏢',
            tone: 'bg-primary/10',
            href: '/admin/companies',
          }))}
          action={{ label: 'All', href: '/admin/companies' }}
          emptyText="No claimed profiles list a current employer yet."
        />

        <div className="space-y-4">
          <HighlightCard icon={<Database />} title="Data health" subtitle="Coverage of the ingested spreadsheet">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="opacity-80">Students registered</dt>
                <dd className="tnum font-semibold">{formatNumber(data.stats.students)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="opacity-80">Alumni accounts</dt>
                <dd className="tnum font-semibold">{formatNumber(data.stats.alumniUsers)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="opacity-80">Open opportunities</dt>
                <dd className="tnum font-semibold">{formatNumber(data.stats.openOpportunities)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="opacity-80">Video sessions</dt>
                <dd className="tnum font-semibold">{formatNumber(data.stats.sessions)}</dd>
              </div>
            </dl>
          </HighlightCard>

          <Card className="gap-0 p-5">
            <h2 className="mb-4 text-base font-semibold">Recent admin actions</h2>
            {data.audit.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing logged yet.
              </p>
            ) : (
              <ol className="space-y-3">
                {data.audit.slice(0, 5).map((a: any) => (
                  <li key={a.id} className="flex gap-3 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0">
                      <p className="truncate text-foreground">
                        <span className="font-medium">{a.actor?.full_name ?? 'System'}</span>{' '}
                        {a.action.replace(/_/g, ' ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatFullDateTime(a.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <Button variant="outline" size="sm" className="mt-4 w-full" render={<Link href="/admin/audit" />}>
              Full audit log
            </Button>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
