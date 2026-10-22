import Link from 'next/link';
import { Repeat2 } from 'lucide-react';
import { formatFullDateTime, formatTimeAgo } from '@/lib/format';
import { headlineOf, postPath, type FeedPost } from '@/lib/posts';
import type { SessionUser } from '@/lib/session';
import { Card } from '@/components/ui/card';
import { MemberAvatar } from '@/components/patterns';
import { ExpandableRichText, PostActions, PostMenu } from '@/components/feed/post-interactions';
import { OpportunityCard } from '@/components/feed/opportunity-card';
import { cn } from '@/lib/utils';

/** Where a member's profile lives for this viewer; administrators have no member pages. */
export function profileBaseFor(viewer: SessionUser): string | null {
  return viewer.role === 'admin' ? null : `/${viewer.role}/people`;
}

const tagBaseFor = (viewer: SessionUser) => (viewer.role === 'admin' ? null : `/${viewer.role}/home?tag=`);

function AuthorLine({ post, viewer, size = 'lg' }: { post: FeedPost; viewer: SessionUser; size?: 'lg' | 'md' }) {
  const base = profileBaseFor(viewer);
  const href = base && post.role !== 'admin' ? `${base}/${post.author_id}` : null;
  const avatar = <MemberAvatar name={post.full_name} url={post.avatar_url} size={size} />;
  return (
    <div className="flex min-w-0 items-start gap-3">
      {href ? (
        <Link href={href} tabIndex={-1}>
          {avatar}
        </Link>
      ) : (
        avatar
      )}
      <div className="min-w-0 pt-0.5">
        <p className="truncate">
          {href ? (
            <Link href={href} className="text-sm font-semibold text-foreground hover:text-primary hover:underline">
              {post.full_name}
            </Link>
          ) : (
            <span className="text-sm font-semibold text-foreground">{post.full_name}</span>
          )}
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
  );
}

/** A post's own content: text, photo and any opening it carries. */
function PostBody({ post, viewer }: { post: FeedPost; viewer: SessionUser }) {
  return (
    <>
      {post.body && (
        <div className="px-4 pt-3">
          <ExpandableRichText text={post.body} mentions={post.mentions} profileBase={profileBaseFor(viewer)} tagBase={tagBaseFor(viewer)} />
        </div>
      )}
      {post.opportunity && (
        <OpportunityCard opportunity={post.opportunity} viewer={viewer} posterId={post.author_id} posterRecordId={post.record_id} />
      )}
      {post.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image_url} alt="" loading="lazy" className="mt-3 max-h-[32rem] w-full bg-muted object-contain" />
      )}
    </>
  );
}

/**
 * One post on the feed. A repost with no words of its own shows the original
 * (with a "reposted this" line, and reactions going to the original); a repost
 * with thoughts shows the reposter's words with the original inside.
 * `commentsOpen` starts with the thread showing, as on a shared post's page.
 */
export function PostCard({ post, viewer, commentsOpen = false }: { post: FeedPost; viewer: SessionUser; commentsOpen?: boolean }) {
  const quickRepost = !!post.repost_of && !post.body && !post.image_url && !!post.original;
  // Reactions, comments and sharing act on what the card is about.
  const subject = quickRepost ? post.original! : post;
  const canDelete = post.author_id === viewer.id || viewer.role === 'admin';
  const profileBase = profileBaseFor(viewer);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <article>
        {quickRepost && (
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <Repeat2 className="size-3.5 shrink-0" />
              <MemberAvatar name={post.full_name} url={post.avatar_url} size="sm" className="size-5 text-[8px]" />
              <span className="truncate">
                {profileBase && post.role !== 'admin' ? (
                  <Link href={`${profileBase}/${post.author_id}`} className="font-semibold text-foreground hover:underline">
                    {post.full_name}
                  </Link>
                ) : (
                  <span className="font-semibold text-foreground">{post.full_name}</span>
                )}{' '}
                reposted this · {formatTimeAgo(post.created_at)}
              </span>
            </span>
            {canDelete && <PostMenu postId={post.id} savedByMe={post.saved_by_me} canDelete />}
          </div>
        )}

        <header className="flex items-start justify-between gap-3 px-4 pt-4">
          <AuthorLine post={subject} viewer={viewer} />
          <PostMenu
            postId={subject.id}
            savedByMe={subject.saved_by_me}
            canDelete={!quickRepost && canDelete}
          />
        </header>

        <PostBody post={subject} viewer={viewer} />

        {!quickRepost && post.original && (
          <div className="mx-4 mt-3 overflow-hidden rounded-xl border border-border">
            <div className="px-4 pt-3">
              <AuthorLine post={post.original} viewer={viewer} size="md" />
            </div>
            <div className="-mx-0 pb-3">
              <PostBody post={post.original} viewer={viewer} />
            </div>
          </div>
        )}
        {!quickRepost && post.repost_of && !post.original && (
          <p className={cn('mx-4 mt-3 rounded-xl border border-dashed border-border px-4 py-3 text-xs text-muted-foreground')}>
            The original post is no longer available.
          </p>
        )}

        <div className="pt-3">
          <PostActions
            postId={subject.id}
            likeCount={subject.like_count}
            reactionCounts={subject.reaction_counts}
            commentCount={subject.comment_count}
            repostCount={subject.repost_count}
            myReaction={subject.my_reaction}
            viewer={{ id: viewer.id, role: viewer.role, full_name: viewer.full_name }}
            profileBase={profileBase}
            tagBase={tagBaseFor(viewer)}
            sharePath={postPath(subject.id)}
            shareTitle={`Post by ${subject.full_name} on AlumniBridge`}
            commentsOpen={commentsOpen}
          />
        </div>
      </article>
    </Card>
  );
}
