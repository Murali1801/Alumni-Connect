import { FileText, Users, Building2, Inbox, Briefcase } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAdminDashboard } from '@/lib/dashboard';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { ExportCard } from '@/components/admin/export-card';
import { DataTable, type Column } from '@/components/admin/data-table';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/patterns';
import { formatNumber } from '@/lib/format';

export const metadata = { title: 'Reports' };
export const dynamic = 'force-dynamic';

const DATASETS = [
  {
    key: 'alumni',
    label: 'Alumni records',
    icon: Users,
    body: 'The institutional dataset with claim status. Contact columns are excluded.',
  },
  {
    key: 'companies',
    label: 'Companies',
    icon: Building2,
    body: 'Canonicalised employers with their industry, as resolved during ingest.',
  },
  {
    key: 'requests',
    label: 'Requests',
    icon: Inbox,
    body: 'Request outcomes and timings. Message bodies are excluded — they are private.',
  },
  {
    key: 'opportunities',
    label: 'Opportunities',
    icon: Briefcase,
    body: 'Every posted role with its target skills and open/closed state.',
  },
] as const;

type BatchRow = { batch: number; total: number; claimed: number; rate: number };

export default async function AdminReportsPage() {
  const user = await requireUser(['admin']);
  const [badges, data] = await Promise.all([getNavBadges(user), getAdminDashboard()]);

  const columns: Column<BatchRow>[] = [
    { key: 'batch', header: 'Batch', cell: (r) => r.batch },
    { key: 'total', header: 'Records', numeric: true, cell: (r) => formatNumber(r.total) },
    { key: 'claimed', header: 'Claimed', numeric: true, cell: (r) => formatNumber(r.claimed) },
    {
      key: 'rate',
      header: 'Claim rate',
      numeric: true,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
            <span className="block h-full rounded-full bg-primary" style={{ width: `${r.rate}%` }} />
          </span>
          {r.rate}%
        </span>
      ),
    },
    {
      key: 'gap',
      header: 'Unclaimed',
      numeric: true,
      cell: (r) => formatNumber((r.total - r.claimed)),
    },
  ];

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Reports"
      description="Snapshot figures for the placement cell, and CSV exports of the underlying data. Every export is written to the audit log."
    >
      <StatsCards
        stats={[
          {
            title: 'Records covered',
            value: formatNumber(data.stats.totalRecords),
            subtitle: `${data.claimRateByBatch.length} graduating years`,
          },
          {
            title: 'Claim rate',
            value: `${data.stats.claimRate}%`,
            subtitle: `${formatNumber(data.stats.claimedCount)} accounts attached`,
          },
          {
            title: 'Requests logged',
            value: formatNumber(data.stats.requestsTotal),
            subtitle: `${data.stats.responseRate}% answered`,
          },
          {
            title: 'Employers',
            value: formatNumber(data.stats.companies),
            subtitle: 'After canonicalisation',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {DATASETS.map((d) => (
          <ExportCard
            key={d.key}
            dataset={d.key}
            label={d.label}
            body={d.body}
            icon={<d.icon className="size-4" />}
          />
        ))}
      </div>

      <Card className="gap-0 p-5">
        <h2 className="mb-1 text-base font-semibold text-foreground">Claim coverage by batch</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          The batches with the largest unclaimed counts are where a mailing campaign buys the most.
        </p>
        <DataTable
          columns={columns}
          rows={data.claimRateByBatch}
          getRowKey={(r) => String(r.batch)}
          empty={<EmptyState icon={FileText} title="No batch data available" />}
        />
      </Card>
    </DashboardShell>
  );
}
