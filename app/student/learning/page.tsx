import Link from 'next/link';
import { BookOpen, CalendarDays, GraduationCap } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getCatalogueFacets, getMyLearning, listCatalogue, listWorkshops } from '@/lib/learning';
import { formatNumber } from '@/lib/format';
import { DashboardShell } from '@/components/dashboard/shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/patterns';
import { CatalogueFilters } from '@/components/learning/catalogue-filters';
import { CourseCardView } from '@/components/learning/course-card';
import { WorkshopCardView } from '@/components/learning/workshop-card';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Learning' };
export const dynamic = 'force-dynamic';

type Tab = 'browse' | 'mine' | 'workshops';
type Search = { tab?: string; q?: string; topic?: string; level?: string; skill?: string };

const BASE = '/student/learning';

/**
 * The Learning hub for students: the course catalogue, the courses they are
 * taking, and live workshops by alumni.
 */
export default async function StudentLearningPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser(['student']);
  const sp = await searchParams;
  const tab: Tab = sp.tab === 'mine' || sp.tab === 'workshops' ? sp.tab : 'browse';
  const filters = { q: sp.q ?? '', topic: sp.topic ?? '', level: sp.level ?? '', skill: sp.skill ?? '' };

  const [badges, mine, workshops, catalogue, facets] = await Promise.all([
    getNavBadges(user),
    getMyLearning(user.id),
    listWorkshops({ viewerId: user.id }),
    tab === 'browse' ? listCatalogue(filters, user.id) : Promise.resolve([]),
    tab === 'browse' ? getCatalogueFacets() : Promise.resolve({ topics: [], skills: [] }),
  ]);
  const inProgress = mine.filter((c) => !c.mine?.completed_at);

  const tabs: { key: Tab; label: string; count?: number }[] = [
    { key: 'browse', label: 'Browse courses' },
    { key: 'mine', label: 'My learning', count: mine.length },
    { key: 'workshops', label: 'Workshops', count: workshops.length },
  ];

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Learning"
      description="Courses and live workshops by SJCEM alumni: placement prep, core skills and tools, at your own pace."
    >
      <div className="space-y-4">
        <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Learning sections">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.key === 'browse' ? BASE : `${BASE}?tab=${t.key}`}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
              aria-current={tab === t.key ? 'page' : undefined}
            >
              {t.label}
              {t.count !== undefined && <span className="tnum ml-1 text-muted-foreground">{formatNumber(t.count)}</span>}
            </Link>
          ))}
        </nav>

        {tab === 'browse' && (
          <>
            {inProgress.length > 0 && !filters.q && !filters.topic && !filters.level && !filters.skill && (
              <section aria-labelledby="continue-heading" className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 id="continue-heading" className="text-sm font-semibold text-foreground">
                    Continue learning
                  </h2>
                  <Link href={`${BASE}?tab=mine`} className="text-xs font-medium text-primary hover:underline">
                    See all
                  </Link>
                </div>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {inProgress.slice(0, 3).map((c) => (
                    <li key={c.id}>
                      <CourseCardView course={c} href={`${BASE}/${c.id}${c.resume ? `?lesson=${c.resume.id}` : ''}`} resume={c.resume} />
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <CatalogueFilters key={filters.q} basePath={BASE} value={filters} topics={facets.topics} skills={facets.skills} />

            {catalogue.length === 0 ? (
              <EmptyState
                icon={BookOpen}
                title="No courses match"
                description="Try another topic or level, or clear the search."
                action={
                  <Button size="sm" variant="outline" render={<Link href={BASE} />}>
                    Show all courses
                  </Button>
                }
              />
            ) : (
              <section aria-label="Courses">
                <p className="mb-3 text-xs text-muted-foreground">
                  {formatNumber(catalogue.length)} {catalogue.length === 1 ? 'course' : 'courses'}
                </p>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {catalogue.map((c) => (
                    <li key={c.id}>
                      <CourseCardView course={c} href={`${BASE}/${c.id}`} />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {tab === 'mine' &&
          (mine.length === 0 ? (
            <EmptyState
              icon={GraduationCap}
              title="You have not enrolled in a course yet"
              description="Pick a course from the catalogue. Your progress is saved lesson by lesson, so you can stop and resume any time."
              action={
                <Button size="sm" variant="outline" render={<Link href={BASE} />}>
                  Browse courses
                </Button>
              }
            />
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {mine.map((c) => (
                <li key={c.id}>
                  <CourseCardView
                    course={c}
                    href={`${BASE}/${c.id}${c.resume && !c.mine?.completed_at ? `?lesson=${c.resume.id}` : ''}`}
                    resume={c.mine?.completed_at ? null : c.resume}
                  />
                </li>
              ))}
            </ul>
          ))}

        {tab === 'workshops' &&
          (workshops.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No workshops scheduled" description="When alumni schedule live workshops, they show up here." />
          ) : (
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {workshops.map((w) => (
                <li key={w.id}>
                  <WorkshopCardView workshop={w} courseBase={BASE} />
                </li>
              ))}
            </ul>
          ))}
      </div>
    </DashboardShell>
  );
}
