import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLesson, touchCourse } from '@/lib/learning';
import { bad, lessonPatchSchema, lessonProblem, readBody } from '@/lib/learning-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

const LESSON_COLUMNS = 'id, module_id, title, kind, position, body, url, quiz, duration_min';

/** Edit a lesson. The merged result must still be a complete lesson of its kind. */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const lesson = await getLesson(id);
  if (!lesson || lesson.course?.author_id !== auth.user.id) return bad('Lesson not found', 404);
  const body = await readBody(request, lessonPatchSchema, 'Check the lesson.');
  if (!body.ok) return body.response;

  const merged = {
    title: body.data.title ?? lesson.title,
    kind: body.data.kind ?? lesson.kind,
    body: body.data.body ?? lesson.body,
    url: body.data.url !== undefined ? body.data.url : lesson.url,
    quiz: body.data.quiz ?? (Array.isArray(lesson.quiz) ? lesson.quiz : []),
    duration_min: body.data.duration_min ?? lesson.duration_min,
  };
  const problem = lessonProblem(merged);
  if (problem) return bad(problem);

  const db = createAdminClient();
  const { data, error } = await db
    .from('course_lessons')
    .update({
      ...merged,
      url: merged.kind === 'video' || merged.kind === 'link' ? merged.url : null,
      quiz: merged.kind === 'quiz' ? merged.quiz : [],
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(LESSON_COLUMNS)
    .single();
  if (error || !data) return bad('Could not save the lesson.', 500);
  await touchCourse(lesson.course_id);
  return NextResponse.json({ lesson: data });
}

/** Delete a lesson and learners' progress on it. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const lesson = await getLesson(id);
  if (!lesson || lesson.course?.author_id !== auth.user.id) return bad('Lesson not found', 404);
  const { error } = await createAdminClient().from('course_lessons').delete().eq('id', id);
  if (error) return bad('Could not delete the lesson.', 500);
  await touchCourse(lesson.course_id);
  return NextResponse.json({ ok: true });
}
