import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getInterview, syncPipelineStatus } from '@/lib/interviews';
import { firstIssue, normalizeContent, roundInputSchema } from '@/lib/interview-schemas';

export const dynamic = 'force-dynamic';

/** The owner adds a round to an existing pipeline. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body;
  try {
    body = roundInputSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: firstIssue(error, 'Check the round.') }, { status: 400 });
  }

  const hit = await getInterview(id, auth.user);
  if (!hit || hit.viewer !== 'owner') return NextResponse.json({ error: 'Interview not found' }, { status: 404 });
  if (hit.interview.status === 'cancelled') {
    return NextResponse.json({ error: 'Reopen the interview before adding rounds.' }, { status: 409 });
  }
  if (hit.interview.rounds.length >= 8) {
    return NextResponse.json({ error: 'Eight rounds at most.' }, { status: 400 });
  }

  const db = createAdminClient();
  const interviewerId = body.interviewer_id ?? auth.user.id;
  if (interviewerId !== auth.user.id) {
    const { data: p } = await db.from('users').select('role').eq('id', interviewerId).maybeSingle();
    if (p?.role !== 'alumni') return NextResponse.json({ error: 'The interviewer must be an alumnus.' }, { status: 400 });
  }

  const position = Math.max(0, ...hit.interview.rounds.map((r) => r.position)) + 1;
  const { data, error } = await db
    .from('interview_rounds')
    .insert({
      interview_id: id,
      position,
      title: body.title,
      kind: body.kind,
      scheduled_at: new Date(body.scheduled_at).toISOString(),
      duration_min: body.duration_min,
      interviewer_id: interviewerId,
      proctored: body.proctored,
      content: normalizeContent(body.kind, body.content),
    })
    .select('id')
    .single();
  if (error || !data) return NextResponse.json({ error: 'Could not add the round.' }, { status: 500 });

  await syncPipelineStatus(id);
  return NextResponse.json({ id: data.id }, { status: 201 });
}
