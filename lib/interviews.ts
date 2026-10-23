import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMemberCards, type MemberCard } from '@/lib/network';
import type { SessionUser } from '@/lib/session';
import {
  derivePipelineStatus,
  istSlot,
  stripAnswers,
  summarizeProctorEvents,
  type CandidateResponse,
  type Decision,
  type InterviewStatus,
  type McqQuestion,
  type ProctorType,
  type Recommendation,
  type RoundKind,
  type RoundOutcome,
  type RoundStatus,
  type IntegritySummary,
} from '@/lib/interview-logic';

export * from '@/lib/interview-logic';

/**
 * Interview pipelines: reads shaped for whoever is looking, and the writes the
 * API routes make. Everything goes through the service key; who may see what
 * is decided here, in `viewOf` and `forViewer`.
 *
 * The candidate's copy is filtered before it leaves this module: no MCQ answer
 * key, no private scorecard notes or ratings, and no outcome or decision until
 * the interviewer releases it.
 */

export type Viewer = 'owner' | 'panel' | 'candidate' | 'admin';

export type CodingContent = { problem: string; language: string; starter?: string };
export type McqContent = { instructions?: string; questions: McqQuestion[] };
export type RoundContent = Partial<CodingContent & McqContent>;

export type Round = {
  id: string;
  interview_id: string;
  position: number;
  title: string;
  kind: RoundKind;
  scheduled_at: string;
  duration_min: number;
  interviewer_id: string;
  interviewer_name: string;
  status: RoundStatus;
  outcome: RoundOutcome;
  candidate_response: CandidateResponse;
  reschedule_note: string | null;
  proctored: boolean;
  content: RoundContent;
  room_id: string;
  started_at: string | null;
  ended_at: string | null;
  released_at: string | null;
};

/** A round as stored, unfiltered — for writes and checks, never sent to a candidate. */
export type RoundRow = Omit<Round, 'interviewer_name'> & { updated_at: string };

export type Interview = {
  id: string;
  candidate_id: string;
  interviewer_id: string;
  title: string;
  company: string | null;
  description: string | null;
  opportunity: { id: string; title: string } | null;
  request: { id: string; type: string } | null;
  status: InterviewStatus;
  decision: Decision;
  decision_note: string | null;
  decision_released_at: string | null;
  created_at: string;
  candidate: MemberCard | null;
  owner: MemberCard | null;
  rounds: Round[];
};

export type Scorecard = {
  id: string;
  round_id: string;
  reviewer_id: string;
  reviewer_name: string;
  ratings: Record<string, number>;
  recommendation: Recommendation | null;
  notes: string | null;
  feedback: string | null;
  updated_at: string;
};

export type Submission = {
  id: string;
  round_id: string;
  code: string | null;
  language: string | null;
  answers: Record<string, number>;
  score: number | null;
  max_score: number | null;
  submitted_at: string | null;
  updated_at: string;
};

export type ProctorEvent = {
  id: string;
  round_id: string;
  type: ProctorType;
  occurred_at: string;
  duration_ms: number | null;
  detail: Record<string, unknown>;
};

const INTERVIEW_COLUMNS =
  'id, candidate_id, interviewer_id, title, company, description, opportunity_id, request_id, status, decision, decision_note, decision_released_at, created_at, opportunity:opportunities(id, title), request:requests(id, type)';
const ROUND_COLUMNS =
  'id, interview_id, position, title, kind, scheduled_at, duration_min, interviewer_id, status, outcome, candidate_response, reschedule_note, proctored, content, room_id, started_at, ended_at, released_at';

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

/* ------------------------------------------------------------------ */
/* Shaping                                                             */
/* ------------------------------------------------------------------ */

export function viewOf(
  row: { candidate_id: string; interviewer_id: string },
  rounds: { interviewer_id: string }[],
  user: Pick<SessionUser, 'id' | 'role'>
): Viewer | null {
  if (row.interviewer_id === user.id) return 'owner';
  if (rounds.some((r) => r.interviewer_id === user.id)) return 'panel';
  if (row.candidate_id === user.id) return 'candidate';
  if (user.role === 'admin') return 'admin';
  return null;
}

type Embedded<T> = T | T[] | null;

/** Rows as PostgREST returns them for INTERVIEW_COLUMNS and ROUND_COLUMNS. */
type InterviewDbRow = Omit<Interview, 'opportunity' | 'request' | 'candidate' | 'owner' | 'rounds'> & {
  opportunity: Embedded<{ id: string; title: string }>;
  request: Embedded<{ id: string; type: string }>;
};
type RoundDbRow = Omit<RoundRow, 'updated_at'>;

