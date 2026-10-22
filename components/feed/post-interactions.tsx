'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bookmark,
  CircleHelp,
  HandHeart,
  Lightbulb,
  Link2,
  Loader2,
  Mail,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  PartyPopper,
  Repeat2,
  Send,
  Share2,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNumber, formatTimeAgo } from '@/lib/format';
import { REACTIONS, REACTION_COLOR, REACTION_LABEL, type Reaction } from '@/lib/feed-shared';
import { Button } from '@/components/ui/button';
import { MemberAvatar } from '@/components/patterns';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MentionTextarea, type MentionMember } from '@/components/feed/mention-textarea';
import { RichText } from '@/components/feed/rich-text';

export { ExpandableRichText } from '@/components/feed/rich-text';

type Viewer = { id: string; role: 'student' | 'alumni' | 'admin'; full_name: string; avatar_url?: string | null };

type Comment = {
  id: string;
  author_id: string;
  body: string;
  created_at: string;
  full_name: string;
  role: string;
  avatar_url?: string | null;
  mentions?: { id: string; full_name: string }[];
};

export const REACTION_ICON: Record<Reaction, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  like: ThumbsUp,
  celebrate: PartyPopper,
  support: HandHeart,
  insightful: Lightbulb,
  curious: CircleHelp,
};

async function call(url: string, init: RequestInit, fallback: string) {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? fallback);
  return body;
}

/** A solid round chip with a reaction's icon, as in the counts row. */
function ReactionChip({ reaction, className }: { reaction: Reaction; className?: string }) {
  const Icon = REACTION_ICON[reaction];
  return (
    <span
      className={cn('inline-flex size-4 items-center justify-center rounded-full ring-2 ring-card', className)}
      style={{ backgroundColor: REACTION_COLOR[reaction] }}
      title={REACTION_LABEL[reaction]}
    >
      <Icon className="size-2.5 text-white" />
    </span>
  );
}

