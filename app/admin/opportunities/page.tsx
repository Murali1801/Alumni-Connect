import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getOpportunities } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { OpportunityList } from '@/components/opportunities/opportunity-list';
import { OpportunityFilters } from '@/components/opportunities/filters';
import { ToggleOpportunity } from '@/components/opportunities/toggle-opportunity';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Opportunities' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AdminOpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['admin']);
  const sp = await searchParams;
  const q = first(sp.q) ?? '';
  const type = first(sp.type) ?? 'all';

  // `openOnly: false` with no poster filter still excludes closed rows in the
  // shared helper, so ask for everything and filter here instead.
  const [badges, all] = await Promise.all([
    getNavBadges(user),
    getOpportunities({ openOnly: false, postedBy: undefined, limit: 500 }),
  ]);

  const filtered = all
    .filter((o) => (type === 'all' ? true : o.type === type))
    .filter((o) =>
      q ? `${o.title} ${o.company?.name ?? ''} ${o.poster?.full_name ?? ''}`.toLowerCase().includes(q.toLowerCase()) : true
    );

  const open = all.filter((o) => o.is_open).length;
  const posters = new Set(all.map((o) => o.posted_by)).size;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Opportunities"
      description="Every role posted by alumni. You can close anything inappropriate or stale — the action is written to the audit log."
    >
      <StatsCards
        stats={[
          { title: 'Live postings', value: open, subtitle: 'Visible to students' },
          { title: 'Closed', value: all.length - open, subtitle: 'Filled or withdrawn' },
          { title: 'Alumni posting', value: posters, subtitle: 'Distinct contributors' },
          { title: 'Matching filter', value: filtered.length, subtitle: 'Shown below' },
        ]}
      />

      <OpportunityFilters basePath="/admin/opportunities" q={q} type={type} />

      <OpportunityList
        opportunities={filtered}
        showStatus
        manage={(o) => <ToggleOpportunity id={o.id} isOpen={o.is_open} link={o.application_link} />}
        emptyTitle="No opportunities match"
        emptyBody="No alumnus has posted a role that fits these filters."
      />
    </DashboardShell>
  );
}
