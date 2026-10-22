import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { countUnread, describe, markRead } from '@/lib/notifications';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/**
 * `GET` → `{ unread }`, the badge count; with `?id=` also `{ item: { text, href, actor } }`
 * for one new notification, so a live toast can say what happened.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const id = new URL(request.url).searchParams.get('id');
  const unread = await countUnread(auth.user.id);
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ unread });

  const db = createAdminClient();
  const { data: n } = await db
    .from('notifications')
    .select('id, type, actor_id, post_id, data, actor:users!notifications_actor_id_fkey(full_name)')
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .maybeSingle();
  if (!n) return NextResponse.json({ unread });
  const role = auth.user.role === 'alumni' ? 'alumni' : 'student';
  const { text, href } = describe({ type: n.type, post_id: n.post_id, data: (n.data as any) ?? {} }, role, n.actor_id);
  const actor = Array.isArray(n.actor) ? n.actor[0] : n.actor;
  return NextResponse.json({ unread, item: { text, href, actor: (actor as any)?.full_name ?? null } });
}

const markSchema = z.object({ ids: z.array(z.string().uuid()).max(200).optional() });

/** Mark notifications read: `{ ids }`, or everything when ids is omitted. */
export async function PATCH(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const body = markSchema.safeParse(await request.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: 'Send ids as a list.' }, { status: 400 });
  await markRead(auth.user.id, body.data.ids);
  return NextResponse.json({ unread: await countUnread(auth.user.id) });
}
