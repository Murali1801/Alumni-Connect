import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { entrySchema } from '@/lib/profile-schemas';

export const dynamic = 'force-dynamic';

/** Replace one of your entries. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const parsed = entrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the entry.' }, { status: 400 });

  const e = parsed.data;
  const db = createAdminClient();
  const { data, error } = await db
    .from('member_experience')
    .update({
      kind: e.kind,
      title: e.title,
      organisation: e.organisation,
      location: e.location || null,
      start_date: e.start_date,
      end_date: e.end_date ?? null,
      description: e.description || null,
    })
    .eq('id', id)
    .eq('user_id', auth.user.id)
    .select('id');
  if (error) return NextResponse.json({ error: 'Could not save the entry.' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}

/** Delete one of your entries. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const db = createAdminClient();
  const { data, error } = await db.from('member_experience').delete().eq('id', id).eq('user_id', auth.user.id).select('id');
  if (error) return NextResponse.json({ error: 'Could not delete the entry.' }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
