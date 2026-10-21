import Link from 'next/link';
import { Download } from 'lucide-react';
import type { PostRow } from '@/lib/queries';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PostItem } from '@/components/posts/post-item';
import { RemoveImportedPostsButton } from '@/components/posts/post-client';

/**
 * Posts on a profile. `own` is the alumnus looking at their own profile: they
 * can remove posts and are told when students cannot see them yet. For anyone
 * else the card renders nothing when there are no posts.
 */
export function PostsCard({
  posts,
  own = false,
  verified = true,
}: {
  posts: PostRow[];
  own?: boolean;
  verified?: boolean;
}) {
  if (!own && posts.length === 0) return null;

  return (
    <Card className="gap-0 p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground">Posts and articles</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {own
              ? verified
                ? 'Shown on your profile and in the network feed.'
                : 'Only you can see these until career services verifies your record.'
              : 'Shared from LinkedIn.'}
          </p>
        </div>
        {own && posts.length > 0 && <RemoveImportedPostsButton />}
      </div>

      {posts.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-lg bg-muted px-4 py-4 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Bring your LinkedIn posts and articles over, then pick which ones students see.</p>
          <Button size="sm" render={<Link href="/alumni/profile/import" />}>
            <Download className="size-4" />
            Import from LinkedIn
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {posts.map((p) => (
            <li key={p.id} className="py-5 first:pt-0 last:pb-0">
              <PostItem post={p} canDelete={own} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
