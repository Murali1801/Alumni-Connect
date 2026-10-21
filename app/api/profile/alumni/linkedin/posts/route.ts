import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { linkedinPostsSchema } from '@/lib/linkedin/schema';

export const dynamic = 'force-dynamic';

/** PostgREST reports an unknown table as PGRST205; Postgres as 42P01. */
function isMissingTable(error: { code?: string } | null) {
  return error?.code === 'PGRST205' || error?.code === '42P01';
}

const MIGRATION_HINT = 'The database has no alumni_posts table yet. Apply supabase/migrations/0003_alumni_posts.sql.';

/**
 * Publish the posts and articles the alumnus ticked on the review screen.
 * The archive never reaches the server; this receives only the validated
 * items. Importing the same archive again updates posts rather than
 * duplicating them (unique on user_id + external_id).
 */
export async function POST(request: Request) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;

  let payload;
  try {
    payload = linkedinPostsSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? `${error.issues[0]?.path.join('.') || 'body'}: ${error.issues[0]?.message}`
        : 'Invalid request body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const importedAt = new Date().toISOString();
  const rows = payload.posts.map((p) => ({
    ...p,
    user_id: auth.user.id,
    source: 'linkedin_export',
    imported_at: importedAt,
  }));

  // The user's own client, so the "alumni insert their own posts" policy applies.
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('alumni_posts')
    .upsert(rows, { onConflict: 'user_id,external_id' })
    .select('id');

  if (isMissingTable(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await supabase.from('engagement_events').insert({
    user_id: auth.user.id,
    event_type: 'linkedin_posts_imported',
    metadata: {
      posts: payload.posts.filter((p) => p.kind === 'post').length,
      articles: payload.posts.filter((p) => p.kind === 'article').length,
    },
  });

  return NextResponse.json({ success: true, count: data?.length ?? 0 });
}

/** Remove every post this alumnus imported from LinkedIn. */
export async function DELETE() {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('alumni_posts')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('source', 'linkedin_export')
    .select('id');

  if (isMissingTable(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true, count: data?.length ?? 0 });
}
