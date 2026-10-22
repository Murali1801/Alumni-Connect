import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Delete a comment. Its author can; so can an administrator. */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id, commentId } = await params;

  const db = createAdminClient();
  const { data: comment } = await db
    .from('post_comments')
    .select('id, author_id')
    .eq('id', commentId)
    .eq('post_id', id)
    .maybeSingle();
  if (!comment) return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
  if (comment.author_id !== auth.user.id && auth.user.role !== 'admin') {
    return NextResponse.json({ error: 'You can only delete your own comments.' }, { status: 403 });
  }

  const { error } = await db.from('post_comments').delete().eq('id', commentId);
  if (error) return NextResponse.json({ error: 'Could not delete the comment.' }, { status: 500 });
  return NextResponse.json({ success: true });
}
