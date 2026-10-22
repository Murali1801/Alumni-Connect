import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getInterview, getRoundRow, validRatings } from '@/lib/interviews';
import { firstIssue, scorecardSchema } from '@/lib/interview-schemas';

export const dynamic = 'force-dynamic';

/** An interviewer saves their own scorecard for a round; one per reviewer. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; roundId: string }> }) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id, roundId } = await params;

  let body;
  try {
    body = scorecardSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: firstIssue(error, 'Ratings run from 1 to 5.') }, { status: 400 });
  }
  if (!validRatings(body.ratings)) {
    return NextResponse.json({ error: 'Rate at least one criterion, each from 1 to 5.' }, { status: 400 });
  }

  const hit = await getInterview(id, auth.user);
  const round = hit ? await getRoundRow(id, roundId) : null;
  if (!hit || !round || (hit.viewer !== 'owner' && hit.viewer !== 'panel')) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  }
  if (round.status === 'scheduled' || round.status === 'cancelled') {
    return NextResponse.json({ error: 'Score a round once it has started.' }, { status: 409 });
  }

  const db = createAdminClient();
  const { error } = await db.from('interview_scorecards').upsert(
    {
      round_id: roundId,
      reviewer_id: auth.user.id,
      ratings: body.ratings,
      recommendation: body.recommendation ?? null,
      notes: body.notes?.trim() || null,
      feedback: body.feedback?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'round_id,reviewer_id' }
  );
  if (error) return NextResponse.json({ error: 'Could not save the scorecard.' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
