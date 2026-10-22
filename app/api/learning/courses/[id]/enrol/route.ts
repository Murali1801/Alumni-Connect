import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { bad } from '@/lib/learning-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Enrol in a published course. Enrolling twice is a no-op. */
export async function POST(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['student']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const db = createAdminClient();
  const { data: course } = await db.from('courses').select('id, published').eq('id', id).maybeSingle();
  if (!course || !course.published) return bad('Course not found', 404);
  const { error } = await db
    .from('course_enrolments')
    .upsert({ course_id: id, user_id: auth.user.id }, { onConflict: 'course_id,user_id', ignoreDuplicates: true });
  if (error) return bad('Could not enrol you.', 500);
  return NextResponse.json({ enrolled: true }, { status: 201 });
}

/** Leave a course. Progress goes with it, including a completion record. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['student']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const db = createAdminClient();
  await db.from('lesson_progress').delete().eq('course_id', id).eq('user_id', auth.user.id);
  const { error } = await db.from('course_enrolments').delete().eq('course_id', id).eq('user_id', auth.user.id);
  if (error) return bad('Could not remove the enrolment.', 500);
  return NextResponse.json({ enrolled: false });
}
