import { Building2 } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { createAdminClient } from '@/lib/supabase/admin';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { DataTable, type Column } from '@/components/admin/data-table';
import { TableFilters } from '@/components/admin/table-filters';
import { Pagination } from '@/components/directory/pagination';
import { RankingChart } from '@/components/analytics/charts';
import { EmptyState } from '@/components/patterns';
import { formatNumber } from '@/lib/format';

export const metadata = { title: 'Companies' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type CompanyRow = {
  id: string;
  name: string;
  industry: string | null;
  firstEmployerCount: number;
  currentCount: number;
  mentors: number;
  referrers: number;
};

const PAGE_SIZE = 25;

/** Pull an entire table in 1000-row pages — PostgREST caps a single request. */
async function fetchAll(db: any, table: string, columns: string) {
  let out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await db.from(table).select(columns).range(from, from + 999);
    if (!data?.length) break;
    out = out.concat(data);
    if (data.length < 1000) break;
  }
  return out;
}

export default async function AdminCompaniesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin']);
  const sp = await searchParams;
  const q = first(sp.q) ?? '';
  const sort = first(sp.sort) ?? 'alumni';
  const page = Math.max(1, Number(first(sp.page) ?? 1) || 1);

  const db = createAdminClient();

  const [badges, companies, records, profiles] = await Promise.all([
    getNavBadges(user),
    fetchAll(db, 'companies', 'id, name, industry'),
    fetchAll(db, 'alumni_records', 'first_company_id'),
    fetchAll(
      db,
      'alumni_profiles',
      'current_company_id, mentorship_available, referral_available'
    ),
  ]);

  const firstCounts = new Map<string, number>();
  for (const r of records) {
    if (r.first_company_id) firstCounts.set(r.first_company_id, (firstCounts.get(r.first_company_id) ?? 0) + 1);
  }
  const currentCounts = new Map<string, { total: number; mentors: number; referrers: number }>();
  for (const p of profiles) {
    if (!p.current_company_id) continue;
    const c = currentCounts.get(p.current_company_id) ?? { total: 0, mentors: 0, referrers: 0 };
    c.total++;
    if (p.mentorship_available) c.mentors++;
    if (p.referral_available) c.referrers++;
    currentCounts.set(p.current_company_id, c);
  }

  let rows: CompanyRow[] = companies.map((c: any) => {
    const cur = currentCounts.get(c.id);
    return {
      id: c.id,
      name: c.name,
      industry: c.industry,
      firstEmployerCount: firstCounts.get(c.id) ?? 0,
      currentCount: cur?.total ?? 0,
      mentors: cur?.mentors ?? 0,
      referrers: cur?.referrers ?? 0,
    };
  });

  if (q) {
    const term = q.toLowerCase();
    rows = rows.filter((r) => r.name.toLowerCase().includes(term));
  }

  rows.sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'first') return b.firstEmployerCount - a.firstEmployerCount || a.name.localeCompare(b.name);
    if (sort === 'mentors') return b.mentors - a.mentors || a.name.localeCompare(b.name);
    return b.currentCount - a.currentCount || b.firstEmployerCount - a.firstEmployerCount;
  });

  const total = rows.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const visible = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const topClusters = [...rows]
    .filter((r) => r.currentCount > 0)
    .sort((a, b) => b.currentCount - a.currentCount)
    .slice(0, 10)
    .map((r) => ({ label: r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name, value: r.currentCount }));

  const withMentors = rows.filter((r) => r.mentors > 0).length;

  const columns: Column<CompanyRow>[] = [
    {
      key: 'name',
      header: 'Company',
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{r.name}</p>
          <p className="truncate text-xs text-muted-foreground">{r.industry ?? 'Industry not recorded'}</p>
        </div>
      ),
    },
    {
      key: 'first',
      header: 'First employer',
      numeric: true,
      cell: (r) => r.firstEmployerCount || '—',
    },
    { key: 'current', header: 'Works there now', numeric: true, cell: (r) => r.currentCount || '—' },
    { key: 'mentors', header: 'Mentoring', numeric: true, cell: (r) => r.mentors || '—' },
    { key: 'referrers', header: 'Referring', numeric: true, cell: (r) => r.referrers || '—' },
  ];

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Companies"
      description="Canonicalised employers from the ingest. “First employer” comes from the college record; “works there now” comes from claimed profiles."
    >
      <StatsCards
        stats={[
          { title: 'Employers on file', value: formatNumber(companies.length), subtitle: 'After canonicalisation' },
          {
            title: 'With alumni today',
            value: formatNumber(currentCounts.size),
            subtitle: 'At least one claimed profile',
          },
          { title: 'With a mentor', value: formatNumber(withMentors), subtitle: 'Somebody willing to help' },
          { title: 'Matching filter', value: formatNumber(total), subtitle: 'Rows in the table below' },
        ]}
      />

      <RankingChart
        title="Largest employer clusters"
        description="Where claimed alumni work now — the shortest path to a referral"
        data={topClusters}
        emptyText="No claimed profiles list a current employer yet."
      />

      <TableFilters
        basePath="/admin/companies"
        q={q}
        placeholder="Search companies…"
        selects={[
          {
            key: 'sort',
            value: sort,
            label: 'Sort',
            options: [
              { value: 'alumni', label: 'Most alumni now' },
              { value: 'first', label: 'Most first placements' },
              { value: 'mentors', label: 'Most mentors' },
              { value: 'name', label: 'Name A–Z' },
            ],
          },
        ]}
      />

      <DataTable
        columns={columns}
        rows={visible}
        getRowKey={(r) => r.id}
        caption={`Page ${page} of ${pageCount} · ${formatNumber(total)} employers match`}
        empty={<EmptyState icon={Building2} title="No companies match" description="Try a shorter search term." />}
      />

      <Pagination basePath="/admin/companies" page={page} pageCount={pageCount} total={total} params={sp} />
    </DashboardShell>
  );
}
