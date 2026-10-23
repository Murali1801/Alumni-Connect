import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { getLesson, isEnrolled, recordView, setLessonDone, submitQuiz, syncEnrolment } from '@/lib/learning';
import { bad, progressSchema, readBody } from '@/lib/learning-schemas';

export const dynamic = 'force-dynamic';

/**
 * A learner's step through a lesson:
 *   { action: 'view' }                  — opened it; resume here next time
 *   { action: 'complete', done?: bool } — finished (or un-finished) a non-quiz lesson
 *   { action: 'quiz', answers: [i...] } — submitted a quiz; scored here, never in the browser
 * Responds with the course progress and, for a quiz, the marked attempt.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(['student']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const lesson = await getLesson(id);
  if (!lesson) return bad('Lesson not found', 404);
  if (!(await isEnrolled(lesson.course_id, auth.user.id))) return bad('Enrol in the course first.', 403);
  const body = await readBody(request, progressSchema, 'Could not read that.');
  if (!body.ok) return body.response;
  const me = auth.user.id;

  if (body.data.action === 'view') {
    await recordView(me, lesson);
    return NextResponse.json({ ok: true });
  }

  if (body.data.action === 'complete') {
    if (lesson.kind === 'quiz') return bad('Submit the quiz to complete it.');
    await setLessonDone(me, lesson, body.data.done ?? true);
    await recordView(me, lesson);
    return NextResponse.json({ progress: await syncEnrolment(me, lesson.course_id) });
  }

  if (lesson.kind !== 'quiz') return bad('This lesson has no quiz.');
  const quiz = await submitQuiz(me, lesson, body.data.answers);
  await recordView(me, lesson);
  return NextResponse.json({ quiz, progress: await syncEnrolment(me, lesson.course_id) });
}
