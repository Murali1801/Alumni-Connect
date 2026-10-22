import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getOwnedCourse, isPermutation, positionsFor, touchCourse } from '@/lib/learning';
import { bad, readBody, reorderSchema } from '@/lib/learning-schemas';

export const dynamic = 'force-dynamic';

/**
 * Save a new order: `{ scope: 'modules', ids }` for the course's modules or
 * `{ scope: 'lessons', module_id, ids }` for one module's lessons. `ids` must be
 * the full set, so a stale editor cannot drop or duplicate rows.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!(await getOwnedCourse(id, auth.user.id))) return bad('Course not found', 404);
  const body = await readBody(request, reorderSchema, 'Could not read the new order.');
  if (!body.ok) return body.response;

  const db = createAdminClient();
  const table = body.data.scope === 'modules' ? 'course_modules' : 'course_lessons';
  let existing = db.from(table).select('id').eq('course_id', id);
  if (body.data.scope === 'lessons') existing = existing.eq('module_id', body.data.module_id);
  const { data } = await existing;
  if (!isPermutation(body.data.ids, (data ?? []).map((r) => r.id))) {
    return bad('The course changed in another tab. Reload and try again.', 409);
  }
  const results = await Promise.all(
    positionsFor(body.data.ids).map(({ id: rowId, position }) => db.from(table).update({ position }).eq('id', rowId))
  );
  if (results.some((r) => r.error)) return bad('Could not save the new order.', 500);
  await touchCourse(id);
  return NextResponse.json({ ok: true });
}
