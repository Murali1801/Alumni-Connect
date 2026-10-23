import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOwnedCourse, touchCourse } from '@/lib/learning';
import { bad, moduleSchema, readBody } from '@/lib/learning-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** The module when the caller wrote its course. */
async function ownedModule(id: string, userId: string) {
  const { data } = await createAdminClient().from('course_modules').select('id, course_id').eq('id', id).maybeSingle();
  if (!data || !(await getOwnedCourse(data.course_id, userId))) return null;
  return data;
}

/** Rename a module. */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const mod = await ownedModule(id, auth.user.id);
  if (!mod) return bad('Module not found', 404);
  const body = await readBody(request, moduleSchema, 'Name the module.');
  if (!body.ok) return body.response;
  const { error } = await createAdminClient().from('course_modules').update({ title: body.data.title }).eq('id', id);
  if (error) return bad('Could not rename the module.', 500);
  await touchCourse(mod.course_id);
  return NextResponse.json({ ok: true });
}

/** Delete a module and its lessons (learners' progress on them goes too). */
export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const mod = await ownedModule(id, auth.user.id);
  if (!mod) return bad('Module not found', 404);
  const { error } = await createAdminClient().from('course_modules').delete().eq('id', id);
  if (error) return bad('Could not delete the module.', 500);
  await touchCourse(mod.course_id);
  return NextResponse.json({ ok: true });
}
