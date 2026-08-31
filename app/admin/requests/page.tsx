import { Inbox } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAllRequests } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { DataTable, type Column } from '@/components/admin/data-table';
import { TableFilters } from '@/components/admin/table-filters';
import { Pagination } from '@/components/directory/pagination';
import { EmptyState, StatusPill, InitialsAvatar, MatchScore } from '@/components/patterns';
import type { RequestRow } from '@/lib/queries';
import { formatCompactDate, formatNumber } from '@/lib/format';

export const metadata = { title: 'Requests' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const PAGE_SIZE = 25;

export default async function AdminRequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin']);
  const sp = await searchParams;
  const q = first(sp.q) ?? '';
  const status = first(sp.status) ?? 'all';
  const type = first(sp.type) ?? 'all';
  const page = Math.max(1, Number(first(sp.page) ?? 1) || 1);

  const [badges, all] = await Promise.all([getNavBadges(user), getAllRequests(1000)]);

  let rows = all;
  if (status !== 'all') rows = rows.filter((r) => r.status === status);
  if (type !== 'all') rows = rows.filter((r) => r.type === type);
  if (q) {
    const term = q.toLowerCase();
    rows = rows.filter((r) =>
      `${r.student?.full_name ?? ''} ${r.alumni?.full_name ?? ''} ${r.message}`.toLowerCase().includes(term)
    );
  }

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const answered = all.filter((r) => r.responded_at);
  const gaps = answered
    .map((r) => (new Date(r.responded_at!).getTime() - new Date(r.created_at).getTime()) / 3_600_000)
    .sort((a, b) => a - b);
  const median = gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : 0;

  const columns: Column<RequestRow>[] = [
    {
      key: 'student',
      header: 'Student',
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <InitialsAvatar name={r.student?.full_name ?? '?'} size="sm" />
          <span className="truncate">{r.student?.full_name ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'alumni',
      header: 'Alumnus',
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <InitialsAvatar name={r.alumni?.full_name ?? '?'} size="sm" />
          <span className="truncate">{r.alumni?.full_name ?? '—'}</span>
        </div>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      cell: (r) => <span className="capitalize">{r.type.replace('_', ' ')}</span>,
    },
    { key: 'status', header: 'Status', cell: (r) => <StatusPill status={r.status} /> },
    {
      key: 'score',
      header: 'Match',
      cell: (r) =>
        r.match_score !== null ? (
          <MatchScore score={r.match_score} size={32} />
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'sent',
      header: 'Sent',
      cell: (r) =>
formatCompactDate(r.created_at),
    },
    {
      key: 'wait',
      header: 'Replied in',
      numeric: true,
      cell: (r) => {
        if (!r.responded_at) return <span className="text-muted-foreground">pending</span>;
        const hours = Math.round(
          (new Date(r.responded_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000
        );
        return hours < 48 ? `${hours}h` : `${Math.round(hours / 24)}d`;
      },
    },
  ];

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Requests"
      description="Every mentorship, mock-interview, referral and internship request on the network. Read-only — responding is the alumnus’ decision, not yours."
    >
      <StatsCards
        stats={[
          { title: 'Total requests', value: formatNumber(all.length), subtitle: 'All time' },
          {
            title: 'Still pending',
            value: all.filter((r) => r.status === 'pending').length,
            subtitle: 'Awaiting an alumnus',
          },
          {
            title: 'Response rate',
            value: all.length ? `${Math.round((answered.length / all.length) * 100)}%` : '—',
            subtitle: `${answered.length} answered`,
          },
          { title: 'Median reply time', value: median ? `${median}h` : '—', subtitle: 'Across the network' },
        ]}
      />

      <TableFilters
        basePath="/admin/requests"
        q={q}
        placeholder="Search by student, alumnus or message…"
        selects={[
          {
            key: 'status',
            value: status,
            label: 'Status',
            options: [
              { value: 'all', label: 'All statuses' },
              { value: 'pending', label: 'Pending' },
              { value: 'accepted', label: 'Accepted' },
              { value: 'declined', label: 'Declined' },
              { value: 'closed', label: 'Closed' },
            ],
          },
          {
            key: 'type',
            value: type,
            label: 'Type',
            options: [
              { value: 'all', label: 'All types' },
              { value: 'mentorship', label: 'Mentorship' },
              { value: 'mock_interview', label: 'Mock interview' },
              { value: 'referral', label: 'Referral' },
              { value: 'internship', label: 'Internship' },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        rows={visible}
        getRowKey={(r) => r.id}
        caption={`Page ${page} of ${pageCount} · ${formatNumber(total)} requests match`}
        empty={<EmptyState icon={Inbox} title="No requests match" description="Try clearing the filters." />}
      />

      <Pagination basePath="/admin/requests" page={page} pageCount={pageCount} total={total} params={sp} />
    </DashboardShell>
  );
}
