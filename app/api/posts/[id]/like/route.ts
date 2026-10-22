import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { REACTIONS, type Reaction } from '@/lib/posts';

export const dynamic = 'force-dynamic';

async function counts(postId: string) {
  const db = createAdminClient();
  const { data } = await db.from('post_likes').select('reaction').eq('post_id', postId).limit(5000);
  const byReaction: Partial<Record<Reaction, number>> = {};
  for (const r of data ?? []) byReaction[r.reaction as Reaction] = (byReaction[r.reaction as Reaction] ?? 0) + 1;
  return { like_count: data?.length ?? 0, reaction_counts: byReaction };
}

/** React to a post (`{ reaction }`, default like). Reacting again changes the reaction. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const reaction: Reaction = REACTIONS.includes(body?.reaction) ? body.reaction : 'like';

  const db = createAdminClient();
  const { data: post } = await db.from('posts').select('id').eq('id', id).maybeSingle();
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const { error } = await db
    .from('post_likes')
    .upsert({ post_id: id, user_id: auth.user.id, reaction }, { onConflict: 'post_id,user_id' });
  if (error) return NextResponse.json({ error: 'Could not react to the post.' }, { status: 500 });

  return NextResponse.json({ my_reaction: reaction, ...(await counts(id)) });
}

/** Take a reaction back. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const db = createAdminClient();
  const { error } = await db.from('post_likes').delete().eq('post_id', id).eq('user_id', auth.user.id);
  if (error) return NextResponse.json({ error: 'Could not remove the reaction.' }, { status: 500 });

  return NextResponse.json({ my_reaction: null, ...(await counts(id)) });
}
