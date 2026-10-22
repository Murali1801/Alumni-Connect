import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOwnedCourse, touchCourse } from '@/lib/learning';
import { bad, moduleSchema, readBody } from '@/lib/learning-schemas';

export const dynamic = 'force-dynamic';

/** Add a module at the end of the course. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!(await getOwnedCourse(id, auth.user.id))) return bad('Course not found', 404);
  const body = await readBody(request, moduleSchema, 'Name the module.');
  if (!body.ok) return body.response;

  const db = createAdminClient();
  const { data: last } = await db
    .from('course_modules')
    .select('position')
    .eq('course_id', id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data, error } = await db
    .from('course_modules')
    .insert({ course_id: id, title: body.data.title, position: (last?.position ?? -1) + 1 })
    .select('id, title, position')
    .single();
  if (error || !data) return bad('Could not add the module.', 500);
  await touchCourse(id);
  return NextResponse.json({ module: { ...data, lessons: [] } }, { status: 201 });
}
