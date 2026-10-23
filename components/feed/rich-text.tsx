'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Post or comment text with #hashtags and @mentions as links. Text is rendered
 * as text, never HTML. Only mentions the server stored become links, so typing
 * "@Someone" by hand does not fake one.
 */
export function RichText({
  text,
  mentions = [],
  profileBase,
  tagBase,
  className,
}: {
  text: string;
  mentions?: { id: string; full_name: string }[];
  profileBase: string | null;
  tagBase: string | null;
  className?: string;
}) {
  const parts = React.useMemo(() => {
    const names = mentions.map((m) => escape(m.full_name)).sort((a, b) => b.length - a.length);
    const pattern = new RegExp(
      [names.length ? `@(?:${names.join('|')})` : null, '#[\\p{L}\\p{N}_]{2,40}'].filter(Boolean).join('|'),
      'gu'
    );
    const out: { t: string; kind: 'text' | 'tag' | 'mention' }[] = [];
    let last = 0;
    for (const m of text.matchAll(pattern)) {
      const i = m.index ?? 0;
      // A hashtag must start a word, so "C#" or "a#b" stay plain text.
      if (m[0].startsWith('#') && i > 0 && !/\s/.test(text[i - 1])) continue;
      if (i > last) out.push({ t: text.slice(last, i), kind: 'text' });
      out.push({ t: m[0], kind: m[0].startsWith('@') ? 'mention' : 'tag' });
      last = i + m[0].length;
    }
    if (last < text.length) out.push({ t: text.slice(last), kind: 'text' });
    return out;
  }, [text, mentions]);

  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.kind === 'tag' && tagBase) {
          return (
            <Link key={i} href={`${tagBase}${encodeURIComponent(p.t.slice(1).toLowerCase())}`} className="font-medium text-primary hover:underline">
              {p.t}
            </Link>
          );
        }
        if (p.kind === 'mention') {
          const who = mentions.find((m) => `@${m.full_name}` === p.t);
          if (who && profileBase) {
            return (
              <Link key={i} href={`${profileBase}/${who.id}`} className="font-semibold text-primary hover:underline">
                {who.full_name}
              </Link>
            );
          }
        }
        return <React.Fragment key={i}>{p.t}</React.Fragment>;
      })}
    </span>
  );
}

/** Long text clamped to a few lines, with "…more" only when there is more to show. */
export function ExpandableRichText(props: React.ComponentProps<typeof RichText> & { lines?: number }) {
  const [open, setOpen] = React.useState(false);
  const long = props.text.length > 280 || props.text.split('\n').length > 4;
  return (
    <div>
      <p className={cn('whitespace-pre-line break-words text-sm leading-relaxed text-foreground', !open && long && 'line-clamp-4')}>
        <RichText {...props} />
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
