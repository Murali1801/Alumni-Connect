import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  candidateCanJoin,
  getInterview,
  getRoundRow,
  getSubmissions,
  markRoundStarted,
  scoreMcq,
  syncPipelineStatus,
  type McqQuestion,
} from '@/lib/interviews';
import { firstIssue, submissionSchema } from '@/lib/interview-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string; roundId: string }> };

/** The candidate's work so far — their own draft, or for staff the live copy. */
export async function GET(_request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['student', 'alumni', 'admin']);
  if (!auth.ok) return auth.response;
  const { id, roundId } = await params;
  const hit = await getInterview(id, auth.user);
  if (!hit || !hit.interview.rounds.some((r) => r.id === roundId)) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  }
  const [submission] = await getSubmissions([roundId]);
  if (!submission) return NextResponse.json(null);
  // Scores wait for release, like the outcome.
  const round = hit.interview.rounds.find((r) => r.id === roundId)!;
  if (hit.viewer === 'candidate' && !round.released_at) {
    return NextResponse.json({ ...submission, score: null, max_score: null });
  }
  return NextResponse.json(submission);
}

/**
 * Autosave, and the final submit (`final: true`). Once submitted the work is
 * frozen and a coding or MCQ round counts as completed.
 */
export async function PUT(request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['student']);
  if (!auth.ok) return auth.response;
  const { id, roundId } = await params;

  let body;
  try {
    body = submissionSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: firstIssue(error, 'Could not read your work.') }, { status: 400 });
  }

  const hit = await getInterview(id, auth.user);
  const round = hit?.viewer === 'candidate' ? await getRoundRow(id, roundId) : null;
  if (!hit || !round) return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  if (round.kind === 'video') return NextResponse.json({ error: 'Video rounds have nothing to submit.' }, { status: 400 });
  if (!candidateCanJoin(round)) {
    return NextResponse.json({ error: 'This round is not open.' }, { status: 409 });
  }

  const db = createAdminClient();
  const [existing] = await getSubmissions([roundId]);
  if (existing?.submitted_at) {
    return NextResponse.json({ error: 'You have already submitted this round.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    round_id: roundId,
    candidate_id: auth.user.id,
    updated_at: now,
  };
  if (round.kind === 'coding') {
    row.code = body.code ?? existing?.code ?? '';
    row.language = body.language ?? existing?.language ?? round.content.language ?? null;
  } else {
    const questions: McqQuestion[] = round.content.questions ?? [];
    const known = new Set(questions.map((q) => q.id));
    const answers = Object.fromEntries(Object.entries(body.answers ?? existing?.answers ?? {}).filter(([k]) => known.has(k)));
    row.answers = answers;
    if (body.final) {
      const { score, max } = scoreMcq(questions, answers);
      row.score = score;
      row.max_score = max;
    }
  }
  if (body.final) row.submitted_at = now;

  const { error } = await db.from('interview_submissions').upsert(row, { onConflict: 'round_id,candidate_id' });
  if (error) return NextResponse.json({ error: 'Could not save your work.' }, { status: 500 });

  await markRoundStarted(round);
  if (body.final) {
    await db
      .from('interview_rounds')
      .update({ status: 'completed', ended_at: now, updated_at: now })
      .eq('id', roundId)
      .in('status', ['scheduled', 'in_progress']);
    await syncPipelineStatus(id);
  }
  return NextResponse.json({ ok: true, saved_at: now, submitted: body.final });
}
