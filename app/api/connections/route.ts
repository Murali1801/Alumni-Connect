import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const inviteSchema = z.object({
  user_id: z.string().uuid('Choose someone to connect with.'),
  message: z.string().trim().max(300, 'Keep the note under 300 characters.').optional(),
});

/**
 * Invite a member to connect. If they already invited the viewer, this accepts
 * that invitation instead of sending a second one.
 */
export async function POST(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;

  let body: z.infer<typeof inviteSchema>;
  try {
    body = inviteSchema.parse(await request.json());
  } catch (error: any) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : 'Check the invitation.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
  const me = auth.user.id;
  const them = body.user_id;
  if (them === me) return NextResponse.json({ error: 'You cannot connect with yourself.' }, { status: 400 });

  const db = createAdminClient();
  const { data: other } = await db.from('users').select('id, role').eq('id', them).maybeSingle();
  if (!other || other.role === 'admin') return NextResponse.json({ error: 'Member not found' }, { status: 404 });

  const { data: existing } = await db
    .from('connections')
    .select('id, requester_id, status')
    .or(`and(requester_id.eq.${me},addressee_id.eq.${them}),and(requester_id.eq.${them},addressee_id.eq.${me})`)
    .maybeSingle();

  if (existing) {
    if (existing.status === 'accepted') return NextResponse.json({ state: 'connected', id: existing.id });
    if (existing.requester_id === me) return NextResponse.json({ state: 'pending_out', id: existing.id });
    // They asked first: connecting back accepts, even if the viewer had ignored it.
    const { error } = await db
      .from('connections')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) return NextResponse.json({ error: 'Could not connect.' }, { status: 500 });
    return NextResponse.json({ state: 'connected', id: existing.id });
  }

  const { data, error } = await db
    .from('connections')
    .insert({ requester_id: me, addressee_id: them, message: body.message || null })
    .select('id')
    .single();
  if (error || !data) return NextResponse.json({ error: 'Could not send the invitation.' }, { status: 500 });
  return NextResponse.json({ state: 'pending_out', id: data.id }, { status: 201 });
}
