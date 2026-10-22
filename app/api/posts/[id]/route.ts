import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { POST_IMAGE_BUCKET } from '@/lib/posts';

export const dynamic = 'force-dynamic';

/** Delete a post. Its author can; so can an administrator. Likes and comments go with it. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const db = createAdminClient();
  const { data: post } = await db.from('posts').select('id, author_id, image_path').eq('id', id).maybeSingle();
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  if (post.author_id !== auth.user.id && auth.user.role !== 'admin') {
    return NextResponse.json({ error: 'You can only delete your own posts.' }, { status: 403 });
  }

  const { error } = await db.from('posts').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not delete the post.' }, { status: 500 });
  if (post.image_path) await db.storage.from(POST_IMAGE_BUCKET).remove([post.image_path]);

  return NextResponse.json({ success: true });
}
