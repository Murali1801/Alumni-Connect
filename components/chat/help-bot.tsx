'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bot, X, Send, Loader2, Sparkles, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SUGGESTED_QUESTIONS } from '@/lib/chatbot/suggestions';
import type { Role } from '@/lib/session';

type Source = { id: string; question: string; href?: string; hrefLabel?: string };
type Turn = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  mode?: 'llm' | 'offline';
};

const GREETING =
  'Ask me anything — how this platform works, or the wider things around it: interview preparation, choosing a direction, what to put in an outreach message. For questions about the platform itself I answer from its own documentation, and I will say so when something is outside what I know.';

export function HelpBot({ role }: { role: Role }) {
  const suggestions = SUGGESTED_QUESTIONS[role];
  const [open, setOpen] = React.useState(false);
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns, busy, open]);

  // Escape closes the panel, matching every other overlay in the app.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    const userTurn: Turn = { id: `u-${Date.now()}`, role: 'user', content: q };
    setTurns((prev) => [...prev, userTurn]);
    setDraft('');
    setBusy(true);

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          // Keep the last few turns for context, but cap it so the request
          // cannot grow without bound.
          history: turns.slice(-6).map((t) => ({ role: t.role, content: t.content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not reach the assistant');

      setTurns((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: 'assistant',
          content: data.answer,
          sources: data.sources ?? [],
          mode: data.mode,
        },
      ]);
    } catch (err: any) {
      setTurns((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: 'assistant',
          content: `Something went wrong: ${err.message}. The Help page has the same information in full.`,
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Launcher */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close the help assistant' : 'Open the help assistant'}
        aria-expanded={open}
        className={cn(
          'fixed bottom-5 right-5 z-50 flex size-12 items-center justify-center rounded-full shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          open ? 'bg-muted text-foreground' : 'bg-primary text-primary-foreground'
        )}
      >
        {open ? <X className="size-5" /> : <Bot className="size-5" />}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Help assistant"
          className="fixed bottom-20 right-5 z-50 flex h-[min(32rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl"
        >
          <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-foreground">Platform help</h2>
              <p className="truncate text-[11px] text-muted-foreground">
                Platform questions and general career help
              </p>
            </div>
            {turns.length > 0 && (
              <Button size="xs" variant="ghost" onClick={() => setTurns([])}>
                Clear
              </Button>
            )}
          </header>

          <div ref={scrollRef} className="scrollbar-thin flex-1 space-y-3 overflow-y-auto p-4">
            {turns.length === 0 ? (
              <>
                <div className="rounded-lg bg-muted px-3 py-2.5 text-sm leading-relaxed text-foreground">
                  {GREETING}
                </div>
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Try asking
                  </p>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-muted"
                    >
                      <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                      {s}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              turns.map((t) => (
                <div key={t.id} className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[88%] space-y-2 rounded-2xl px-3 py-2 text-sm leading-relaxed',
                      t.role === 'user'
                        ? 'rounded-br-sm bg-primary text-primary-foreground'
                        : 'rounded-bl-sm bg-muted text-foreground'
                    )}
                  >
                    <p className="whitespace-pre-wrap">{t.content}</p>

                    {t.role === 'assistant' && t.sources && t.sources.length > 0 && (
                      <div className="space-y-1 border-t border-border/60 pt-2">
                        {t.sources
                          .filter((s) => s.href)
                          .slice(0, 2)
                          .map((s) => (
                            <Link
                              key={s.id}
                              href={s.href!}
                              onClick={() => setOpen(false)}
                              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                            >
                              <ArrowRight className="size-3" />
                              {s.hrefLabel ?? 'Open the page'}
                            </Link>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {busy && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" />
                  Looking it up…
                </div>
              </div>
            )}
          </div>

          <form
            className="flex items-center gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(draft);
            }}
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about this platform…"
              aria-label="Ask the help assistant"
              maxLength={500}
              className="h-9"
            />
            <Button type="submit" size="icon" className="size-9" disabled={!draft.trim() || busy} aria-label="Send">
              <Send className="size-4" />
            </Button>
          </form>

          <p className="border-t border-border px-3 py-2 text-[10px] leading-relaxed text-muted-foreground">
            Platform answers come from a fixed set of documented facts. It cannot see your account,
            your requests or your messages.
          </p>
        </div>
      )}
    </>
  );
}
