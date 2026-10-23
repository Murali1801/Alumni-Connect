import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getInterview } from '@/lib/interviews';
import { firstIssue, updateInterviewSchema } from '@/lib/interview-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['student', 'alumni', 'admin']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const hit = await getInterview(id, auth.user);
  if (!hit) return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
  return NextResponse.json({ ...hit.interview, viewer: hit.viewer });
}

/** The owner edits the pipeline, records a decision, releases it, or cancels. */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body;
  try {
    body = updateInterviewSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: firstIssue(error) }, { status: 400 });
  }

  const hit = await getInterview(id, auth.user);
  if (!hit || hit.viewer !== 'owner') return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
  const current = hit.interview;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { updated_at: now };
  if (body.title !== undefined) patch.title = body.title;
  if (body.company !== undefined) patch.company = body.company || null;
  if (body.description !== undefined) patch.description = body.description || null;
  if (body.decision !== undefined) {
    if (current.decision_released_at && body.decision !== current.decision) {
      return NextResponse.json({ error: 'The decision has already been shared with the candidate.' }, { status: 409 });
    }
    patch.decision = body.decision;
  }
  if (body.decision_note !== undefined) patch.decision_note = body.decision_note || null;
  if (body.release_decision) {
    const decision = body.decision ?? current.decision;
    if (decision === 'pending') {
      return NextResponse.json({ error: 'Record a decision before sharing it.' }, { status: 400 });
    }
    if (!current.decision_released_at) patch.decision_released_at = now;
  }

  const db = createAdminClient();
  if (body.status === 'cancelled' && current.status !== 'cancelled') {
    patch.status = 'cancelled';
    // Withdrawing the pipeline takes its upcoming rounds off the calendar.
    await db
      .from('interview_rounds')
      .update({ status: 'cancelled', updated_at: now })
      .eq('interview_id', id)
      .eq('status', 'scheduled');
  } else if (body.status === 'active' && current.status === 'cancelled') {
    patch.status = 'active';
  }

  const { error } = await db.from('interviews').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not update the interview.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const hit = await getInterview(id, auth.user);
  if (!hit || hit.viewer !== 'owner') return NextResponse.json({ error: 'Interview not found' }, { status: 404 });

  const db = createAdminClient();
  const { error } = await db.from('interviews').delete().eq('id', id);
  if (error) return NextResponse.json({ error: 'Could not delete the interview.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
