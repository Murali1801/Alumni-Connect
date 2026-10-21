import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getFeed } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { FeedList } from '@/components/posts/feed-list';

export const metadata = { title: 'Network feed' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function StudentFeedPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['student']);
  const sp = await searchParams;
  const [badges, page] = await Promise.all([getNavBadges(user), getFeed({ cursor: first(sp.before) })]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Network feed"
      description="Posts and articles verified alumni have shared from LinkedIn. Open a name to see their profile and reach out."
    >
      <FeedList page={page} basePath="/student/feed" profileHref={(id) => `/student/directory/${id}`} />
    </DashboardShell>
  );
}
