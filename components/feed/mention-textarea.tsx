'use client';

import * as React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { MemberAvatar } from '@/components/patterns';
import { cn } from '@/lib/utils';

export type MentionMember = { id: string; full_name: string; headline: string; avatar_url: string | null };

/**
 * A textarea that suggests members when you type "@" and a couple of letters.
 * Picking one inserts "@Full Name " and records the id in `mentions`, which the
 * server checks against the text before notifying anyone.
 */
export function MentionTextarea({
  value,
  onChange,
  mentions,
  onMentionsChange,
  className,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  mentions: MentionMember[];
  onMentionsChange: (m: MentionMember[]) => void;
} & Omit<React.ComponentProps<'textarea'>, 'value' | 'onChange'>) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = React.useState<{ text: string; start: number } | null>(null);
  const [results, setResults] = React.useState<MentionMember[]>([]);
  const [active, setActive] = React.useState(0);

  // Look up members as the "@name" under the caret grows; ignore stale answers.
  React.useEffect(() => {
    if (!query || query.text.length < 2) return setResults([]);
    let live = true;
    const t = setTimeout(async () => {
      const res = await fetch(`/api/members?q=${encodeURIComponent(query.text)}`).catch(() => null);
      const body = res?.ok ? await res.json() : { members: [] };
      if (live) {
        setResults(body.members ?? []);
        setActive(0);
      }
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query]);

  function update(next: string) {
    onChange(next);
    const caret = ref.current?.selectionStart ?? next.length;
    const m = next.slice(0, caret).match(/(^|\s)@([\p{L} .'-]{0,40})$/u);
    setQuery(m ? { text: m[2].trimStart(), start: caret - m[2].length - 1 } : null);
    // Drop mentions whose "@Name" was edited out of the text.
    const kept = mentions.filter((x) => next.includes(`@${x.full_name}`));
    if (kept.length !== mentions.length) onMentionsChange(kept);
  }

  function pick(member: MentionMember) {
    if (!query) return;
    const caret = ref.current?.selectionStart ?? value.length;
    const next = `${value.slice(0, query.start)}@${member.full_name} ${value.slice(caret)}`;
    onChange(next.slice(0, 3000));
    if (!mentions.some((x) => x.id === member.id)) onMentionsChange([...mentions, member]);
    setQuery(null);
    setResults([]);
    requestAnimationFrame(() => {
      const pos = query.start + member.full_name.length + 2;
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (results.length && query) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (a + 1) % results.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a - 1 + results.length) % results.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              pick(results[active]);
              return;
            }
            if (e.key === 'Escape') {
              setQuery(null);
              return;
            }
          }
          props.onKeyDown?.(e);
        }}
        className={className}
        {...props}
      />
      {query && results.length > 0 && (
        <ul
          role="listbox"
          aria-label="Members to mention"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-lg border border-border bg-popover py-1 shadow-lg"
        >
          {results.map((m, i) => (
            <li key={m.id} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                className={cn('flex w-full items-center gap-2.5 px-3 py-2 text-left', i === active ? 'bg-muted' : 'hover:bg-muted')}
              >
                <MemberAvatar name={m.full_name} url={m.avatar_url} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-foreground">{m.full_name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{m.headline}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
