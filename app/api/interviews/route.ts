import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isEligibleCandidate, listInterviewsForUser } from '@/lib/interviews';
import { createInterviewSchema, firstIssue, normalizeContent } from '@/lib/interview-schemas';

export const dynamic = 'force-dynamic';

/** Pipelines the viewer is in, shaped for their role. */
export async function GET() {
  const auth = await requireApiUser(['student', 'alumni', 'admin']);
  if (!auth.ok) return auth.response;
  const list = await listInterviewsForUser(auth.user);
  return NextResponse.json(list.map(({ interview, viewer }) => ({ ...interview, viewer })));
}

/** An alumnus opens a pipeline for a student, with its rounds. */
export async function POST(request: Request) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;
  const me = auth.user.id;

  let body;
  try {
    body = createInterviewSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: firstIssue(error, 'Check the interview details.') }, { status: 400 });
  }

  const db = createAdminClient();
  const { data: candidate } = await db.from('users').select('id, role').eq('id', body.candidate_id).maybeSingle();
  if (!candidate || candidate.role !== 'student') {
    return NextResponse.json({ error: 'That student is not on the network.' }, { status: 404 });
  }
  if (!(await isEligibleCandidate(me, candidate.id))) {
    return NextResponse.json(
      { error: 'You can interview students who have sent you a request or are connected with you.' },
      { status: 403 }
    );
  }

  if (body.opportunity_id) {
    const { data: opp } = await db.from('opportunities').select('posted_by').eq('id', body.opportunity_id).maybeSingle();
    if (!opp || opp.posted_by !== me) {
      return NextResponse.json({ error: 'Link one of your own postings.' }, { status: 400 });
    }
  }
  if (body.request_id) {
    const { data: req } = await db.from('requests').select('student_id, alumni_id').eq('id', body.request_id).maybeSingle();
    if (!req || req.alumni_id !== me || req.student_id !== candidate.id) {
      return NextResponse.json({ error: 'That request is not between you and this student.' }, { status: 400 });
    }
  }

  // Panel members must be alumni.
  const panel = [...new Set(body.rounds.map((r) => r.interviewer_id).filter((id): id is string => Boolean(id) && id !== me))];
  if (panel.length) {
    const { data: people } = await db.from('users').select('id, role').in('id', panel);
    const ok = new Set((people ?? []).filter((p) => p.role === 'alumni').map((p) => p.id));
    if (panel.some((id) => !ok.has(id))) {
      return NextResponse.json({ error: 'Every interviewer must be an alumnus on the network.' }, { status: 400 });
    }
  }

  const { data: interview, error } = await db
    .from('interviews')
    .insert({
      candidate_id: candidate.id,
      interviewer_id: me,
      title: body.title,
      company: body.company || null,
      description: body.description || null,
      opportunity_id: body.opportunity_id ?? null,
      request_id: body.request_id ?? null,
    })
    .select('id')
    .single();
  if (error || !interview) {
    return NextResponse.json({ error: 'Could not create the interview.' }, { status: 500 });
  }

  const { error: roundError } = await db.from('interview_rounds').insert(
    body.rounds.map((r, i) => ({
      interview_id: interview.id,
      position: i + 1,
      title: r.title,
      kind: r.kind,
      scheduled_at: new Date(r.scheduled_at).toISOString(),
      duration_min: r.duration_min,
      interviewer_id: r.interviewer_id ?? me,
      proctored: r.proctored,
      content: normalizeContent(r.kind, r.content),
    }))
  );
  if (roundError) {
    // No half-made pipelines: the rounds are the point of it.
    await db.from('interviews').delete().eq('id', interview.id);
    return NextResponse.json({ error: 'Could not save the rounds.' }, { status: 500 });
  }

  return NextResponse.json({ id: interview.id }, { status: 201 });
}
