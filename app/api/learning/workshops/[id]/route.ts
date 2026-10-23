import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOwnedCourse } from '@/lib/learning';
import { bad, readBody, workshopPatchSchema } from '@/lib/learning-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

async function ownedWorkshop(id: string, hostId: string) {
  const { data } = await createAdminClient().from('workshops').select('id, host_id, capacity, cancelled_at').eq('id', id).maybeSingle();
  return data && data.host_id === hostId ? data : null;
}

/** Edit a workshop, or cancel / reinstate it with `{ cancelled }`. */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const ws = await ownedWorkshop(id, auth.user.id);
  if (!ws) return bad('Workshop not found', 404);
  const body = await readBody(request, workshopPatchSchema, 'Check the workshop details.');
  if (!body.ok) return body.response;
  const { cancelled, ...fields } = body.data;
  if (fields.course_id && !(await getOwnedCourse(fields.course_id, auth.user.id))) return bad('Link one of your own courses.');

  const db = createAdminClient();
  if (fields.capacity !== undefined) {
    const { count } = await db.from('workshop_rsvps').select('user_id', { count: 'exact', head: true }).eq('workshop_id', id);
    if ((count ?? 0) > fields.capacity) return bad(`${count} people already have a seat; capacity cannot go below that.`);
  }
  const update: Record<string, unknown> = { ...fields };
  if (fields.starts_at) update.starts_at = new Date(fields.starts_at).toISOString();
  if (cancelled !== undefined) update.cancelled_at = cancelled ? (ws.cancelled_at ?? new Date().toISOString()) : null;
  const { error } = await db.from('workshops').update(update).eq('id', id);
  if (error) return bad('Could not save the workshop.', 500);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!(await ownedWorkshop(id, auth.user.id))) return bad('Workshop not found', 404);
  const { error } = await createAdminClient().from('workshops').delete().eq('id', id);
  if (error) return bad('Could not delete the workshop.', 500);
  return NextResponse.json({ ok: true });
}
