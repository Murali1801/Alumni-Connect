import Link from 'next/link';
import { ArrowDown, Newspaper } from 'lucide-react';
import type { FeedPage } from '@/lib/queries';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/patterns';
import { PostItem } from '@/components/posts/post-item';

/**
 * The network feed. `profileHref` builds a link to an author's profile for
 * viewers who have one to visit (students have the directory; alumni do not).
 */
export function FeedList({
  page,
  basePath,
  profileHref,
  emptyAction,
}: {
  page: FeedPage;
  basePath: string;
  profileHref?: (recordId: string) => string;
  emptyAction?: React.ReactNode;
}) {
  if (page.items.length === 0) {
    return (
      <EmptyState
        icon={Newspaper}
        title="No posts yet"
        description="When verified alumni import their LinkedIn posts and articles, they appear here, newest first."
        action={emptyAction}
      />
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {page.items.map((item) => (
        <Card key={item.id} className="gap-0 p-5">
          <PostItem post={item} authorHref={profileHref?.(item.record_id)} />
        </Card>
      ))}
      {page.next && (
        <div className="flex justify-center pt-2">
          <Button variant="outline" render={<Link href={`${basePath}?before=${encodeURIComponent(page.next)}`} />}>
            <ArrowDown className="size-4" />
            Older posts
          </Button>
        </div>
      )}
    </div>
  );
}
