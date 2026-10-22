import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { COMMENT_BODY_MAX, getComments } from '@/lib/posts';

export const dynamic = 'force-dynamic';

const commentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write a comment first.')
    .max(COMMENT_BODY_MAX, `Keep comments under ${COMMENT_BODY_MAX} characters.`),
  mentions: z.array(z.string().uuid()).max(20).default([]),
});

/** A post's comments, oldest first. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  return NextResponse.json({ comments: await getComments(id) });
}

/** Add a comment as the signed-in member. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body: z.infer<typeof commentSchema>;
  try {
    body = commentSchema.parse(await request.json());
  } catch (error: any) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : 'Check your comment.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: post } = await db.from('posts').select('id').eq('id', id).maybeSingle();
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  // Mentions: only real members the comment actually names.
  const { data: people } = body.mentions.length
    ? await db.from('users').select('id, full_name').in('id', body.mentions)
    : { data: [] as { id: string; full_name: string }[] };
  const mentions = (people ?? []).filter((p) => body.body.includes(`@${p.full_name}`)).map((p) => p.id);

  const { data, error } = await db
    .from('post_comments')
    .insert({ post_id: id, author_id: auth.user.id, body: body.body, mentions })
    .select('id, post_id, author_id, body, created_at')
    .single();
  if (error || !data) return NextResponse.json({ error: 'Could not add the comment.' }, { status: 500 });

  return NextResponse.json(
    { comment: { ...data, full_name: auth.user.full_name, role: auth.user.role } },
    { status: 201 }
  );
}
