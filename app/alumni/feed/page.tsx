import Link from 'next/link';
import { Download } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getFeed } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { FeedList } from '@/components/posts/feed-list';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Network feed' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function AlumniFeedPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['alumni']);
  const sp = await searchParams;
  const [badges, page] = await Promise.all([getNavBadges(user), getFeed({ cursor: first(sp.before) })]);

  const importButton = (
    <Button className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/profile/import" />}>
      <Download className="size-4" />
      Share your LinkedIn posts
    </Button>
  );

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Network feed"
      description="What fellow alumni are sharing. Students read this too, so it is a good place to post openings and advice."
      actions={importButton}
    >
      <FeedList page={page} basePath="/alumni/feed" emptyAction={importButton} />
    </DashboardShell>
  );
}
