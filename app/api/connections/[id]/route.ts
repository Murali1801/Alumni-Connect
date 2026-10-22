import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const answerSchema = z.object({ action: z.enum(['accept', 'ignore']) });

async function load(id: string) {
  const db = createAdminClient();
  const { data } = await db.from('connections').select('id, requester_id, addressee_id, status').eq('id', id).maybeSingle();
  return data;
}

/** Accept or ignore an invitation. Only the person invited can answer. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body: z.infer<typeof answerSchema>;
  try {
    body = answerSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Choose accept or ignore.' }, { status: 400 });
  }

  const row = await load(id);
  if (!row || row.addressee_id !== auth.user.id) return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
  if (row.status === 'accepted') return NextResponse.json({ state: 'connected' });

  const db = createAdminClient();
  const { error } = await db
    .from('connections')
    .update({ status: body.action === 'accept' ? 'accepted' : 'ignored', responded_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not answer the invitation.' }, { status: 500 });
  return NextResponse.json({ state: body.action === 'accept' ? 'connected' : 'none' });
}

/** Withdraw an invitation you sent, or remove a connection from either side. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const row = await load(id);
  const me = auth.user.id;
  const mine = row && (row.requester_id === me || (row.addressee_id === me && row.status === 'accepted'));
  if (!row || !mine) return NextResponse.json({ error: 'Connection not found' }, { status: 404 });

  const db = createAdminClient();
  const { error } = await db.from('connections').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not remove the connection.' }, { status: 500 });
  return NextResponse.json({ state: 'none' });
}
