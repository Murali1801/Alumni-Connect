import Link from 'next/link';
import { Plus } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getOpportunities } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { OpportunityList } from '@/components/opportunities/opportunity-list';
import { OpportunityFilters } from '@/components/opportunities/filters';
import { StatsCards } from '@/components/dashboard/cards';
import { ToggleOpportunity } from '@/components/opportunities/toggle-opportunity';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'My postings' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AlumniOpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['alumni']);
  const sp = await searchParams;
  const q = first(sp.q) ?? '';
  const type = first(sp.type) ?? 'all';

  const [badges, mine] = await Promise.all([
    getNavBadges(user),
    getOpportunities({ postedBy: user.id, limit: 200 }),
  ]);

  const filtered = mine
    .filter((o) => (type === 'all' ? true : o.type === type))
    .filter((o) => (q ? `${o.title} ${o.company?.name ?? ''}`.toLowerCase().includes(q.toLowerCase()) : true));

  const open = mine.filter((o) => o.is_open).length;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="My postings"
      description="Roles you have opened to the network. Close one when it is filled so students do not chase it."
      actions={
        <Button className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/opportunities/new" />}>
          <Plus className="size-4" />
          Post an opportunity
        </Button>
      }
    >
      <StatsCards
        stats={[
          { title: 'Live postings', value: open, subtitle: 'Visible to students' },
          { title: 'Closed', value: mine.length - open, subtitle: 'Filled or withdrawn' },
          { title: 'Jobs', value: mine.filter((o) => o.type === 'job').length, subtitle: 'Full-time roles' },
          {
            title: 'Internships',
            value: mine.filter((o) => o.type === 'internship').length,
            subtitle: 'Including summer terms',
          },
        ]}
      />

      <OpportunityFilters basePath="/alumni/opportunities" q={q} type={type} />

      <OpportunityList
        opportunities={filtered}
        showStatus
        manage={(o) => <ToggleOpportunity id={o.id} isOpen={o.is_open} link={o.application_link} />}
        emptyTitle={mine.length === 0 ? 'You have not posted anything yet' : 'No postings match'}
        emptyBody={
          mine.length === 0
            ? 'A single opening you can genuinely refer into is worth more to students than a dozen job-board links.'
            : 'Try clearing the filters.'
        }
        emptyAction={
          <Button size="sm" render={<Link href="/alumni/opportunities/new" />}>
            Post your first opportunity
          </Button>
        }
      />
    </DashboardShell>
  );
}
