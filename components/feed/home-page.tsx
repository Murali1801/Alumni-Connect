import Link from 'next/link';
import { ArrowDown, Hash, Newspaper, X } from 'lucide-react';
import { getNavBadges } from '@/lib/badges';
import { getFeed, type FeedFilter } from '@/lib/posts';
import { getHomeContext } from '@/lib/home';
import { getTopFeed } from '@/lib/ml/top-feed';
import type { SessionUser } from '@/lib/session';
import { DashboardShell } from '@/components/dashboard/shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/patterns';
import { Composer } from '@/components/feed/composer';
import { PostCard } from '@/components/feed/post-card';
import { HomeRail, ProfileCard } from '@/components/feed/home-columns';
import { cn } from '@/lib/utils';

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'opportunities', label: 'Openings' },
  { key: 'job', label: 'Jobs' },
  { key: 'internship', label: 'Internships' },
  { key: 'placement', label: 'Placement drives' },
  { key: 'referral', label: 'Referrals' },
  { key: 'saved', label: 'Saved' },
];

const isFilter = (v: string | undefined): v is FeedFilter => FILTERS.some((f) => f.key === v);

/**
 * The Home page students and alumni land on: profile card on the left, the
 * composer and feed in the middle, people and opportunities on the right.
 * `?show=` filters the feed (openings by kind, or saved posts), `?tag=` narrows
 * it to a hashtag, `?mine=1` to the viewer's own posts; `?before=` pages it.
 * `?sort=recent` switches from the default Top (ranked by lib/ml/feed-rank.ts)
 * to newest first; your own posts and Saved are always newest first.
 */
export async function HomePage({
  user,
  basePath,
  searchParams,
}: {
  user: SessionUser;
  basePath: '/student/home' | '/alumni/home';
  searchParams: { before?: string; mine?: string; show?: string; tag?: string; sort?: string };
}) {
  const mine = searchParams.mine === '1';
  const show: FeedFilter = isFilter(searchParams.show) ? searchParams.show : 'all';
  const tag = searchParams.tag?.replace(/[^\p{L}\p{N}_]/gu, '').toLowerCase().slice(0, 40) || undefined;
  const top = searchParams.sort !== 'recent' && !mine && show !== 'saved';
  const [badges, home, feed] = await Promise.all([
    getNavBadges(user),
    getHomeContext(user),
    top
      ? getTopFeed({ viewerId: user.id, cursor: searchParams.before, filter: show, tag })
      : getFeed({ viewerId: user.id, cursor: searchParams.before, authorId: mine ? user.id : undefined, filter: show, tag }),
  ]);
  const prefix = user.role === 'alumni' ? '/alumni' : '/student';
  const link = (over: Record<string, string | undefined>) => {
    const params = {
      ...(mine ? { mine: '1' } : {}),
      ...(show !== 'all' ? { show } : {}),
      ...(tag ? { tag } : {}),
      ...(searchParams.sort === 'recent' ? { sort: 'recent' } : {}),
      ...over,
    };
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  return (
    <DashboardShell user={user} badges={badges} bare title="Home" description="Your AlumniBridge feed.">
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        <aside className="hidden lg:sticky lg:top-[4.5rem] lg:block">
          <ProfileCard user={user} home={home} />
        </aside>

        <section className="min-w-0 space-y-3" aria-label="Feed">
          <Composer name={user.full_name} role={user.role} avatarUrl={home.avatar_url} />

          <nav className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" aria-label="Filter the feed">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={link({ show: f.key === 'all' ? undefined : f.key, before: undefined })}
                aria-current={show === f.key ? 'page' : undefined}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  show === f.key ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground hover:text-foreground'
                )}
              >
                {f.label}
              </Link>
            ))}
          </nav>

          {!mine && show !== 'saved' && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              Sort by:
              <Link
                href={link({ sort: undefined, before: undefined })}
                aria-current={top ? 'true' : undefined}
                className={cn('font-medium hover:underline', top ? 'text-foreground' : 'text-muted-foreground')}
              >
                Top
              </Link>
              ·
              <Link
                href={link({ sort: 'recent', before: undefined })}
                aria-current={!top ? 'true' : undefined}
                className={cn('font-medium hover:underline', !top ? 'text-foreground' : 'text-muted-foreground')}
              >
                Recent
              </Link>
            </div>
          )}

          {(tag || mine) && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {tag && (
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-medium text-primary">
                  <Hash className="size-3" />
                  {tag}
                  <Link href={link({ tag: undefined, before: undefined })} aria-label={`Clear #${tag}`} className="ml-0.5 hover:text-foreground">
                    <X className="size-3" />
                  </Link>
                </span>
              )}
              {mine && (
                <span>
                  Your posts ·{' '}
                  <Link href={link({ mine: undefined, before: undefined })} className="font-medium text-foreground hover:underline">
                    Show everyone
                  </Link>
                </span>
              )}
            </div>
          )}

          {feed.items.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              title={show === 'saved' ? 'Nothing saved yet' : mine ? 'You have not posted yet' : 'Nothing here yet'}
              description={
                show === 'saved'
                  ? 'Use the bookmark on any post to keep it here for later.'
                  : 'Share a career update, a question, or an opening at your company. It shows up here for everyone on the network.'
              }
            />
          ) : (
            feed.items.map((post) => <PostCard key={post.id} post={post} viewer={user} />)
          )}

          {feed.next && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" render={<Link href={link({ before: feed.next })} />}>
                <ArrowDown className="size-4" />
                Older posts
              </Button>
            </div>
          )}
        </section>

        <aside className="lg:col-span-2 xl:sticky xl:top-[4.5rem] xl:col-span-1">
          <HomeRail home={home} opportunitiesHref={`${prefix}/opportunities`} calendarHref={`${prefix}/calendar`} />
        </aside>
      </div>
    </DashboardShell>
  );
}
