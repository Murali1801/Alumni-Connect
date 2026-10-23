import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  canRelease,
  canRespond,
  canSetOutcome,
  canTransition,
  getInterview,
  getRoundRow,
  syncPipelineStatus,
} from '@/lib/interviews';
import {
  candidateRoundUpdateSchema,
  firstIssue,
  normalizeContent,
  staffRoundUpdateSchema,
} from '@/lib/interview-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; roundId: string }> };

/**
 * Staff (the owner, or the round's interviewer) move a round along: schedule,
 * status, outcome, content, release. The candidate answers the invitation:
 * accept, or ask for another time.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;
  const { id, roundId } = await params;

  const hit = await getInterview(id, auth.user);
  const round = hit ? await getRoundRow(id, roundId) : null;
  if (!hit || !round) return NextResponse.json({ error: 'Round not found' }, { status: 404 });

  const db = createAdminClient();
  const now = new Date().toISOString();
  const raw = await request.json().catch(() => ({}));

  if (hit.viewer === 'candidate') {
    let body;
    try {
      body = candidateRoundUpdateSchema.parse(raw);
    } catch (error) {
      return NextResponse.json({ error: firstIssue(error) }, { status: 400 });
    }
    if (!canRespond(round.status, round.candidate_response, body.response)) {
      return NextResponse.json({ error: 'This round can no longer be changed.' }, { status: 409 });
    }
    if (body.response === 'reschedule_requested' && !body.note?.trim()) {
      return NextResponse.json({ error: 'Suggest a time that works for you.' }, { status: 400 });
    }
    const { error } = await db
      .from('interview_rounds')
      .update({
        candidate_response: body.response,
        reschedule_note: body.response === 'reschedule_requested' ? body.note!.trim() : null,
        updated_at: now,
      })
      .eq('id', roundId);
    if (error) return NextResponse.json({ error: 'Could not save your answer.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  const isStaff = hit.viewer === 'owner' || (hit.viewer === 'panel' && round.interviewer_id === auth.user.id);
  if (!isStaff) return NextResponse.json({ error: 'Only the interviewers can change this round.' }, { status: 403 });

  let body;
  try {
    body = staffRoundUpdateSchema.parse(raw);
  } catch (error) {
    return NextResponse.json({ error: firstIssue(error) }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: now };
  let status = round.status;
  let outcome = round.outcome;

  if (body.title !== undefined) patch.title = body.title;
  if (body.duration_min !== undefined) patch.duration_min = body.duration_min;
  if (body.proctored !== undefined) {
    if (round.status !== 'scheduled') {
      return NextResponse.json({ error: 'Proctoring can only be changed before the round starts.' }, { status: 409 });
    }
    patch.proctored = body.proctored;
  }
  if (body.content !== undefined) {
    if (round.status !== 'scheduled') {
      return NextResponse.json({ error: 'Questions can only be edited before the round starts.' }, { status: 409 });
    }
    try {
      patch.content = normalizeContent(round.kind, body.content);
    } catch (error) {
      return NextResponse.json({ error: firstIssue(error, 'Check the questions.') }, { status: 400 });
    }
  }

  if (body.scheduled_at !== undefined) {
    if (round.status === 'completed' || round.status === 'in_progress') {
      return NextResponse.json({ error: 'A round that has started cannot be rescheduled.' }, { status: 409 });
    }
    patch.scheduled_at = new Date(body.scheduled_at).toISOString();
    // A new time is a new invitation: the candidate answers again.
    patch.candidate_response = 'pending';
    patch.reschedule_note = null;
    if (round.status !== 'scheduled' && body.status === undefined) status = 'scheduled';
  }

  if (body.status !== undefined) {
    if (!canTransition(round.status, body.status)) {
      return NextResponse.json({ error: `A ${round.status.replace('_', ' ')} round cannot be marked ${body.status.replace('_', ' ')}.` }, { status: 409 });
    }
    status = body.status;
  }
  if (status !== round.status) {
    patch.status = status;
    if (status === 'in_progress' && !round.started_at) patch.started_at = now;
    if ((status === 'completed' || status === 'no_show') && !round.ended_at) patch.ended_at = now;
    if (status === 'scheduled') {
      if (round.released_at) {
        return NextResponse.json({ error: 'The result has already been shared; add a new round instead.' }, { status: 409 });
      }
      patch.ended_at = null;
      patch.outcome = 'pending';
      outcome = 'pending';
    }
  }

  if (body.outcome !== undefined) {
    if (round.released_at && body.outcome !== round.outcome) {
      return NextResponse.json({ error: 'The result has already been shared with the candidate.' }, { status: 409 });
    }
    if (!canSetOutcome(status, body.outcome)) {
      return NextResponse.json({ error: 'Finish the round before recording a result.' }, { status: 409 });
    }
    patch.outcome = body.outcome;
    outcome = body.outcome;
  }

  if (body.release) {
    if (!canRelease(status, outcome)) {
      return NextResponse.json({ error: 'Record a pass or fail before sharing the result.' }, { status: 409 });
    }
    if (!round.released_at) patch.released_at = now;
  }

  const { error } = await db.from('interview_rounds').update(patch).eq('id', roundId);
  if (error) return NextResponse.json({ error: 'Could not update the round.' }, { status: 500 });
  await syncPipelineStatus(id);
  return NextResponse.json({ ok: true });
}

/** The owner removes a round that has not happened. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id, roundId } = await params;

  const hit = await getInterview(id, auth.user);
  const round = hit ? await getRoundRow(id, roundId) : null;
  if (!hit || hit.viewer !== 'owner' || !round) return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  if (round.status === 'completed' || round.status === 'in_progress') {
    return NextResponse.json({ error: 'A round that has started is part of the record; cancel it instead.' }, { status: 409 });
  }
  if (hit.interview.rounds.length <= 1) {
    return NextResponse.json({ error: 'An interview needs at least one round.' }, { status: 409 });
  }

  const db = createAdminClient();
  const { error } = await db.from('interview_rounds').delete().eq('id', roundId);
  if (error) return NextResponse.json({ error: 'Could not remove the round.' }, { status: 500 });
  await syncPipelineStatus(id);
  return NextResponse.json({ ok: true });
}
