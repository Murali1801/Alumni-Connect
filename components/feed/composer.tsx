'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ImageIcon, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { InitialsAvatar } from '@/components/patterns';

const MAX = 3000;
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** "Start a post": a prompt that opens into a text box with an optional photo. */
export function Composer({ name }: { name: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState('');
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<string | null>(null);
  const [posting, setPosting] = React.useState(false);
  const fileInput = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!file) return setPreview(null);
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0] ?? null;
    e.target.value = '';
    if (!picked) return;
    if (!TYPES.includes(picked.type)) return toast.error('Photos must be JPEG, PNG, WebP or GIF.');
    if (picked.size > MAX_BYTES) return toast.error('Photos must be 5 MB or smaller.');
    setFile(picked);
    setOpen(true);
  }

  function reset() {
    setText('');
    setFile(null);
    setOpen(false);
  }

  async function publish() {
    setPosting(true);
    try {
      const form = new FormData();
      form.set('body', text.trim());
      if (file) form.set('image', file);
      const res = await fetch('/api/posts', { method: 'POST', body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not publish the post');
      toast.success('Posted.');
      reset();
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPosting(false);
    }
  }

  const empty = !text.trim() && !file;

  return (
    <Card className="gap-0 p-4">
      <div className="flex items-start gap-3">
        <InitialsAvatar name={name} size="md" />
        {open ? (
          <div className="min-w-0 flex-1 space-y-3">
            <Textarea
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, MAX))}
              placeholder="What do you want to share with the SJCEM network?"
              className="min-h-28 resize-y text-sm"
              aria-label="Post text"
            />
            {preview && (
              <div className="relative overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="Photo to post" className="max-h-80 w-full object-contain bg-muted" />
                <Button
                  variant="secondary"
                  size="icon-sm"
                  className="absolute right-2 top-2"
                  onClick={() => setFile(null)}
                  aria-label="Remove photo"
                >
                  <X />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="h-11 flex-1 rounded-full border border-border px-4 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            Start a post
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()} className="text-muted-foreground">
          <ImageIcon className="text-[var(--info)]" />
          Photo
        </Button>
        <input ref={fileInput} type="file" accept={TYPES.join(',')} className="hidden" onChange={choose} />
        {open && (
          <div className="flex items-center gap-2">
            <span className="tnum text-xs text-muted-foreground">
              {text.length > MAX - 300 ? `${MAX - text.length} left` : ''}
            </span>
            <Button variant="ghost" size="sm" onClick={reset} disabled={posting}>
              Cancel
            </Button>
            <Button size="sm" onClick={publish} disabled={empty || posting}>
              {posting && <Loader2 className="animate-spin" />}
              Post
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
