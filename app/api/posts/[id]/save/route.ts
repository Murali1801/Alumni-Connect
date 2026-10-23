import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Save a post to read later. Saving twice is a no-op. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const db = createAdminClient();
  const { data: post } = await db.from('posts').select('id').eq('id', id).maybeSingle();
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const { error } = await db
    .from('saved_posts')
    .upsert({ user_id: auth.user.id, post_id: id }, { onConflict: 'user_id,post_id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: 'Could not save the post.' }, { status: 500 });
  return NextResponse.json({ saved: true });
}

/** Remove a post from saved items. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const db = createAdminClient();
  const { error } = await db.from('saved_posts').delete().eq('user_id', auth.user.id).eq('post_id', id);
  if (error) return NextResponse.json({ error: 'Could not unsave the post.' }, { status: 500 });
  return NextResponse.json({ saved: false });
}
