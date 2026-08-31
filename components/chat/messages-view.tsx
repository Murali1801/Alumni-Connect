'use client';

import * as React from 'react';
import Link from 'next/link';
import { Send, Loader2, MessageSquare, Video, ArrowLeft, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { cn } from '@/lib/utils';
import { createClient } from '@/lib/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { InitialsAvatar, EmptyState } from '@/components/patterns';
import { ScheduleDialog } from '@/components/calendar/schedule-dialog';
import { formatDate, formatDayMonth, formatTime } from '@/lib/format';

export type ThreadView = {
  thread_id: string;
  peer: { id: string; full_name: string; role: string };
  lastMessage: { body: string; created_at: string; from_id: string } | null;
  unread: number;
  requestType: string | null;
};

export type MessageView = {
  id: string;
  thread_id: string;
  from_id: string;
  to_id: string;
  body: string;
  created_at: string;
};

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return 'Today';
  if (same(d, yesterday)) return 'Yesterday';
  return formatDate(d);
}

export function MessagesView({
  threads,
  selfId,
  initialPeerId,
}: {
  threads: ThreadView[];
  selfId: string;
  initialPeerId: string | null;
}) {
  const [activeId, setActiveId] = React.useState<string | null>(initialPeerId ?? threads[0]?.peer.id ?? null);
  const [messages, setMessages] = React.useState<MessageView[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const [unread, setUnread] = React.useState<Record<string, number>>(
    Object.fromEntries(threads.map((t) => [t.peer.id, t.unread]))
  );

  const active = threads.find((t) => t.peer.id === activeId) ?? null;
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const channelRef = React.useRef<RealtimeChannel | null>(null);

  /* ---------- load a conversation ---------- */
  React.useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/messages?peer=${activeId}`, { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled) setMessages(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) toast.error('Could not load this conversation.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    setUnread((u) => ({ ...u, [activeId]: 0 }));
    return () => {
      cancelled = true;
    };
  }, [activeId]);

  /* ---------- live delivery ---------- */
  React.useEffect(() => {
    if (!active) return;
    const supabase = createClient();
    const channel = supabase.channel(`chat:${active.thread_id}`, {
      config: { broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on('broadcast', { event: 'message' }, ({ payload }) => {
      const m = payload as MessageView;
      if (!m?.id || m.thread_id !== active.thread_id) return;
      // The sender already appended optimistically; guard against echo anyway.
      setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
    });

    channel.subscribe();
    return () => {
      channel.unsubscribe();
      channelRef.current = null;
    };
  }, [active?.thread_id, active]);

  /* ---------- keep the newest message in view ---------- */
  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function send() {
    const body = draft.trim();
    if (!body || !active || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: active.peer.id, body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not send');

      setMessages((prev) => [...prev, data]);
      setDraft('');
      channelRef.current?.send({ type: 'broadcast', event: 'message', payload: data });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  if (threads.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title="No conversations yet"
        description="A conversation opens as soon as a request is accepted — that acceptance is what connects the two of you."
      />
    );
  }

  return (
    <Card className="grid h-[calc(100dvh-15rem)] min-h-[28rem] grid-cols-1 gap-0 overflow-hidden p-0 md:grid-cols-[18rem_1fr]">
      {/* Thread list */}
      <aside
        className={cn(
          'flex min-h-0 flex-col border-border md:border-r',
          activeId && 'hidden md:flex'
        )}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{threads.length} connected</p>
        </div>
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
          {threads.map((t) => (
            <button
              key={t.thread_id}
              onClick={() => setActiveId(t.peer.id)}
              className={cn(
                'flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left transition-colors',
                activeId === t.peer.id ? 'bg-primary/10' : 'hover:bg-muted'
              )}
            >
              <InitialsAvatar name={t.peer.full_name} size="md" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium text-foreground">{t.peer.full_name}</span>
                  {t.lastMessage && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatDayMonth(t.lastMessage.created_at)}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5">
                  <span className="line-clamp-1 flex-1 text-xs text-muted-foreground">
                    {t.lastMessage
                      ? `${t.lastMessage.from_id === selfId ? 'You: ' : ''}${t.lastMessage.body}`
                      : `Connected through a ${(t.requestType ?? 'request').replace('_', ' ')} request`}
                  </span>
                  {(unread[t.peer.id] ?? 0) > 0 && (
                    <span className="tnum inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                      {unread[t.peer.id]}
                    </span>
                  )}
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      {/* Conversation */}
      {active ? (
        <section className="flex min-h-0 flex-col">
          <header className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Back to conversations"
              onClick={() => setActiveId(null)}
            >
              <ArrowLeft className="size-4" />
            </Button>
            <InitialsAvatar name={active.peer.full_name} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-foreground">{active.peer.full_name}</p>
              <p className="truncate text-xs capitalize text-muted-foreground">
                {active.peer.role} · connected via {(active.requestType ?? 'request').replace('_', ' ')}
              </p>
            </div>
            <ScheduleDialog
              peerId={active.peer.id}
              peerName={active.peer.full_name}
              defaultTitle={`Session with ${active.peer.full_name}`}
              trigger={
                <Button size="sm" variant="outline">
                  <CalendarPlus className="size-3.5" />
                  <span className="hidden sm:inline">Schedule</span>
                </Button>
              }
            />
          </header>

          <div ref={scrollRef} className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
            {loading ? (
              <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Loading conversation…
              </p>
            ) : messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                <MessageSquare className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium text-foreground">No messages yet</p>
                <p className="max-w-xs text-xs leading-relaxed text-muted-foreground">
                  Say hello. Messages are kept, so you can both pick the thread back up later.
                </p>
              </div>
            ) : (
              messages.map((m, i) => {
                const mine = m.from_id === selfId;
                const showDay =
                  i === 0 || dayLabel(messages[i - 1].created_at) !== dayLabel(m.created_at);
                return (
                  <React.Fragment key={m.id}>
                    {showDay && (
                      <p className="py-2 text-center text-[11px] font-medium text-muted-foreground">
                        {dayLabel(m.created_at)}
                      </p>
                    )}
                    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                      <div className={cn('max-w-[80%] space-y-1', mine && 'items-end')}>
                        <div
                          className={cn(
                            'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed',
                            mine
                              ? 'rounded-br-sm bg-primary text-primary-foreground'
                              : 'rounded-bl-sm bg-muted text-foreground'
                          )}
                        >
                          {m.body}
                        </div>
                        <p
                          className={cn(
                            'text-[10px] text-muted-foreground',
                            mine ? 'text-right' : 'text-left'
                          )}
                        >
                          {formatTime(m.created_at)}
                        </p>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
          </div>

          <form
            className="flex items-end gap-2 border-t border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends; Shift+Enter makes a new line.
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={1}
              maxLength={2000}
              placeholder={`Message ${active.peer.full_name.split(' ')[0]}…`}
              aria-label="Message"
              className="max-h-32 min-h-9 flex-1 resize-none py-2"
            />
            <Button type="submit" size="icon" disabled={!draft.trim() || sending} aria-label="Send message">
              {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
        </section>
      ) : (
        <section className="hidden items-center justify-center p-8 md:flex">
          <div className="max-w-xs text-center">
            <MessageSquare className="mx-auto mb-3 size-6 text-muted-foreground" />
            <p className="text-sm font-medium text-foreground">Pick a conversation</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Everyone who has accepted a request appears on the left.
            </p>
          </div>
        </section>
      )}
    </Card>
  );
}