/** The "…" menu on a post: save, and delete for its author or an administrator. */
export function PostMenu({ postId, savedByMe, canDelete }: { postId: string; savedByMe: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState(savedByMe);

  async function toggleSave() {
    const next = !saved;
    setSaved(next);
    try {
      await call(`/api/posts/${postId}/save`, { method: next ? 'POST' : 'DELETE' }, 'Could not update saved posts');
      toast.success(next ? 'Saved. Find it under Saved on Home.' : 'Removed from saved posts.');
    } catch (err: any) {
      setSaved(!next);
      toast.error(err.message);
    }
  }

  async function remove() {
    if (!window.confirm('Delete this post? Its reactions, comments and any listing it carries go with it.')) return;
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
    <div className="flex items-center">
      <button
        type="button"
        onClick={toggleSave}
        aria-pressed={saved}
        aria-label={saved ? 'Unsave post' : 'Save post'}
        className={cn(
          'inline-flex size-7 items-center justify-center rounded-md transition-colors hover:bg-muted',
          saved ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
        )}
      >
        <Bookmark className={cn('size-4', saved && 'fill-current')} />
      </button>
      {canDelete && (
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
      )}
    </div>
  );
}

/**
 * Share a post's link: copy it, hand it to the device's share sheet, or send it
 * on WhatsApp or by email. The link opens for any signed-in member, and sends
 * anyone else to sign in first and then straight back to the post.
 */
function ShareMenu({ path, title, onRepost }: { path: string; title: string; onRepost: (withThoughts: boolean) => void }) {
  const [canNativeShare, setCanNativeShare] = React.useState(false);
  React.useEffect(() => setCanNativeShare(typeof navigator !== 'undefined' && 'share' in navigator), []);
  const url = () => `${window.location.origin}${path}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url());
      toast.success('Link copied. Anyone on AlumniBridge can open it.');
    } catch {
      toast.error('Could not copy the link.');
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
        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Repost or share"
      >
        <Repeat2 className="size-4" />
        <span className="hidden sm:inline">Share</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={() => onRepost(false)}>
          <Repeat2 className="size-4" />
          Repost
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onRepost(true)}>
          <MessageSquare className="size-4" />
          Repost with your thoughts
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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

/** Like with a reaction picker on hover or long-press, as on LinkedIn. */
function ReactButton({ mine, onReact }: { mine: Reaction | null; onReact: (r: Reaction | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressed = React.useRef(false);
  const clear = () => timer.current && clearTimeout(timer.current);
  const Icon = REACTION_ICON[mine ?? 'like'];

  return (
    <div
      className="relative"
      onMouseEnter={() => {
        clear();
        timer.current = setTimeout(() => setOpen(true), 450);
      }}
      onMouseLeave={() => {
        clear();
        timer.current = setTimeout(() => setOpen(false), 250);
      }}
    >
      {open && (
        <div
          role="menu"
          aria-label="Reactions"
          className="absolute bottom-full left-0 z-30 mb-1 flex gap-1 rounded-full border border-border bg-popover p-1.5 shadow-lg"
        >
          {REACTIONS.map((r) => {
            const RIcon = REACTION_ICON[r];
            return (
              <button
                key={r}
                type="button"
                role="menuitem"
                aria-label={REACTION_LABEL[r]}
                title={REACTION_LABEL[r]}
                onClick={() => {
                  setOpen(false);
                  onReact(r);
                }}
                className="flex size-9 items-center justify-center rounded-full transition-transform hover:-translate-y-1 hover:scale-110"
                style={{ backgroundColor: REACTION_COLOR[r] }}
              >
                <RIcon className="size-4.5 text-white" />
              </button>
            );
          })}
        </div>
      )}
      <Button
        variant="ghost"
        aria-pressed={!!mine}
        className="w-full text-muted-foreground"
        style={mine ? { color: REACTION_COLOR[mine] } : undefined}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return;
          pressed.current = false;
          clear();
          timer.current = setTimeout(() => {
            pressed.current = true;
            setOpen(true);
          }, 450);
        }}
        onPointerUp={clear}
        onClick={() => {
          if (pressed.current) {
            pressed.current = false;
            return;
          }
          onReact(mine ? null : 'like');
        }}
      >
        <Icon className={cn(mine && 'fill-current/20')} />
        {mine ? REACTION_LABEL[mine] : 'Like'}
      </Button>
    </div>
  );
}

/** Counts, React, Comment and Share, and the comment thread under one post. */
export function PostActions({
  postId,
  likeCount,
  reactionCounts,
  commentCount,
  repostCount,
  myReaction,
  viewer,
  profileBase,
  tagBase,
  sharePath,
  shareTitle,
  commentsOpen = false,
}: {
  postId: string;
  likeCount: number;
  reactionCounts: Partial<Record<Reaction, number>>;
  commentCount: number;
  repostCount: number;
  myReaction: Reaction | null;
  viewer: Viewer;
  /** "/student/people" or "/alumni/people": comment authors link to their profiles. */
  profileBase: string | null;
  tagBase: string | null;
  /** The post's own link, e.g. "/posts/<id>"; Share copies it as a full URL. */
  sharePath: string;
  shareTitle: string;
  commentsOpen?: boolean;
}) {
  const router = useRouter();
  const [mine, setMine] = React.useState<Reaction | null>(myReaction);
  const [total, setTotal] = React.useState(likeCount);
  const [byReaction, setByReaction] = React.useState(reactionCounts);
  const [comments, setComments] = React.useState<Comment[] | null>(null);
  const [commentTotal, setCommentTotal] = React.useState(commentCount);
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [draftMentions, setDraftMentions] = React.useState<MentionMember[]>([]);
  const [sending, setSending] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [reposting, setReposting] = React.useState<null | 'quick' | 'thoughts'>(null);
  const [thoughts, setThoughts] = React.useState('');
  const [thoughtMentions, setThoughtMentions] = React.useState<MentionMember[]>([]);

  // On a shared post's page the thread starts open.
  React.useEffect(() => {
    if (commentsOpen) openComments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function react(next: Reaction | null) {
    const before = { mine, total, byReaction };
    // Optimistic: show it now, settle on the server's counts.
    setMine(next);
    setTotal((n) => n + (next && !mine ? 1 : !next && mine ? -1 : 0));
    setByReaction((c) => {
      const out = { ...c };
      if (mine) out[mine] = Math.max(0, (out[mine] ?? 1) - 1);
      if (next) out[next] = (out[next] ?? 0) + 1;
      return out;
    });
    try {
      const body = await call(
        `/api/posts/${postId}/like`,
        next
          ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reaction: next }) }
          : { method: 'DELETE' },
        'Could not update your reaction'
      );
      setTotal(body.like_count);
      setByReaction(body.reaction_counts);
    } catch (err: any) {
      setMine(before.mine);
      setTotal(before.total);
      setByReaction(before.byReaction);
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
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ body: draft.trim(), mentions: draftMentions.map((m) => m.id) }),
        },
        'Could not add the comment'
      );
      setComments((c) => [...(c ?? []), { ...body.comment, avatar_url: viewer.avatar_url, mentions: draftMentions }]);
      setCommentTotal((n) => n + 1);
      setDraft('');
      setDraftMentions([]);
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

  async function repost(text: string, mentions: MentionMember[]) {
    const form = new FormData();
    form.set('repost_of', postId);
    form.set('body', text.trim());
    form.set('mentions', JSON.stringify(mentions.map((m) => m.id)));
    try {
      await call('/api/posts', { method: 'POST', body: form }, 'Could not repost');
      toast.success('Reposted to your network.');
      setReposting(null);
      setThoughts('');
      setThoughtMentions([]);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    }
  }

  const top = (Object.entries(byReaction) as [Reaction, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([r]) => r);

  return (
    <div>
      {(total > 0 || commentTotal > 0 || repostCount > 0) && (
        <div className="flex items-center justify-between gap-3 px-4 pb-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {total > 0 && (
              <>
                <span className="flex -space-x-1">
                  {(top.length ? top : (['like'] as Reaction[])).map((r) => (
                    <ReactionChip key={r} reaction={r} />
                  ))}
                </span>
                <span className="tnum">{formatNumber(total)}</span>
              </>
            )}
          </span>
          <span className="flex items-center gap-2">
            {commentTotal > 0 && (
              <button type="button" onClick={openComments} className="tnum hover:text-primary hover:underline">
                {formatNumber(commentTotal)} {commentTotal === 1 ? 'comment' : 'comments'}
              </button>
            )}
            {repostCount > 0 && <span className="tnum">{formatNumber(repostCount)} {repostCount === 1 ? 'repost' : 'reposts'}</span>}
          </span>
        </div>
      )}

      <div className="grid grid-cols-3 border-t border-border px-2 py-1">
        <ReactButton mine={mine} onReact={react} />
        <Button variant="ghost" onClick={openComments} className="text-muted-foreground">
          <MessageSquare />
          Comment
        </Button>
        <ShareMenu path={sharePath} title={shareTitle} onRepost={(withThoughts) => (withThoughts ? setReposting('thoughts') : repost('', []))} />
      </div>

      <Dialog open={reposting === 'thoughts'} onOpenChange={(o) => !o && setReposting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Repost with your thoughts</DialogTitle>
            <DialogDescription>Add why this matters to your network. The original post is shared below your words.</DialogDescription>
          </DialogHeader>
          <MentionTextarea
            value={thoughts}
            onChange={(v) => setThoughts(v.slice(0, 3000))}
            mentions={thoughtMentions}
            onMentionsChange={setThoughtMentions}
            placeholder="What do you want to say about this? Use @ to mention someone."
            className="min-h-28 text-sm"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReposting(null)}>
              Cancel
            </Button>
            <Button onClick={() => repost(thoughts, thoughtMentions)} disabled={!thoughts.trim()}>
              <Repeat2 />
              Repost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {open && (
        <div className="space-y-3 border-t border-border px-4 py-3">
          <div className="flex items-start gap-2">
            <MemberAvatar name={viewer.full_name} url={viewer.avatar_url} size="sm" />
            <div className="flex min-w-0 flex-1 items-start gap-2">
              <div className="min-w-0 flex-1">
                <MentionTextarea
                  value={draft}
                  onChange={(v) => setDraft(v.slice(0, 1000))}
                  mentions={draftMentions}
                  onMentionsChange={setDraftMentions}
                  placeholder="Add a comment… (@ to mention)"
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
              </div>
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
                    <MemberAvatar name={c.full_name} url={c.avatar_url} size="sm" />
                  </Link>
                ) : (
                  <MemberAvatar name={c.full_name} url={c.avatar_url} size="sm" />
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
                  <p className="mt-0.5 whitespace-pre-line break-words text-sm text-foreground">
                    <RichText text={c.body} mentions={c.mentions} profileBase={profileBase} tagBase={tagBase} />
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
