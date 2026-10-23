import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { entrySchema } from '@/lib/profile-schemas';

export const dynamic = 'force-dynamic';

/** Add a work or education entry to your own profile. */
export async function POST(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const parsed = entrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the entry.' }, { status: 400 });

  const db = createAdminClient();
  const { count } = await db.from('member_experience').select('id', { count: 'exact', head: true }).eq('user_id', auth.user.id);
  if ((count ?? 0) >= 50) return NextResponse.json({ error: 'You can keep up to 50 entries.' }, { status: 400 });

  const e = parsed.data;
  const { data, error } = await db
    .from('member_experience')
    .insert({
      user_id: auth.user.id,
      kind: e.kind,
      title: e.title,
      organisation: e.organisation,
      location: e.location || null,
      start_date: e.start_date,
      end_date: e.end_date ?? null,
      description: e.description || null,
    })
    .select('id')
    .single();
  if (error || !data) return NextResponse.json({ error: 'Could not add the entry.' }, { status: 500 });
  return NextResponse.json({ id: data.id }, { status: 201 });
}
