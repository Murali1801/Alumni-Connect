import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { listAllCalls, listCallsForUser, scheduleCall, updateCallStatus } from '@/lib/calls';

export const dynamic = 'force-dynamic';

const scheduleSchema = z.object({
  peer_id: z.string().uuid(),
  title: z.string().min(3).max(120),
  scheduled_at: z.string().min(10),
  duration_min: z.number().int().min(15).max(180).default(30),
  request_id: z.string().uuid().nullable().optional(),
  agenda: z.string().max(500).nullable().optional(),
});

const updateSchema = z.object({
  room_id: z.string().min(1),
  status: z.enum(['cancelled', 'completed']),
});

export async function GET() {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const calls =
    auth.user.role === 'admin' ? await listAllCalls() : await listCallsForUser(auth.user.id);
  return NextResponse.json(calls);
}

export async function POST(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;

  try {
    const body = scheduleSchema.parse(await request.json());

    const when = new Date(body.scheduled_at);
    if (Number.isNaN(when.getTime())) {
      return NextResponse.json({ error: 'That date and time could not be read.' }, { status: 400 });
    }

    const db = createAdminClient();
    const { data: peer } = await db
      .from('users')
      .select('id, full_name, role')
      .eq('id', body.peer_id)
      .maybeSingle();
    if (!peer) return NextResponse.json({ error: 'That person is not on the network.' }, { status: 404 });
    if (peer.id === auth.user.id) {
      return NextResponse.json({ error: 'You cannot schedule a session with yourself.' }, { status: 400 });
    }

    // A session must rest on an accepted request — that is the consent record.
    const { data: link } = await db
      .from('requests')
      .select('id, status')
      .or(
        `and(student_id.eq.${auth.user.id},alumni_id.eq.${peer.id}),and(student_id.eq.${peer.id},alumni_id.eq.${auth.user.id})`
      )
      .eq('status', 'accepted')
      .limit(1)
      .maybeSingle();

    if (!link) {
      return NextResponse.json(
        { error: 'You can only schedule a session with someone who has accepted a request.' },
        { status: 403 }
      );
    }

    const session = await scheduleCall({
      actorId: auth.user.id,
      hostId: auth.user.id,
      guestId: peer.id,
      hostName: auth.user.full_name,
      guestName: peer.full_name,
      title: body.title,
      scheduledAt: when.toISOString(),
      durationMin: body.duration_min,
      requestId: body.request_id ?? link.id,
      agenda: body.agenda ?? null,
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message ?? 'Could not schedule' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  try {
    const body = updateSchema.parse(await request.json());
    const updated = await updateCallStatus(body.room_id, auth.user.id, body.status);
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Could not update' }, { status: 400 });
  }
}
