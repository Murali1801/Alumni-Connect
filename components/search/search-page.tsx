import Link from 'next/link';
import { Briefcase, Building2, FileText, Search, Users } from 'lucide-react';
import { getNavBadges } from '@/lib/badges';
import { searchAll, searchCompanies, searchJobs, searchPeople, searchPosts, type CompanyHit, type JobHit, type PersonHit, type PostHit } from '@/lib/search';
import { isSearchable, normaliseQuery, parseSearchType, type SearchGroupKey, type SearchType } from '@/lib/search-shared';
import { OPPORTUNITY_LABEL } from '@/lib/feed-shared';
import { formatDate, formatTimeAgo } from '@/lib/format';
import type { SessionUser } from '@/lib/session';
import { DashboardShell } from '@/components/dashboard/shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, MemberAvatar } from '@/components/patterns';
import { cn } from '@/lib/utils';

const TABS: { key: SearchType; label: string; icon: typeof Users }[] = [
  { key: 'all', label: 'All', icon: Search },
  { key: 'people', label: 'People', icon: Users },
  { key: 'jobs', label: 'Jobs', icon: Briefcase },
  { key: 'posts', label: 'Posts', icon: FileText },
  { key: 'companies', label: 'Companies', icon: Building2 },
];

const GROUP_LABEL: Record<SearchGroupKey, string> = { people: 'People', jobs: 'Jobs and openings', posts: 'Posts', companies: 'Companies' };
const PAGE = 20;

function PersonRow({ p }: { p: PersonHit }) {
  return (
    <Link href={p.url} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
      <MemberAvatar name={p.full_name} url={p.avatar_url} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{p.full_name}</span>
        <span className="block truncate text-xs text-muted-foreground">{p.headline}</span>
        {p.location && <span className="block truncate text-[11px] text-muted-foreground">{p.location}</span>}
      </span>
      <Badge variant="secondary" className="shrink-0 font-normal capitalize">
        {p.role === 'alumni' ? 'Alumnus' : p.role}
      </Badge>
    </Link>
  );
}

function JobRow({ j, prefix }: { j: JobHit; prefix: string }) {
  return (
    <Link href={j.url ?? `${prefix}/opportunities`} className="block px-4 py-3 transition-colors hover:bg-muted">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge className="h-5 rounded-md bg-primary px-1.5 text-[11px] text-primary-foreground">{OPPORTUNITY_LABEL[j.type as keyof typeof OPPORTUNITY_LABEL] ?? j.type}</Badge>
        {!j.is_open && (
          <Badge variant="secondary" className="h-5 rounded-md px-1.5 text-[11px]">
            Closed
          </Badge>
        )}
      </div>
      <p className="mt-1 text-sm font-semibold text-foreground">{j.title}</p>
      <p className="text-xs text-muted-foreground">{[j.company, j.location, j.compensation].filter(Boolean).join(' · ')}</p>
      {j.deadline && <p className="mt-0.5 text-[11px] text-muted-foreground">Apply by {formatDate(j.deadline)}</p>}
    </Link>
  );
}

function PostRow({ p }: { p: PostHit }) {
  return (
    <Link href={p.url} className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted">
      <MemberAvatar name={p.author.full_name} url={p.author.avatar_url} size="md" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{p.author.full_name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {p.author.headline} · {formatTimeAgo(p.created_at)}
        </span>
        <span className="mt-1 line-clamp-2 block text-sm text-foreground">{p.snippet}</span>
        {p.opportunity && (
          <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary">
            <Briefcase className="size-3" />
            {OPPORTUNITY_LABEL[p.opportunity.type as keyof typeof OPPORTUNITY_LABEL] ?? p.opportunity.type}: {p.opportunity.title}
          </span>
        )}
      </span>
      {p.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image_url} alt="" loading="lazy" className="size-16 shrink-0 rounded-lg object-cover" />
      )}
    </Link>
  );
}

