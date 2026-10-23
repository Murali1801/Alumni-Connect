import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOwnedCourse, touchCourse } from '@/lib/learning';
import { bad, lessonSchema, readBody } from '@/lib/learning-schemas';

export const dynamic = 'force-dynamic';

const LESSON_COLUMNS = 'id, module_id, title, kind, position, body, url, quiz, duration_min';

/** Add a lesson at the end of a module. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const db = createAdminClient();
  const { data: mod } = await db.from('course_modules').select('id, course_id').eq('id', id).maybeSingle();
  if (!mod || !(await getOwnedCourse(mod.course_id, auth.user.id))) return bad('Module not found', 404);
  const body = await readBody(request, lessonSchema, 'Check the lesson.');
  if (!body.ok) return body.response;

  const { data: last } = await db
    .from('course_lessons')
    .select('position')
    .eq('module_id', id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const l = body.data;
  const { data, error } = await db
    .from('course_lessons')
    .insert({
      module_id: id,
      course_id: mod.course_id,
      title: l.title,
      kind: l.kind,
      // Only what the kind uses is kept, so switching kinds later leaves no stale answers.
      body: l.body,
      url: l.kind === 'video' || l.kind === 'link' ? (l.url ?? null) : null,
      quiz: l.kind === 'quiz' ? l.quiz : [],
      duration_min: l.duration_min,
      position: (last?.position ?? -1) + 1,
    })
    .select(LESSON_COLUMNS)
    .single();
  if (error || !data) return bad('Could not add the lesson.', 500);
  await touchCourse(mod.course_id);
  return NextResponse.json({ lesson: data }, { status: 201 });
}
