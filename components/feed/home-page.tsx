import Link from 'next/link';
import { ArrowDown, Newspaper } from 'lucide-react';
import { getNavBadges } from '@/lib/badges';
import { getFeed } from '@/lib/posts';
import { getHomeContext } from '@/lib/home';
import type { SessionUser } from '@/lib/session';
import { DashboardShell } from '@/components/dashboard/shell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/patterns';
import { Composer } from '@/components/feed/composer';
import { PostCard } from '@/components/feed/post-card';
import { HomeRail, ProfileCard } from '@/components/feed/home-columns';

/**
 * The Home page students and alumni land on: profile card on the left, the
 * composer and feed in the middle, people and opportunities on the right.
 * `?mine=1` narrows the feed to the viewer's own posts; `?before=` pages it.
 */
export async function HomePage({
  user,
  basePath,
  searchParams,
}: {
  user: SessionUser;
  basePath: '/student/home' | '/alumni/home';
  searchParams: { before?: string; mine?: string };
}) {
  const mine = searchParams.mine === '1';
  const [badges, home, feed] = await Promise.all([
    getNavBadges(user),
    getHomeContext(user),
    getFeed({ viewerId: user.id, cursor: searchParams.before, authorId: mine ? user.id : undefined }),
  ]);
  const prefix = user.role === 'alumni' ? '/alumni' : '/student';
  // Alumni names come from the college record, "Surname First Father Mother",
  // so the given name is the second word; students type their own name.
  const parts = user.full_name.trim().split(/\s+/);
  const firstName = user.role === 'alumni' && parts.length >= 3 ? parts[1] : parts[0];
  const query = (extra: Record<string, string>) =>
    `${basePath}?${new URLSearchParams({ ...(mine ? { mine: '1' } : {}), ...extra })}`;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title={`Welcome, ${firstName}`}
      description="What the SJCEM network is sharing: career moves, advice, openings and questions."
    >
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_19rem]">
        <aside className="lg:sticky lg:top-4">
          <ProfileCard user={user} home={home} />
        </aside>

        <section className="min-w-0 space-y-3" aria-label="Feed">
          <Composer name={user.full_name} />

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            {mine ? (
              <>
                Your posts ·{' '}
                <Link href={basePath} className="font-medium text-foreground hover:underline">
                  Show everyone
                </Link>
              </>
            ) : (
              <>Newest first</>
            )}
          </div>

          {feed.items.length === 0 ? (
            <EmptyState
              icon={Newspaper}
              title={mine ? 'You have not posted yet' : 'No posts yet'}
              description="Share a career update, a question, or an opening at your company. It shows up here for everyone on the network."
            />
          ) : (
            feed.items.map((post) => <PostCard key={post.id} post={post} viewer={user} />)
          )}

          {feed.next && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" render={<Link href={query({ before: feed.next })} />}>
                <ArrowDown className="size-4" />
                Older posts
              </Button>
            </div>
          )}
        </section>

        <aside className="lg:col-span-2 xl:col-span-1 xl:sticky xl:top-4">
          <HomeRail home={home} opportunitiesHref={`${prefix}/opportunities`} calendarHref={`${prefix}/calendar`} />
        </aside>
      </div>
    </DashboardShell>
  );
}
