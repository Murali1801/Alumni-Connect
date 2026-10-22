import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

async function likeCount(postId: string) {
  const db = createAdminClient();
  const { count } = await db.from('post_likes').select('post_id', { count: 'exact', head: true }).eq('post_id', postId);
  return count ?? 0;
}

/** Like a post. Liking twice is a no-op. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const db = createAdminClient();
  const { data: post } = await db.from('posts').select('id').eq('id', id).maybeSingle();
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const { error } = await db
    .from('post_likes')
    .upsert({ post_id: id, user_id: auth.user.id }, { onConflict: 'post_id,user_id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: 'Could not like the post.' }, { status: 500 });

  return NextResponse.json({ liked: true, like_count: await likeCount(id) });
}

/** Take a like back. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const db = createAdminClient();
  const { error } = await db.from('post_likes').delete().eq('post_id', id).eq('user_id', auth.user.id);
  if (error) return NextResponse.json({ error: 'Could not remove the like.' }, { status: 500 });

  return NextResponse.json({ liked: false, like_count: await likeCount(id) });
}
