import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

/** Same normalisation the ingest used, so "TCS Ltd." and "TCS ltd" collapse. */
function canonicalise(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(pvt|private|ltd|limited|inc|llp|llc|co|company|corp|corporation)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  const q = new URL(request.url).searchParams.get('q')?.trim() ?? '';
  const db = createAdminClient();

  let query = db.from('companies').select('id, name, industry').order('name');
  query = q ? query.ilike('name', `%${q.replace(/[%,()]/g, ' ')}%`).limit(30) : query.limit(30);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

const createSchema = z.object({ name: z.string().min(2).max(120) });

export async function POST(request: Request) {
  const auth = await requireApiUser(['alumni', 'admin']);
  if (!auth.ok) return auth.response;

  try {
    const { name } = createSchema.parse(await request.json());
    const canonical = canonicalise(name);
    if (!canonical) {
      return NextResponse.json({ error: 'That name has no usable characters.' }, { status: 400 });
    }

    const db = createAdminClient();

    // Reuse an existing employer rather than creating a near-duplicate.
    const { data: existing } = await db
      .from('companies')
      .select('id, name')
      .eq('name_canonical', canonical)
      .maybeSingle();
    if (existing) return NextResponse.json(existing);

    const { data, error } = await db
      .from('companies')
      .insert({ name: name.trim(), name_canonical: canonical })
      .select('id, name')
      .single();
    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid name' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message ?? 'Could not add the company' }, { status: 400 });
  }
}
