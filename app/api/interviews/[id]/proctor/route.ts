import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/api-auth';
import {
  getInterview,
  getProctorEvents,
  getRoundRow,
  logProctorEvents,
  markRoundStarted,
  summarizeProctorEvents,
} from '@/lib/interviews';
import { firstIssue, proctorBatchSchema } from '@/lib/interview-schemas';

export const dynamic = 'force-dynamic';

type Ctx = { params: Promise<{ id: string }> };

/** Late batches (a final flush after submit or hang-up) are still accepted for a while. */
const LATE_FLUSH_MS = 15 * 60_000;

/**
 * Batched proctoring events from the candidate's browser. Only event records
 * arrive here — the page never sends camera frames.
 */
export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['student']);
  if (!auth.ok) return auth.response;
  const { id } = await params;

  let body;
  try {
    body = proctorBatchSchema.parse(await request.json());
  } catch (error) {
    return NextResponse.json({ error: firstIssue(error, 'Could not read the events.') }, { status: 400 });
  }

  const hit = await getInterview(id, auth.user);
  const round = hit?.viewer === 'candidate' ? await getRoundRow(id, body.round_id) : null;
  if (!hit || !round) return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  if (!round.proctored) return NextResponse.json({ error: 'This round is not proctored.' }, { status: 409 });
  if (round.status === 'cancelled') return NextResponse.json({ error: 'This round was cancelled.' }, { status: 409 });
  if (round.ended_at && Date.now() - new Date(round.ended_at).getTime() > LATE_FLUSH_MS) {
    return NextResponse.json({ error: 'This round has ended.' }, { status: 409 });
  }

  try {
    const stored = await logProctorEvents(round, auth.user.id, body.events);
    if (body.events.some((e) => e.type === 'session_start' || e.type === 'consent_given')) {
      await markRoundStarted(round);
    }
    return NextResponse.json({ stored });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message ?? 'Could not store the events.' }, { status: 500 });
  }
}

/**
 * The interviewer's live view: every event for a round and the summary. The
 * whole list each time — late batches carry earlier timestamps, so a cursor
 * on event time would skip them, and a round's log is small.
 */
export async function GET(request: Request, { params }: Ctx) {
  const auth = await requireApiUser(['alumni', 'admin']);
  if (!auth.ok) return auth.response;
  const { id } = await params;
  const url = new URL(request.url);
  const roundId = url.searchParams.get('round') ?? '';

  const hit = await getInterview(id, auth.user);
  if (!hit || hit.viewer === 'candidate' || !hit.interview.rounds.some((r) => r.id === roundId)) {
    return NextResponse.json({ error: 'Round not found' }, { status: 404 });
  }

  const events = await getProctorEvents([roundId]);
  return NextResponse.json({ summary: summarizeProctorEvents(events), events });
}