function shapeRound(r: RoundDbRow, names: Map<string, string>, viewer: Viewer): Round {
  const content = (r.content ?? {}) as RoundContent;
  const isCandidate = viewer === 'candidate';
  const released = Boolean(r.released_at);
  return {
    id: r.id,
    interview_id: r.interview_id,
    position: r.position,
    title: r.title,
    kind: r.kind,
    scheduled_at: r.scheduled_at,
    duration_min: r.duration_min,
    interviewer_id: r.interviewer_id,
    interviewer_name: names.get(r.interviewer_id) ?? 'Interviewer',
    status: r.status,
    outcome: isCandidate && !released ? 'pending' : r.outcome,
    candidate_response: r.candidate_response,
    reschedule_note: r.reschedule_note,
    proctored: r.proctored,
    content: isCandidate && content.questions ? { ...content, questions: stripAnswers(content.questions) } : content,
    room_id: r.room_id,
    started_at: r.started_at,
    ended_at: r.ended_at,
    released_at: r.released_at,
  };
}

async function hydrate(rows: InterviewDbRow[], user: Pick<SessionUser, 'id' | 'role'>): Promise<{ interview: Interview; viewer: Viewer }[]> {
  if (!rows.length) return [];
  const db = createAdminClient();
  const { data } = await db
    .from('interview_rounds')
    .select(ROUND_COLUMNS)
    .in('interview_id', rows.map((r) => r.id))
    .order('position', { ascending: true })
    .order('scheduled_at', { ascending: true });
  const roundRows = (data ?? []) as RoundDbRow[];

  const byInterview = new Map<string, RoundDbRow[]>();
  for (const r of roundRows) {
    const list = byInterview.get(r.interview_id) ?? [];
    list.push(r);
    byInterview.set(r.interview_id, list);
  }

  const people = await getMemberCards([
    ...rows.flatMap((r) => [r.candidate_id, r.interviewer_id]),
    ...roundRows.map((r) => r.interviewer_id),
  ]);
  const cards = new Map(people.map((p) => [p.id, p]));
  const names = new Map(people.map((p) => [p.id, p.full_name]));

  const out: { interview: Interview; viewer: Viewer }[] = [];
  for (const row of rows) {
    const rounds = byInterview.get(row.id) ?? [];
    const viewer = viewOf(row, rounds, user);
    if (!viewer) continue;
    const isCandidate = viewer === 'candidate';
    const released = Boolean(row.decision_released_at);
    const opp = one(row.opportunity);
    const req = one(row.request);
    out.push({
      viewer,
      interview: {
        id: row.id,
        candidate_id: row.candidate_id,
        interviewer_id: row.interviewer_id,
        title: row.title,
        company: row.company,
        description: row.description,
        opportunity: opp ? { id: opp.id, title: opp.title } : null,
        request: req ? { id: req.id, type: req.type } : null,
        status: row.status,
        decision: isCandidate && !released ? 'pending' : row.decision,
        decision_note: isCandidate && !released ? null : row.decision_note,
        decision_released_at: row.decision_released_at,
        created_at: row.created_at,
        candidate: cards.get(row.candidate_id) ?? null,
        owner: cards.get(row.interviewer_id) ?? null,
        rounds: rounds.map((r) => shapeRound(r, names, viewer)),
      },
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

/** Pipelines the user is in: as candidate, owner, or interviewer on a round. */
export async function listInterviewsForUser(user: Pick<SessionUser, 'id' | 'role'>): Promise<{ interview: Interview; viewer: Viewer }[]> {
  const db = createAdminClient();
  let ids: string[] = [];
  if (user.role === 'student') {
    const { data } = await db.from('interviews').select('id').eq('candidate_id', user.id);
    ids = (data ?? []).map((r) => r.id);
  } else {
    const [own, panel] = await Promise.all([
      db.from('interviews').select('id').eq('interviewer_id', user.id),
      db.from('interview_rounds').select('interview_id').eq('interviewer_id', user.id),
    ]);
    ids = [...new Set([...(own.data ?? []).map((r) => r.id), ...(panel.data ?? []).map((r) => r.interview_id)])];
  }
  if (!ids.length) return [];
  const { data } = await db
    .from('interviews')
    .select(INTERVIEW_COLUMNS)
    .in('id', ids.slice(0, 300))
    .order('created_at', { ascending: false });
  return hydrate((data ?? []) as unknown as InterviewDbRow[], user);
}

export async function getInterview(id: string, user: Pick<SessionUser, 'id' | 'role'>) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const db = createAdminClient();
  const { data } = await db.from('interviews').select(INTERVIEW_COLUMNS).eq('id', id).maybeSingle();
  if (!data) return null;
  const [hit] = await hydrate([data as unknown as InterviewDbRow], user);
  return hit ?? null;
}

/** The raw row, for writes that need the unfiltered round (answer key included). */
export async function getRoundRow(interviewId: string, roundId: string) {
  const db = createAdminClient();
  const { data } = await db
    .from('interview_rounds')
    .select(`${ROUND_COLUMNS}, updated_at`)
    .eq('id', roundId)
    .eq('interview_id', interviewId)
    .maybeSingle();
  return (data as RoundRow | null) ?? null;
}

export async function getScorecards(roundIds: string[]): Promise<Scorecard[]> {
  if (!roundIds.length) return [];
  const db = createAdminClient();
  const { data } = await db
    .from('interview_scorecards')
    .select('id, round_id, reviewer_id, ratings, recommendation, notes, feedback, updated_at, reviewer:users!interview_scorecards_reviewer_id_fkey(full_name)')
    .in('round_id', roundIds)
    .order('updated_at', { ascending: true });
  type ScorecardDbRow = Omit<Scorecard, 'reviewer_name'> & { reviewer: Embedded<{ full_name: string }> };
  return ((data ?? []) as ScorecardDbRow[]).map((s) => ({
    id: s.id,
    round_id: s.round_id,
    reviewer_id: s.reviewer_id,
    reviewer_name: one(s.reviewer)?.full_name ?? 'Reviewer',
    ratings: s.ratings ?? {},
    recommendation: s.recommendation,
    notes: s.notes,
    feedback: s.feedback,
    updated_at: s.updated_at,
  }));
}

/** What a candidate may read back after release: the shared feedback only. */
export async function getReleasedFeedback(rounds: Round[]): Promise<Map<string, string[]>> {
  const released = rounds.filter((r) => r.released_at).map((r) => r.id);
  const cards = await getScorecards(released);
  const out = new Map<string, string[]>();
  for (const c of cards) {
    if (!c.feedback?.trim()) continue;
    out.set(c.round_id, [...(out.get(c.round_id) ?? []), c.feedback.trim()]);
  }
  return out;
}

export async function getSubmissions(roundIds: string[]): Promise<Submission[]> {
  if (!roundIds.length) return [];
  const db = createAdminClient();
  const { data } = await db
    .from('interview_submissions')
    .select('id, round_id, code, language, answers, score, max_score, submitted_at, updated_at')
    .in('round_id', roundIds);
  return (data ?? []) as Submission[];
}

export async function getProctorEvents(roundIds: string[]): Promise<ProctorEvent[]> {
  if (!roundIds.length) return [];
  const db = createAdminClient();
  const { data } = await db
    .from('proctor_events')
    .select('id, round_id, type, occurred_at, duration_ms, detail')
    .in('round_id', roundIds)
    .order('occurred_at', { ascending: true })
    .limit(5000);
  return (data ?? []) as ProctorEvent[];
}

export function summariesByRound(events: ProctorEvent[]): Map<string, IntegritySummary> {
  const grouped = new Map<string, ProctorEvent[]>();
  for (const e of events) grouped.set(e.round_id, [...(grouped.get(e.round_id) ?? []), e]);
  return new Map([...grouped].map(([id, list]) => [id, summarizeProctorEvents(list)]));
}

/**
 * Students this alumnus may interview: anyone who has an open or accepted
 * request with them, or is a connection. That relationship is the consent
 * record, the same rule video sessions rest on.
 */
export async function eligibleCandidates(alumniId: string) {
  const db = createAdminClient();
  const [reqs, links] = await Promise.all([
    db
      .from('requests')
      .select('id, student_id, type, status, created_at')
      .eq('alumni_id', alumniId)
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(300),
    db
      .from('connections')
      .select('requester_id, addressee_id')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${alumniId},addressee_id.eq.${alumniId}`)
      .limit(2000),
  ]);
  const requestsBy = new Map<string, { id: string; type: string; status: string }[]>();
  for (const r of reqs.data ?? []) {
    requestsBy.set(r.student_id, [...(requestsBy.get(r.student_id) ?? []), { id: r.id, type: r.type, status: r.status }]);
  }
  const connected = (links.data ?? []).map((c) => (c.requester_id === alumniId ? c.addressee_id : c.requester_id));
  const cards = await getMemberCards([...requestsBy.keys(), ...connected]);
  return cards
    .filter((c) => c.role === 'student')
    .map((c) => ({ ...c, requests: requestsBy.get(c.id) ?? [] }));
}

export async function isEligibleCandidate(alumniId: string, studentId: string): Promise<boolean> {
  const db = createAdminClient();
  const [req, link] = await Promise.all([
    db
      .from('requests')
      .select('id', { count: 'exact', head: true })
      .eq('alumni_id', alumniId)
      .eq('student_id', studentId)
      .in('status', ['pending', 'accepted']),
    db
      .from('connections')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .or(`and(requester_id.eq.${alumniId},addressee_id.eq.${studentId}),and(requester_id.eq.${studentId},addressee_id.eq.${alumniId})`),
  ]);
  return (req.count ?? 0) > 0 || (link.count ?? 0) > 0;
}

/** Alumni the owner can put on a panel: their alumni connections. */
export async function panelCandidates(alumniId: string): Promise<MemberCard[]> {
  const db = createAdminClient();
  const { data } = await db
    .from('connections')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${alumniId},addressee_id.eq.${alumniId}`)
    .limit(2000);
  const ids = (data ?? []).map((c) => (c.requester_id === alumniId ? c.addressee_id : c.requester_id));
  const cards = await getMemberCards(ids);
  return cards.filter((c) => c.role === 'alumni').sort((a, b) => a.full_name.localeCompare(b.full_name));
}

/** Where a new pipeline's first round lands by default: two days out, 11:00 IST. */
export function defaultRoundSlot(): string {
  return istSlot(Date.now(), 2, 11);
}

export async function countUpcomingInterviews(userId: string): Promise<number> {
  const db = createAdminClient();
  const { data } = await db.from('interviews').select('id').eq('candidate_id', userId).eq('status', 'active');
  if (!data?.length) return 0;
  const { count } = await db
    .from('interview_rounds')
    .select('id', { count: 'exact', head: true })
    .in('interview_id', data.map((r) => r.id))
    .in('status', ['scheduled', 'in_progress']);
  return count ?? 0;
}

/* ------------------------------------------------------------------ */
/* Writes                                                              */
/* ------------------------------------------------------------------ */

/** Keep the pipeline's status in step after a round changes. */
export async function syncPipelineStatus(interviewId: string) {
  const db = createAdminClient();
  const [{ data: iv }, { data: rounds }] = await Promise.all([
    db.from('interviews').select('status').eq('id', interviewId).maybeSingle(),
    db.from('interview_rounds').select('status').eq('interview_id', interviewId),
  ]);
  if (!iv) return;
  const next = derivePipelineStatus(iv.status as InterviewStatus, (rounds ?? []) as { status: RoundStatus }[]);
  if (next !== iv.status) {
    await db.from('interviews').update({ status: next, updated_at: new Date().toISOString() }).eq('id', interviewId);
  }
}

export type ProctorInput = { type: ProctorType; at: string; duration_ms?: number | null; detail?: Record<string, unknown> };

const MAX_EVENTS_PER_ROUND = 3000;

/**
 * Store a batch from the candidate's browser. Times are the browser's, kept
 * within a sane window of the server's clock so a wrong device clock cannot
 * put events years away.
 */
export async function logProctorEvents(round: { id: string; interview_id: string }, candidateId: string, events: ProctorInput[]) {
  const db = createAdminClient();
  const { count } = await db.from('proctor_events').select('id', { count: 'exact', head: true }).eq('round_id', round.id);
  const room = MAX_EVENTS_PER_ROUND - (count ?? 0);
  if (room <= 0) return 0;

  const now = Date.now();
  const rows = events.slice(0, room).map((e) => {
    const t = new Date(e.at).getTime();
    const sane = Number.isFinite(t) && t > now - 12 * 3600_000 && t < now + 60_000;
    return {
      round_id: round.id,
      interview_id: round.interview_id,
      candidate_id: candidateId,
      type: e.type,
      occurred_at: new Date(sane ? t : now).toISOString(),
      duration_ms: e.duration_ms != null ? Math.max(0, Math.min(Math.round(e.duration_ms), 24 * 3600_000)) : null,
      detail: e.detail ?? {},
    };
  });
  if (!rows.length) return 0;
  const { error } = await db.from('proctor_events').insert(rows);
  if (error) throw new Error(`Could not store the events: ${error.message}`);
  return rows.length;
}

/**
 * The candidate walking in starts the round, if the interviewer has not
 * already, and starts its clock if nothing has.
 */
export async function markRoundStarted(round: { id: string; interview_id: string; status: RoundStatus; started_at: string | null }) {
  if (round.status !== 'scheduled' && (round.status !== 'in_progress' || round.started_at)) return;
  const db = createAdminClient();
  const now = new Date().toISOString();
  await db
    .from('interview_rounds')
    .update({ status: 'in_progress', started_at: round.started_at ?? now, updated_at: now })
    .eq('id', round.id)
    .in('status', ['scheduled', 'in_progress']);
}
