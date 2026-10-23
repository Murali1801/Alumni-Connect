import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMemberCards } from '@/lib/network';

export const dynamic = 'force-dynamic';

/**
 * Members by name, for @mention suggestions: `?q=` (2+ characters), at most 8,
 * students and alumni only. Returns cards, never contact details.
 */
export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams.get('q')?.replace(/[%,()_]/g, ' ').trim() ?? '';
  if (q.length < 2) return NextResponse.json({ members: [] });

  const db = createAdminClient();
  const { data } = await db
    .from('users')
    .select('id')
    .in('role', ['student', 'alumni'])
    .neq('id', auth.user.id)
    .ilike('full_name', `%${q}%`)
    .limit(8);
  const members = await getMemberCards((data ?? []).map((u) => u.id));
  return NextResponse.json({ members: members.map(({ id, full_name, headline, avatar_url, role }) => ({ id, full_name, headline, avatar_url, role })) });
}
