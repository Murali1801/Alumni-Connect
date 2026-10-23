import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOwnedCourse, listWorkshops } from '@/lib/learning';
import { bad, readBody, workshopSchema } from '@/lib/learning-schemas';

export const dynamic = 'force-dynamic';

/** Upcoming workshops; `?mine=1` lists an alumnus's own, with attendees. */
export async function GET(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const mine = new URL(request.url).searchParams.get('mine') === '1' && auth.user.role === 'alumni';
  const workshops = await listWorkshops({ viewerId: auth.user.id, hostId: mine ? auth.user.id : undefined });
  return NextResponse.json({ workshops });
}

/** Schedule a live workshop, optionally tied to one of the host's courses. */
export async function POST(request: Request) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const body = await readBody(request, workshopSchema, 'Check the workshop details.');
  if (!body.ok) return body.response;
  const w = body.data;
  if (new Date(w.starts_at).getTime() < Date.now() - 5 * 60_000) return bad('Pick a time in the future.');
  if (w.course_id && !(await getOwnedCourse(w.course_id, auth.user.id))) return bad('Link one of your own courses.');

  const { data, error } = await createAdminClient()
    .from('workshops')
    .insert({ ...w, starts_at: new Date(w.starts_at).toISOString(), room_path: w.room_path ?? null, course_id: w.course_id ?? null, host_id: auth.user.id })
    .select('id')
    .single();
  if (error || !data) return bad('Could not schedule the workshop.', 500);
  return NextResponse.json({ id: data.id }, { status: 201 });
}
