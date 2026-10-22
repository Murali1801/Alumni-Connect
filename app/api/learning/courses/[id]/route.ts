import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCourseForEditor, getCourseForLearner, getOwnedCourse } from '@/lib/learning';
import { bad, coursePatchSchema, readBody } from '@/lib/learning-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** The learner view for students; the full editor view for the author. */
export async function GET(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const data =
    auth.user.role === 'alumni' ? await getCourseForEditor(id, auth.user.id) : await getCourseForLearner(id, auth.user.id);
  if (!data) return bad('Course not found', 404);
  return NextResponse.json(data);
}

/** Edit the course details, or publish / unpublish it. */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const course = await getOwnedCourse(id, auth.user.id);
  if (!course) return bad('Course not found', 404);
  const body = await readBody(request, coursePatchSchema, 'Check the course details.');
  if (!body.ok) return body.response;

  const db = createAdminClient();
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { ...body.data, updated_at: now };
  if (body.data.published === true && !course.published) {
    const { count } = await db.from('course_lessons').select('id', { count: 'exact', head: true }).eq('course_id', id);
    if (!count) return bad('Add at least one lesson before publishing.');
    update.published_at = course.published_at ?? now;
  }
  const { error } = await db.from('courses').update(update).eq('id', id);
  if (error) return bad('Could not save the course.', 500);
  return NextResponse.json({ ok: true, published: body.data.published ?? course.published });
}

/** Delete a course with its modules, lessons, enrolments and progress. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!(await getOwnedCourse(id, auth.user.id))) return bad('Course not found', 404);
  const { error } = await createAdminClient().from('courses').delete().eq('id', id);
  if (error) return bad('Could not delete the course.', 500);
  return NextResponse.json({ ok: true });
}
