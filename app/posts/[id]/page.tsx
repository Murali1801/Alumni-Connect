import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getPost } from '@/lib/posts';
import { DashboardShell } from '@/components/dashboard/shell';
import { Button } from '@/components/ui/button';
import { PostCard } from '@/components/feed/post-card';

export const dynamic = 'force-dynamic';
// Members-only: the proxy sends signed-out visitors (and link-preview crawlers)
// to sign in before this renders, so post text never reaches them.
export const metadata = { title: 'Post' };

/** A shared post. One link for everyone: it opens in the viewer's own workspace. */
export default async function PostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [badges, post] = await Promise.all([getNavBadges(user), getPost(id, user.id)]);
  if (!post) notFound();

  const back = user.role === 'admin' ? '/admin' : `/${user.role}/home`;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title={`Post by ${post.full_name}`}
      description="Shared from the AlumniBridge feed."
      actions={
        <Button variant="outline" className="h-9 w-full px-4 sm:w-auto" render={<Link href={back} />}>
          <ArrowLeft className="size-4" />
          Back to feed
        </Button>
      }
    >
      <div className="mx-auto max-w-2xl">
        <PostCard post={post} viewer={user} commentsOpen />
      </div>
    </DashboardShell>
  );
}
