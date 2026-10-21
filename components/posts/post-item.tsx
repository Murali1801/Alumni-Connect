import Link from 'next/link';
import { ExternalLink, ImageIcon, Link2 } from 'lucide-react';
import { formatDate } from '@/lib/format';
import type { FeedItem, PostRow } from '@/lib/queries';
import { Badge } from '@/components/ui/badge';
import { InitialsAvatar } from '@/components/patterns';
import { DeletePostButton, ExpandableText } from '@/components/posts/post-client';

function hostOf(url: string) {
  try {
    return new URL(url).host.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function isFeedItem(post: PostRow | FeedItem): post is FeedItem {
  return 'full_name' in post;
}

/**
 * One post or article. Text is rendered as text, never as HTML: it came from an
 * export file. With `authorHref`, the author's name links to their profile.
 */
export function PostItem({
  post,
  authorHref,
  canDelete = false,
}: {
  post: PostRow | FeedItem;
  authorHref?: string;
  canDelete?: boolean;
}) {
  const author = isFeedItem(post) ? post : null;
  const role = author ? [author.designation, author.company_name].filter(Boolean).join(' at ') : '';

  return (
    <article className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        {author ? (
          <div className="flex min-w-0 items-center gap-3">
            <InitialsAvatar name={author.full_name} size="md" />
            <div className="min-w-0">
              {authorHref ? (
                <Link href={authorHref} className="text-sm font-semibold text-foreground hover:underline">
                  {author.full_name}
                </Link>
              ) : (
                <p className="text-sm font-semibold text-foreground">{author.full_name}</p>
              )}
              <p className="truncate text-xs text-muted-foreground">
                {[role || null, `${author.branch} · ${author.batch_year}`].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-2">
          {post.kind === 'article' && <Badge variant="secondary">Article</Badge>}
          <time dateTime={post.posted_at} className="tnum text-xs text-muted-foreground">
            {formatDate(post.posted_at)}
          </time>
        </div>
      </div>

      {post.title && <h3 className="text-base font-semibold leading-snug text-foreground">{post.title}</h3>}
      {post.body && <ExpandableText text={post.body} />}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        {post.shared_url && (
          <a
            href={post.shared_url}
            target="_blank"
            rel="noreferrer noopener nofollow"
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            <Link2 className="size-3.5" />
            {hostOf(post.shared_url)}
          </a>
        )}
        {post.has_media && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <ImageIcon className="size-3.5" />
            Includes a photo or video
          </span>
        )}
        {post.linkedin_url && (
          <a
            href={post.linkedin_url}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
          >
            <ExternalLink className="size-3.5" />
            {post.kind === 'article' ? 'Read on LinkedIn' : 'View on LinkedIn'}
          </a>
        )}
        {canDelete && (
          <span className="ml-auto">
            <DeletePostButton id={post.id} />
          </span>
        )}
      </div>
    </article>
  );
}
