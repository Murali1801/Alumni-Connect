'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

/**
 * The bell's unread count, kept live: Supabase realtime pushes each new
 * notification row (RLS lets members read only their own), and a slow poll
 * corrects the count if the socket drops. New ones also show a toast saying
 * what happened.
 */
export function useLiveNotifications(userId: string | undefined, initial: number) {
  const router = useRouter();
  const [unread, setUnread] = React.useState(initial);

  // A fresh server render (navigation) brings the authoritative count.
  React.useEffect(() => setUnread(initial), [initial]);

  React.useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let stopped = false;

    // The realtime socket starts with the anon key; until it carries the
    // member's token, RLS (own rows only) filters every event out.
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (stopped) return;
      if (session) await supabase.realtime.setAuth(session.access_token);
      channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        async (payload) => {
          setUnread((n) => n + 1);
          const id = (payload.new as { id?: string })?.id;
          if (!id) return;
          const res = await fetch(`/api/notifications?id=${id}`).catch(() => null);
          const body = res?.ok ? await res.json() : null;
          if (typeof body?.unread === 'number') setUnread(body.unread);
          if (body?.item) {
            toast(`${body.item.actor ?? 'Someone'} ${body.item.text}`, {
              action: { label: 'View', onClick: () => router.push(body.item.href) },
            });
          }
        }
      )
      .subscribe();
    })();

    const poll = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      const res = await fetch('/api/notifications').catch(() => null);
      const body = res?.ok ? await res.json() : null;
      if (typeof body?.unread === 'number') setUnread(body.unread);
    }, 60_000);

    return () => {
      stopped = true;
      clearInterval(poll);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId, router]);

  return unread;
}
