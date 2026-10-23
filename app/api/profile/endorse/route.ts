import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const schema = z.object({ user_id: z.string().uuid(), skill: z.string().trim().min(1).max(60) });

/** The skill as the member lists it, or null if they do not list it. */
async function listedSkill(userId: string, skill: string): Promise<string | null> {
  const db = createAdminClient();
  const [{ data: a }, { data: s }] = await Promise.all([
    db.from('alumni_profiles').select('skills').eq('user_id', userId).maybeSingle(),
    db.from('student_profiles').select('skills').eq('user_id', userId).maybeSingle(),
  ]);
  const all: string[] = [...(a?.skills ?? []), ...(s?.skills ?? [])];
  return all.find((x) => x.toLowerCase() === skill.toLowerCase()) ?? null;
}

async function countFor(userId: string, skill: string) {
  const db = createAdminClient();
  const { count } = await db.from('skill_endorsements').select('endorser_id', { count: 'exact', head: true }).eq('endorsee_id', userId).ilike('skill', skill);
  return count ?? 0;
}

/** Endorse another member for a skill they list. */
export async function POST(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a skill to endorse.' }, { status: 400 });
  const { user_id, skill } = parsed.data;
  if (user_id === auth.user.id) return NextResponse.json({ error: 'You cannot endorse yourself.' }, { status: 400 });

  const listed = await listedSkill(user_id, skill);
  if (!listed) return NextResponse.json({ error: 'They do not list that skill.' }, { status: 404 });

  const db = createAdminClient();
  const { error } = await db
    .from('skill_endorsements')
    .upsert({ endorsee_id: user_id, skill: listed.toLowerCase(), endorser_id: auth.user.id }, { onConflict: 'endorsee_id,skill,endorser_id', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: 'Could not save the endorsement.' }, { status: 500 });
  return NextResponse.json({ endorsed: true, count: await countFor(user_id, listed) });
}

/** Take back your endorsement. */
export async function DELETE(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Choose a skill.' }, { status: 400 });
  const { user_id, skill } = parsed.data;
  const db = createAdminClient();
  await db.from('skill_endorsements').delete().eq('endorsee_id', user_id).eq('endorser_id', auth.user.id).ilike('skill', skill);
  return NextResponse.json({ endorsed: false, count: await countFor(user_id, skill) });
}
