import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({ is_open: z.boolean() });

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(['alumni', 'admin']);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const db = createAdminClient();

  const { data: existing } = await db
    .from('opportunities')
    .select('id, posted_by')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: 'Posting not found' }, { status: 404 });

  // Alumni may only touch their own postings; admins may touch any.
  if (auth.user.role !== 'admin' && existing.posted_by !== auth.user.id) {
    return NextResponse.json({ error: 'This is not your posting' }, { status: 403 });
  }

  try {
    const body = patchSchema.parse(await request.json());
    const { error } = await db.from('opportunities').update({ is_open: body.is_open }).eq('id', id);
    if (error) throw error;

    if (auth.user.role === 'admin') {
      await db.from('audit_log').insert({
        actor_id: auth.user.id,
        action: body.is_open ? 'reopen_opportunity' : 'close_opportunity',
        target_type: 'opportunities',
        target_id: id,
        detail: {},
      });
    }

    return NextResponse.json({ success: true, is_open: body.is_open });
  } catch (error: any) {
    return NextResponse.json({ error: error.message ?? 'Could not update' }, { status: 400 });
  }
}