function CompanyRow({ c, prefix }: { c: CompanyHit; prefix: string }) {
  return (
    <Link href={`${prefix}/search?type=jobs&q=${encodeURIComponent(c.name)}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Building2 className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{c.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {[c.industry, `${c.alumni_count} alumni`, `${c.open_jobs} open ${c.open_jobs === 1 ? 'opening' : 'openings'}`].filter(Boolean).join(' · ')}
        </span>
      </span>
    </Link>
  );
}

/**
 * One search box over the whole network: people, openings, posts and
 * companies. "All" leads with whichever group matched best; each tab pages its
 * own results. Typo-tolerant on names.
 */
export async function SearchPage({ user, q: rawQ, type: rawType, page: rawPage }: { user: SessionUser; q?: string; type?: string; page?: string }) {
  const q = normaliseQuery(rawQ ?? '');
  const type = parseSearchType(rawType);
  const page = Math.max(1, Math.min(50, Number(rawPage) || 1));
  const prefix = `/${user.role === 'alumni' ? 'alumni' : 'student'}`;
  const viewerRole = user.role;
  const badges = await getNavBadges(user);
  const searchable = isSearchable(q);
  const offset = (page - 1) * PAGE;

  const all = searchable && type === 'all' ? await searchAll(q, { perGroup: 5, viewerRole }) : null;
  const single =
    searchable && type !== 'all'
      ? type === 'people'
        ? await searchPeople(q, { limit: PAGE, offset, viewerRole })
        : type === 'jobs'
          ? await searchJobs(q, { limit: PAGE, offset, viewerRole })
          : type === 'posts'
            ? await searchPosts(q, { limit: PAGE, offset })
            : await searchCompanies(q, { limit: PAGE, offset })
      : null;

  const tabHref = (t: SearchType) => `${prefix}/search?${new URLSearchParams({ ...(q ? { q } : {}), ...(t !== 'all' ? { type: t } : {}) })}`;
  const render = (key: SearchGroupKey, items: any[]) =>
    items.map((it) =>
      key === 'people' ? (
        <PersonRow key={it.id} p={it} />
      ) : key === 'jobs' ? (
        <JobRow key={it.id} j={it} prefix={prefix} />
      ) : key === 'posts' ? (
        <PostRow key={it.id} p={it} />
      ) : (
        <CompanyRow key={it.id} c={it} prefix={prefix} />
      )
    );

  return (
    <DashboardShell user={user} badges={badges} title="Search" description="People, openings, posts and companies across AlumniBridge.">
      <div className="mx-auto max-w-3xl space-y-4">
        <form role="search" className="flex gap-2">
          {type !== 'all' && <input type="hidden" name="type" value={type} />}
          <label className="relative flex-1">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={q}
              autoFocus={!q}
              placeholder="Try “react internship”, “Infosys”, or a name"
              className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
          <Button type="submit" className="h-10">
            Search
          </Button>
        </form>

        <nav className="scrollbar-none flex gap-1.5 overflow-x-auto" aria-label="Search in">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={tabHref(t.key)}
              aria-current={type === t.key ? 'page' : undefined}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                type === t.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </Link>
          ))}
        </nav>

        {!searchable ? (
          <EmptyState icon={Search} title="Search the network" description="Type at least two letters to find people, openings, posts and companies." />
        ) : all ? (
          all.order.every((k) => all[k].items.length === 0) ? (
            <EmptyState icon={Search} title={`No results for “${q}”`} description="Check the spelling, or try a broader word like a skill or a company." />
          ) : (
            all.order
              .filter((k) => all[k].items.length > 0)
              .map((k) => (
                <section key={k} aria-label={GROUP_LABEL[k]}>
                  <div className="mb-2 flex items-baseline justify-between px-1">
                    <h2 className="text-sm font-semibold text-foreground">{GROUP_LABEL[k]}</h2>
                    {all[k].total > all[k].items.length && (
                      <Link href={tabHref(k)} className="text-xs font-medium text-primary hover:underline">
                        See all {all[k].total}
                      </Link>
                    )}
                  </div>
                  <Card className="gap-0 divide-y divide-border py-0">{render(k, all[k].items)}</Card>
                </section>
              ))
          )
        ) : single && single.items.length > 0 ? (
          <>
            <p className="px-1 text-xs text-muted-foreground">
              {single.total} result{single.total === 1 ? '' : 's'}
            </p>
            <Card className="gap-0 divide-y divide-border py-0">{render(type as SearchGroupKey, single.items)}</Card>
            <div className="flex justify-between">
              {page > 1 ? (
                <Button variant="outline" size="sm" render={<Link href={`${tabHref(type)}&page=${page - 1}`} />}>
                  Previous
                </Button>
              ) : (
                <span />
              )}
              {offset + single.items.length < single.total && (
                <Button variant="outline" size="sm" render={<Link href={`${tabHref(type)}&page=${page + 1}`} />}>
                  Next
                </Button>
              )}
            </div>
          </>
        ) : (
          <EmptyState icon={Search} title={`No ${type} match “${q}”`} description="Try All, or a broader word." />
        )}
      </div>
    </DashboardShell>
  );
}
