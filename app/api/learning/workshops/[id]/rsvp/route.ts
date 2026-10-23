import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad } from '@/lib/learning-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function seats(id: string) {
  const { count } = await createAdminClient().from('workshop_rsvps').select('user_id', { count: 'exact', head: true }).eq('workshop_id', id);
  return count ?? 0;
}

/**
 * Take a seat. The database trigger enforces capacity under a row lock, so two
 * students racing for the last seat cannot both get it.
 */
export async function POST(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['student']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const db = createAdminClient();
  const { data: ws } = await db.from('workshops').select('id, starts_at, duration_min, cancelled_at, room_path').eq('id', id).maybeSingle();
  if (!ws) return bad('Workshop not found', 404);
  if (ws.cancelled_at) return bad('This workshop was cancelled.', 409);
  if (new Date(ws.starts_at).getTime() + ws.duration_min * 60_000 < Date.now()) return bad('This workshop has ended.', 409);

  const { error } = await db.from('workshop_rsvps').insert({ workshop_id: id, user_id: auth.user.id });
  if (error) {
    if (error.code === '23505') return NextResponse.json({ attending: true, attendees: await seats(id), room_path: ws.room_path });
    if (error.message?.includes('workshop_full')) return bad('All seats are taken.', 409);
    if (error.message?.includes('workshop_cancelled')) return bad('This workshop was cancelled.', 409);
    return bad('Could not save your seat.', 500);
  }
  return NextResponse.json({ attending: true, attendees: await seats(id), room_path: ws.room_path }, { status: 201 });
}

/** Give the seat back. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['student']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const { error } = await createAdminClient().from('workshop_rsvps').delete().eq('workshop_id', id).eq('user_id', auth.user.id);
  if (error) return bad('Could not cancel your seat.', 500);
  return NextResponse.json({ attending: false, attendees: await seats(id) });
}
