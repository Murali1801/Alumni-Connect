import Link from 'next/link';
import { formatFullDateTime, formatTimeAgo } from '@/lib/format';
import { headlineOf, postPath, type FeedPost } from '@/lib/posts';
import type { SessionUser } from '@/lib/session';
import { Card } from '@/components/ui/card';
import { InitialsAvatar } from '@/components/patterns';
import { ExpandableText, PostActions, PostMenu } from '@/components/feed/post-interactions';

/** Where a member's profile lives for this viewer; administrators have no member pages. */
export function profileBaseFor(viewer: SessionUser): string | null {
  return viewer.role === 'admin' ? null : `/${viewer.role}/people`;
}

/**
 * One post on the Home feed. Text is rendered as text, never as HTML.
 * `commentsOpen` starts with the thread showing, as on a shared post's page.
 */
export function PostCard({ post, viewer, commentsOpen = false }: { post: FeedPost; viewer: SessionUser; commentsOpen?: boolean }) {
  const profileBase = profileBaseFor(viewer);
  const authorHref = profileBase && post.role !== 'admin' ? `${profileBase}/${post.author_id}` : null;
  const canDelete = post.author_id === viewer.id || viewer.role === 'admin';

  const name = authorHref ? (
    <Link href={authorHref} className="text-sm font-semibold text-foreground hover:text-primary hover:underline">
      {post.full_name}
    </Link>
  ) : (
    <span className="text-sm font-semibold text-foreground">{post.full_name}</span>
  );

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <article>
        <header className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="flex min-w-0 items-start gap-3">
            {authorHref ? (
              <Link href={authorHref} tabIndex={-1}>
                <InitialsAvatar name={post.full_name} size="lg" />
              </Link>
            ) : (
              <InitialsAvatar name={post.full_name} size="lg" />
            )}
            <div className="min-w-0 pt-0.5">
              <p className="truncate">
                {name}
                {post.role === 'alumni' && <span className="ml-1.5 text-xs text-muted-foreground">· Alumnus</span>}
              </p>
              <p className="truncate text-xs text-muted-foreground">{headlineOf(post)}</p>
              <Link href={postPath(post.id)} className="tnum text-xs text-muted-foreground hover:text-primary hover:underline">
                <time dateTime={post.created_at} title={formatFullDateTime(post.created_at)}>
                  {formatTimeAgo(post.created_at)}
                </time>
              </Link>
            </div>
          </div>
          {canDelete && <PostMenu postId={post.id} />}
        </header>

        {post.body && (
          <div className="px-4 pt-3">
            <ExpandableText text={post.body} />
          </div>
        )}

        {post.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={post.image_url} alt="" loading="lazy" className="mt-3 max-h-[32rem] w-full bg-muted object-contain" />
        )}

        <div className="pt-3">
          <PostActions
            postId={post.id}
            likeCount={post.like_count}
            commentCount={post.comment_count}
            likedByMe={post.liked_by_me}
            viewer={{ id: viewer.id, role: viewer.role, full_name: viewer.full_name }}
            profileBase={profileBase}
            sharePath={postPath(post.id)}
            shareTitle={`Post by ${post.full_name} on AlumniBridge`}
            commentsOpen={commentsOpen}
          />
        </div>
      </article>
    </Card>
  );
}
