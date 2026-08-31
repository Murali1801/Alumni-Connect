import { Users } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { createAdminClient } from '@/lib/supabase/admin';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { DataTable, type Column } from '@/components/admin/data-table';
import { TableFilters } from '@/components/admin/table-filters';
import { Pagination } from '@/components/directory/pagination';
import { EmptyState, InitialsAvatar, StatusPill } from '@/components/patterns';
import { Badge } from '@/components/ui/badge';

export const metadata = { title: 'People' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type PersonRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
  requestsSent: number;
  requestsReceived: number;
  claimStatus: string | null;
};

const PAGE_SIZE = 25;

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin']);
  const sp = await searchParams;
  const q = first(sp.q) ?? '';
  const role = first(sp.role) ?? 'all';
  const page = Math.max(1, Number(first(sp.page) ?? 1) || 1);

  const db = createAdminClient();

  let query = db.from('users').select('id, full_name, email, role, created_at', { count: 'exact' });
  if (role !== 'all') query = query.eq('role', role);
  if (q) {
    const term = q.replace(/[%,()]/g, ' ').trim();
    if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const [badges, listRes, studentCount, alumniCount, adminCount] = await Promise.all([
    getNavBadges(user),
    query.order('created_at', { ascending: false }).range(from, from + PAGE_SIZE - 1),
    db.from('users').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    db.from('users').select('*', { count: 'exact', head: true }).eq('role', 'alumni'),
    db.from('users').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
  ]);

  const people = listRes.data ?? [];
  const ids = people.map((p: any) => p.id);

  // Activity counts for just the visible page, so the table stays cheap.
  const [sentRes, receivedRes, claimsRes] = await Promise.all([
    ids.length ? db.from('requests').select('student_id').in('student_id', ids) : { data: [] },
    ids.length ? db.from('requests').select('alumni_id').in('alumni_id', ids) : { data: [] },
    ids.length
      ? db.from('alumni_records').select('claimed_by, claim_status').in('claimed_by', ids)
      : { data: [] },
  ]);

  const sentBy = new Map<string, number>();
  for (const r of (sentRes.data ?? []) as any[]) sentBy.set(r.student_id, (sentBy.get(r.student_id) ?? 0) + 1);
  const recvBy = new Map<string, number>();
  for (const r of (receivedRes.data ?? []) as any[]) recvBy.set(r.alumni_id, (recvBy.get(r.alumni_id) ?? 0) + 1);
  const claimBy = new Map<string, string>();
  for (const r of (claimsRes.data ?? []) as any[]) claimBy.set(r.claimed_by, r.claim_status);

  const rows: PersonRow[] = people.map((p: any) => ({
    ...p,
    requestsSent: sentBy.get(p.id) ?? 0,
    requestsReceived: recvBy.get(p.id) ?? 0,
    claimStatus: claimBy.get(p.id) ?? null,
  }));

  const total = listRes.count ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const columns: Column<PersonRow>[] = [
    {
      key: 'name',
      header: 'Person',
      cell: (r) => (
        <div className="flex items-center gap-2.5">
          <InitialsAvatar name={r.full_name} size="sm" />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{r.full_name}</p>
            <p className="truncate text-xs text-muted-foreground">{r.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      cell: (r) => (
        <Badge variant={r.role === 'admin' ? 'default' : 'secondary'} className="font-normal capitalize">
          {r.role}
        </Badge>
      ),
    },
    {
      key: 'claim',
      header: 'Record claim',
      cell: (r) =>
        r.claimStatus ? <StatusPill status={r.claimStatus} /> : <span className="text-muted-foreground">—</span>,
    },
    { key: 'sent', header: 'Sent', numeric: true, cell: (r) => r.requestsSent || '—' },
    { key: 'received', header: 'Received', numeric: true, cell: (r) => r.requestsReceived || '—' },
    {
      key: 'joined',
      header: 'Joined',
      cell: (r) =>
        new Date(r.created_at).toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
    },
  ];

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="People"
      description="Every account on the network — students, alumni and administrators — with what they have actually done."
    >
      <StatsCards
        stats={[
          { title: 'Students', value: (studentCount.count ?? 0).toLocaleString(), subtitle: 'Registered accounts' },
          { title: 'Alumni', value: (alumniCount.count ?? 0).toLocaleString(), subtitle: 'Claimed an account' },
          { title: 'Administrators', value: (adminCount.count ?? 0).toLocaleString(), subtitle: 'Can verify claims' },
          { title: 'Matching filter', value: total.toLocaleString(), subtitle: 'Rows in the table below' },
        ]}
      />

      <TableFilters
        basePath="/admin/users"
        q={q}
        placeholder="Search by name or email…"
        selects={[
          {
            key: 'role',
            value: role,
            label: 'Role',
            options: [
              { value: 'all', label: 'All roles' },
              { value: 'student', label: 'Students' },
              { value: 'alumni', label: 'Alumni' },
              { value: 'admin', label: 'Administrators' },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        caption={`Page ${page} of ${pageCount} · ${total.toLocaleString()} accounts match`}
        empty={<EmptyState icon={Users} title="No accounts match" description="Try clearing the filters." />}
      />

      <Pagination basePath="/admin/users" page={page} pageCount={pageCount} total={total} params={sp} />
    </DashboardShell>
  );
}
