'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Link2, Loader2, Mail, MessageCircle, MessageSquare, MoreHorizontal, Send, Share2, ThumbsUp, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNumber, formatTimeAgo } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { InitialsAvatar } from '@/components/patterns';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

type Viewer = { id: string; role: 'student' | 'alumni' | 'admin'; full_name: string };

type Comment = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  full_name: string;
  role: string;
};

async function call(url: string, init: RequestInit, fallback: string) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? fallback);
  return body;
}

/** Long text clamped to a few lines, with "…more" only when there is more to show. */
export function ExpandableText({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  const long = text.length > 280 || text.split('\n').length > 4;
  return (
    <div>
      <p className={cn('whitespace-pre-line break-words text-sm leading-relaxed text-foreground', !open && long && 'line-clamp-4')}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 text-sm text-muted-foreground hover:text-primary hover:underline"
          aria-expanded={open}
        >
          {open ? 'show less' : '…more'}
        </button>
      )}
    </div>
  );
}

/** The "…" menu on a post: delete, for its author or an administrator. */
export function PostMenu({ postId }: { postId: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function remove() {
    if (!window.confirm('Delete this post? Its likes and comments go with it.')) return;
    setBusy(true);
    try {
      await call(`/api/posts/${postId}`, { method: 'DELETE' }, 'Could not delete the post');
      toast.success('Post deleted.');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        aria-label="Post options"
        disabled={busy}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <MoreHorizontal className="size-4" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={remove} className="text-destructive">
          <Trash2 className="size-4" />
          Delete post
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Share a post's link: copy it, hand it to the device's share sheet, or send it
 * on WhatsApp or by email. The link opens for any signed-in member, and sends
 * anyone else to sign in first and then straight back to the post.
 */
function ShareMenu({ path, title }: { path: string; title: string }) {
  const [canNativeShare, setCanNativeShare] = React.useState(false);
  React.useEffect(() => setCanNativeShare(typeof navigator !== 'undefined' && 'share' in navigator), []);
  const url = () => `${window.location.origin}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      toast.success('Link copied. Anyone on AlumniBridge can open it.');
    } catch {
      toast.error('Could not copy the link. Long-press the post time to copy it instead.');
    }
  }

  async function nativeShare() {
    try {
      await navigator.share({ title, url: url() });
    } catch {
      /* the viewer closed the share sheet */
    }
  }

  const open = (href: string) => window.open(href, '_blank', 'noopener,noreferrer');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Share post"
      >
        <Share2 className="size-4" />
        Share
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={copy}>
          <Link2 className="size-4" />
          Copy link
        </DropdownMenuItem>
        {canNativeShare && (
          <DropdownMenuItem onClick={nativeShare}>
            <Share2 className="size-4" />
            Share via…
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => open(`https://wa.me/?text=${encodeURIComponent(`${title}: ${url()}`)}`)}>
          <MessageCircle className="size-4" />
          WhatsApp
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(url())}`;
          }}
        >
          <Mail className="size-4" />
          Email
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Counts, Like, Comment and Share, and the comment thread under one post. */
export function PostActions({
  postId,
  likeCount,
  commentCount,
  likedByMe,
  viewer,
  profileBase,
  sharePath,
  shareTitle,
  commentsOpen = false,
}: {
  postId: string;
  likeCount: number;
  commentCount: number;
  likedByMe: boolean;
  viewer: Viewer;
  /** "/student/people" or "/alumni/people": comment authors link to their profiles. */
  profileBase: string | null;
  /** The post's own link, e.g. "/posts/<id>"; Share copies it as a full URL. */
  sharePath: string;
  shareTitle: string;
  commentsOpen?: boolean;
}) {
  const [liked, setLiked] = React.useState(likedByMe);
  const [likes, setLikes] = React.useState(likeCount);
  const [comments, setComments] = React.useState<Comment[] | null>(null);
  const [commentTotal, setCommentTotal] = React.useState(commentCount);
  const [open, setOpen] = React.useState(false);

  // On a shared post's page the thread starts open.
  React.useEffect(() => {
    if (commentsOpen) openComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function toggleLike() {
    const next = !liked;
    // Optimistic: flip now, settle on the server's count.
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    try {
      const body = await call(`/api/posts/${postId}/like`, { method: next ? 'POST' : 'DELETE' }, 'Could not update the like');
      setLikes(body.like_count);
    } catch (err: any) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
      toast.error(err.message);
    }
  }

  async function openComments() {
    setOpen(true);
    if (comments) return;
    setLoading(true);
    try {
      const body = await call(`/api/posts/${postId}/comments`, { method: 'GET' }, 'Could not load comments');
      setComments(body.comments);
      setCommentTotal(body.comments.length);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function send() {
    setSending(true);
    try {
      const body = await call(
        `/api/posts/${postId}/comments`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: draft.trim() }) },
        'Could not add the comment'
      );
      setComments((c) => [...(c ?? []), body.comment]);
      setCommentTotal((n) => n + 1);
      setDraft('');
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  async function removeComment(id: string) {
    try {
      await call(`/api/posts/${postId}/comments/${id}`, { method: 'DELETE' }, 'Could not delete the comment');
      setComments((c) => (c ?? []).filter((x) => x.id !== id));
      setCommentTotal((n) => n - 1);
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  return (
    <div>
      {(likes > 0 || commentTotal > 0) && (
        <div className="flex items-center justify-between px-4 pb-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            {likes > 0 && (
              <>
                <span className="inline-flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                  <ThumbsUp className="size-2.5" />
                </span>
                <span className="tnum">{formatNumber(likes)}</span>
              </>
            )}
          </span>
          {commentTotal > 0 && (
            <button type="button" onClick={openComments} className="tnum hover:text-primary hover:underline">
              {formatNumber(commentTotal)} {commentTotal === 1 ? 'comment' : 'comments'}
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 border-t border-border px-2 py-1">
        <Button
          variant="ghost"
          onClick={toggleLike}
          aria-pressed={liked}
          className={cn('text-muted-foreground', liked && 'text-primary hover:text-primary')}
        >
          <ThumbsUp className={cn(liked && 'fill-current')} />
          Like
        </Button>
        <Button variant="ghost" onClick={openComments} className="text-muted-foreground">
          <MessageSquare />
          Comment
        </Button>
        <ShareMenu path={sharePath} title={shareTitle} />
      </div>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <div className="flex items-start gap-2">
            <InitialsAvatar name={viewer.full_name} size="sm" />
            <div className="flex min-w-0 flex-1 items-end gap-2">
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value.slice(0, 1000))}
                placeholder="Add a comment…"
                className="min-h-9 resize-none rounded-2xl text-sm"
                rows={1}
                aria-label="Comment"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && draft.trim() && !sending) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <Button size="icon" onClick={send} disabled={!draft.trim() || sending} aria-label="Send comment">
                {sending ? <Loader2 className="animate-spin" /> : <Send />}
              </Button>
            </div>
          </div>

          {loading && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading comments…
            </p>
          )}

          {comments?.map((c) => {
            const href = profileBase && c.role !== 'admin' ? `${profileBase}/${c.author_id}` : null;
            return (
            <div key={c.id} className="flex items-start gap-2">
              {href ? (
                <Link href={href} tabIndex={-1}>
                  <InitialsAvatar name={c.full_name} size="sm" />
                </Link>
              ) : (
                <InitialsAvatar name={c.full_name} size="sm" />
              )}
              <div className="min-w-0 flex-1 rounded-xl bg-muted px-3 py-2">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-xs font-semibold text-foreground">
                    {href ? (
                      <Link href={href} className="hover:text-primary hover:underline">
                        {c.full_name}
                      </Link>
                    ) : (
                      c.full_name
                    )}
                    <span className="ml-1.5 font-normal capitalize text-muted-foreground">{c.role === 'alumni' ? 'Alumnus' : c.role}</span>
                  </p>
                  <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                    {formatTimeAgo(c.created_at)}
                    {(c.author_id === viewer.id || viewer.role === 'admin') && (
                      <button
                        type="button"
                        onClick={() => removeComment(c.id)}
                        className="rounded p-0.5 hover:text-destructive"
                        aria-label="Delete comment"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </span>
                </div>
                <p className="mt-0.5 whitespace-pre-line break-words text-sm text-foreground">{c.body}</p>
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
