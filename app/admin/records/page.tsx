import { Database } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getDirectory, getDirectoryFacets } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { DirectoryFilters } from '@/components/directory/filters';
import { Pagination } from '@/components/directory/pagination';
import { DataTable, type Column } from '@/components/admin/data-table';
import { StatsCards } from '@/components/dashboard/cards';
import { EmptyState, StatusPill, InitialsAvatar } from '@/components/patterns';
import type { DirectoryItem } from '@/lib/queries';

export const metadata = { title: 'Alumni records' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminRecordsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin']);
  const sp = await searchParams;

  const filters = {
    q: first(sp.q) ?? '',
    branch: first(sp.branch) ?? 'all',
    batch: first(sp.batch) ?? 'all',
    availability: first(sp.availability) ?? 'all',
    // Admins default to seeing everything — the whole ingested spreadsheet.
    status: first(sp.status) ?? 'any',
    sort: first(sp.sort) ?? 'batch',
    page: Number(first(sp.page) ?? 1) || 1,
    pageSize: 25,
  };

  const [badges, facets] = await Promise.all([getNavBadges(user), getDirectoryFacets()]);
  const result = await getDirectory(filters, null);

  const columns: Column<DirectoryItem>[] = [
    {
      key: 'name',
      header: 'Alumnus',
      cell: ({ record }) => (
        <div className="flex items-center gap-2.5">
          <InitialsAvatar name={record.full_name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{record.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {record.alumni_profiles?.designation ?? record.first_role ?? '—'}
            </p>
          </div>
        </div>
      ),
    },
    { key: 'branch', header: 'Branch', cell: ({ record }) => record.branch },
    { key: 'batch', header: 'Batch', numeric: true, cell: ({ record }) => record.batch_year },
    { key: 'city', header: 'City', cell: ({ record }) => record.city ?? '—' },
    {
      key: 'company',
      header: 'Employer',
      cell: ({ record }) =>
        record.alumni_profiles?.current_company?.name ?? record.first_company?.name ?? '—',
    },
    {
      key: 'ctc',
      header: 'First CTC',
      numeric: true,
      cell: ({ record }) => (record.first_ctc_lpa ? `${record.first_ctc_lpa} LPA` : '—'),
    },
    {
      key: 'status',
      header: 'Claim',
      cell: ({ record }) => <StatusPill status={record.claim_status} />,
    },
    {
      key: 'offers',
      header: 'Available for',
      cell: ({ record }) => {
        const p = record.alumni_profiles;
        if (!p) return <span className="text-muted-foreground">—</span>;
        const offers = [
          p.mentorship_available && 'Mentorship',
          p.mock_interview_available && 'Mocks',
          p.referral_available && 'Referrals',
          p.internship_available && 'Internships',
        ].filter(Boolean);
        return offers.length ? (
          <span className="text-xs">{offers.join(', ')}</span>
        ) : (
          <span className="text-muted-foreground">Nothing</span>
        );
      },
    },
  ];

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Alumni records"
      description="The full institutional dataset from the college spreadsheet, joined to any claimed profile. Contact columns are never loaded into this view."
    >
      <StatsCards
        stats={[
          { title: 'Matching records', value: result.total.toLocaleString(), subtitle: 'With current filters' },
          {
            title: 'Claimed on this page',
            value: result.items.filter((i) => i.record.claim_status !== 'unclaimed').length,
            subtitle: `of ${result.items.length} shown`,
          },
          { title: 'Branches', value: facets.branches.length, subtitle: 'Distinct branch codes' },
          { title: 'Batches', value: facets.batches.length, subtitle: 'Graduating years on file' },
        ]}
      />

      <DirectoryFilters
        basePath="/admin/records"
        branches={facets.branches}
        batches={facets.batches}
        current={filters}
      />

      <DataTable
        columns={columns}
        rows={result.items}
        getRowKey={(i) => i.record.id}
        caption={`Page ${result.page} of ${result.pageCount} · ${result.total.toLocaleString()} records match`}
        empty={
          <EmptyState
            icon={Database}
            title="No records match"
            description="Widen the filters — the default here already includes unclaimed records."
          />
        }
      />

      <Pagination
        basePath="/admin/records"
        page={result.page}
        pageCount={result.pageCount}
        total={result.total}
        params={sp}
      />
    </DashboardShell>
  );
}
