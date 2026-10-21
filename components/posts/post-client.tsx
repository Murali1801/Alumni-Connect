'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/** Long text clamped to a few lines, with a toggle only when there is more to show. */
export function ExpandableText({ text, className }: { text: string; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const long = text.length > 320 || text.split('\n').length > 6;
  return (
    <div className={className}>
      <p className={cn('whitespace-pre-line break-words text-sm leading-relaxed text-foreground', !open && long && 'line-clamp-6')}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-1 text-xs font-medium text-primary hover:underline"
          aria-expanded={open}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

async function remove(url: string, fallback: string) {
  const res = await fetch(url, { method: 'DELETE' });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? fallback);
  return body as { count?: number };
}

/** Delete one post. The API lets only its author or an administrator do this. */
export function DeletePostButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onClick() {
    if (!window.confirm('Remove this post from the network?')) return;
    setBusy(true);
    try {
      await remove(`/api/posts/${id}`, 'Could not remove the post');
      toast.success('Post removed.');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the post');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={busy} aria-label="Remove post">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      Remove
    </Button>
  );
}

/** Remove every post the alumnus imported from LinkedIn. */
export function RemoveImportedPostsButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function onClick() {
    if (!window.confirm('Remove all the posts and articles you imported from LinkedIn?')) return;
    setBusy(true);
    try {
      const { count } = await remove('/api/profile/alumni/linkedin/posts', 'Could not remove your posts');
      toast.success(`Removed ${count ?? 0} post${count === 1 ? '' : 's'}.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove your posts');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={onClick} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      Remove all
    </Button>
  );
}
