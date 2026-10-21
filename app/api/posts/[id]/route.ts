import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Delete one post. Row level security decides who may: the author, or an
 * administrator taking a post down. Anyone else deletes nothing and gets 404.
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Post not found' }, { status: 404 });

  const supabase = await createClient();
  const { data, error } = await supabase.from('alumni_posts').delete().eq('id', id).select('id');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
