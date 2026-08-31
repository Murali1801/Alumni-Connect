import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getOpportunities, getStudentProfile } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { OpportunityList } from '@/components/opportunities/opportunity-list';
import { OpportunityFilters } from '@/components/opportunities/filters';
import { StatsCards } from '@/components/dashboard/cards';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Opportunities' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function StudentOpportunitiesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['student']);
  const sp = await searchParams;
  const q = first(sp.q) ?? '';
  const type = first(sp.type) ?? 'all';

  const [badges, profile, all] = await Promise.all([
    getNavBadges(user),
    getStudentProfile(user.id),
    getOpportunities({ openOnly: true, limit: 200 }),
  ]);

  const have = new Set((profile?.skills ?? []).map((s) => s.toLowerCase()));

  // Rank by how much of the posting's skill list the student already has —
  // a posting asking for nothing you have is not a lead worth the top slot.
  const scored = all
    .filter((o) => (type === 'all' ? true : o.type === type))
    .filter((o) =>
      q
        ? `${o.title} ${o.company?.name ?? ''} ${o.location ?? ''}`.toLowerCase().includes(q.toLowerCase())
        : true
    )
    .map((o) => {
      const skills = o.target_skills ?? [];
      const matched = skills.filter((s) => have.has(s.toLowerCase())).length;
      return { o, ratio: skills.length ? matched / skills.length : 0, matched };
    })
    .sort((a, b) => b.ratio - a.ratio || +new Date(b.o.created_at) - +new Date(a.o.created_at));

  const strong = scored.filter((s) => s.ratio >= 0.5).length;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Opportunities"
      description="Roles and internships posted by alumni who can speak for them. Ranked by how well they line up with your skills."
      actions={
        !profile ? (
          <Button className="h-9 w-full px-4 sm:w-auto" render={<Link href="/student/settings" />}>
            Add your skills to rank these
          </Button>
        ) : undefined
      }
    >
      <StatsCards
        stats={[
          { title: 'Open roles', value: all.length, subtitle: 'Posted by alumni' },
          { title: 'Jobs', value: all.filter((o) => o.type === 'job').length, subtitle: 'Full-time positions' },
          {
            title: 'Internships',
            value: all.filter((o) => o.type === 'internship').length,
            subtitle: 'Including summer terms',
          },
          {
            title: 'Strong matches',
            value: strong,
            subtitle: profile ? 'At least half the skills line up' : 'Add skills to see this',
          },
        ]}
      />

      <OpportunityFilters basePath="/student/opportunities" q={q} type={type} />

      <OpportunityList
        opportunities={scored.map((s) => s.o)}
        skills={profile ? { have } : null}
        emptyTitle="No opportunities match"
        emptyBody={
          q || type !== 'all'
            ? 'Try clearing the filters — the network may still be small in your area.'
            : 'No alumni have posted an opening yet. Check back, or ask an alumnus directly for a referral.'
        }
        emptyAction={
          <Button size="sm" variant="outline" render={<Link href="/student/directory" />}>
            Ask for a referral instead
          </Button>
        }
      />
    </DashboardShell>
  );
}
