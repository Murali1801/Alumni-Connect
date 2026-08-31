import { ShieldCheck } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { createAdminClient } from '@/lib/supabase/admin';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { DataTable, type Column } from '@/components/admin/data-table';
import { Pagination } from '@/components/directory/pagination';
import { EmptyState, InitialsAvatar } from '@/components/patterns';
import { Badge } from '@/components/ui/badge';
import { formatFullDateTime, formatNumber } from '@/lib/format';

export const metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type AuditRow = {
  id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  detail: Record<string, any> | null;
  created_at: string;
  actor: { full_name: string; email: string } | null;
};

const PAGE_SIZE = 30;

export default async function AdminAuditPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin']);
  const sp = await searchParams;
  const page = Math.max(1, Number(first(sp.page) ?? 1) || 1);

  const db = createAdminClient();
  const from = (page - 1) * PAGE_SIZE;

  const [badges, res, verified, rejected] = await Promise.all([
    getNavBadges(user),
    db
      .from('audit_log')
      .select(
        'id, action, target_type, target_id, detail, created_at, actor:users!actor_id(full_name, email)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1),
    db.from('audit_log').select('*', { count: 'exact', head: true }).eq('action', 'mark_verified'),
    db.from('audit_log').select('*', { count: 'exact', head: true }).eq('action', 'mark_rejected'),
  ]);

  const rows: AuditRow[] = (res.data ?? []).map((r: any) => ({
    ...r,
    actor: Array.isArray(r.actor) ? r.actor[0] : r.actor,
  }));

  const total = res.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const verifiedCount = verified.count ?? 0;
  const rejectedCount = rejected.count ?? 0;

  const columns: Column<AuditRow>[] = [
    {
      key: 'actor',
      header: 'Administrator',
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <InitialsAvatar name={r.actor?.full_name ?? '?'} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{r.actor?.full_name ?? 'Unknown'}</p>
            <p className="truncate text-xs text-muted-foreground">{r.actor?.email ?? '—'}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'action',
      header: 'Action',
      cell: (r) => (
        <Badge
          variant={r.action.includes('rejected') || r.action.includes('close') ? 'destructive' : 'secondary'}
          className="font-normal"
        >
          {r.action.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    { key: 'target', header: 'Target', cell: (r) => <span className="text-xs">{r.target_type}</span> },
    {
      key: 'id',
      header: 'Record',
      cell: (r) => (
        <span className="font-mono text-[11px] text-muted-foreground">
          {r.target_id ? `${r.target_id.slice(0, 8)}…` : '—'}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'Detail',
      cell: (r) => {
        const note = r.detail?.note ?? r.detail?.reason;
        return note ? (
          <span className="text-xs text-muted-foreground">{String(note)}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    {
      key: 'when',
      header: 'When',
      cell: (r) =>
formatFullDateTime(r.created_at),
    },
  ];

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Audit log"
      description="An append-only record of every administrative decision. Nothing here can be edited or deleted from the console."
    >
      <StatsCards
        stats={[
          { title: 'Entries', value: formatNumber(total), subtitle: 'All time' },
          { title: 'Verifications', value: formatNumber(verifiedCount), subtitle: 'Claims approved' },
          { title: 'Rejections', value: formatNumber(rejectedCount), subtitle: 'Claims turned down' },
          {
            title: 'Other actions',
            value: formatNumber(Math.max(0, total - verifiedCount - rejectedCount)),
            subtitle: 'Postings closed, exports and so on',
          },
        ]}
      />

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        caption={`Page ${page} of ${pageCount} · ${formatNumber(total)} entries`}
        empty={
          <EmptyState
            icon={ShieldCheck}
            title="Nothing logged yet"
            description="Verify or reject a claim and it will appear here."
          />
        }
      />

      <Pagination basePath="/admin/audit" page={page} pageCount={pageCount} total={total} params={sp} />
    </DashboardShell>
  );
}
