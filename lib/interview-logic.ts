/**
 * Interview rules that both the server and the browser need: status
 * transitions, the proctoring event vocabulary, throttling, and the integrity
 * summary. No imports, so it runs under tsx for the tests and in the bundle.
 */

export type RoundKind = 'video' | 'coding' | 'mcq';
export type RoundStatus = 'scheduled' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type RoundOutcome = 'pending' | 'passed' | 'failed';
export type CandidateResponse = 'pending' | 'accepted' | 'reschedule_requested';
export type InterviewStatus = 'active' | 'completed' | 'cancelled';
export type Decision = 'pending' | 'selected' | 'rejected' | 'on_hold';
export type Recommendation = 'strong_yes' | 'yes' | 'no' | 'strong_no';

export const ROUND_KINDS: { value: RoundKind; label: string; hint: string }[] = [
  { value: 'video', label: 'Video', hint: 'A live call in the browser' },
  { value: 'coding', label: 'Coding', hint: 'A problem statement and a code editor' },
  { value: 'mcq', label: 'MCQ', hint: 'Multiple-choice questions you write' },
];

export const ROUND_STATUS_LABEL: Record<RoundStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No show',
};

export const DECISION_LABEL: Record<Decision, string> = {
  pending: 'Decision pending',
  selected: 'Selected',
  rejected: 'Not selected',
  on_hold: 'On hold',
};

export const RECOMMENDATION_LABEL: Record<Recommendation, string> = {
  strong_yes: 'Strong yes',
  yes: 'Yes',
  no: 'No',
  strong_no: 'Strong no',
};

export const DEFAULT_CRITERIA: Record<RoundKind, string[]> = {
  video: ['Communication', 'Technical depth', 'Problem solving', 'Culture fit'],
  coding: ['Correctness', 'Code quality', 'Problem solving', 'Communication'],
  mcq: ['Fundamentals', 'Accuracy', 'Time management'],
};

/* ------------------------------------------------------------------ */
/* Status transitions                                                  */
/* ------------------------------------------------------------------ */

const TRANSITIONS: Record<RoundStatus, RoundStatus[]> = {
  scheduled: ['in_progress', 'completed', 'cancelled', 'no_show'],
  in_progress: ['completed', 'cancelled'],
  // A finished round stays finished; its outcome is what changes.
  completed: [],
  // Reinstating puts it back on the calendar.
  cancelled: ['scheduled'],
  no_show: ['scheduled'],
};

export function canTransition(from: RoundStatus, to: RoundStatus): boolean {
  return from === to || TRANSITIONS[from].includes(to);
}

export function nextStatuses(from: RoundStatus): RoundStatus[] {
  return TRANSITIONS[from];
}

/** An outcome only means something for a round that happened (or was missed). */
export function canSetOutcome(status: RoundStatus, outcome: RoundOutcome): boolean {
  if (outcome === 'pending') return true;
  if (status === 'completed') return true;
  return status === 'no_show' && outcome === 'failed';
}

/** Releasing shows the candidate the outcome; there must be one to show. */
export function canRelease(status: RoundStatus, outcome: RoundOutcome): boolean {
  return outcome !== 'pending' && (status === 'completed' || status === 'no_show');
}

export function canRespond(status: RoundStatus, from: CandidateResponse, to: CandidateResponse): boolean {
  if (status !== 'scheduled') return false;
  if (to === 'pending') return false;
  return from !== to || to === 'reschedule_requested';
}

/** Rooms open ten minutes before the start, as for the other video rooms. */
export const EARLY_JOIN_MS = 10 * 60_000;
const LATE_GRACE_MS = 60 * 60_000;

/**
 * Whether the candidate may enter now. An interviewer who has started the
 * round lets them in whatever the clock says.
 */
export function candidateCanJoin(
  round: { status: RoundStatus; scheduled_at: string; duration_min: number },
  now = Date.now()
): boolean {
  if (round.status === 'in_progress') return true;
  if (round.status !== 'scheduled') return false;
  const start = new Date(round.scheduled_at).getTime();
  return now >= start - EARLY_JOIN_MS && now <= start + round.duration_min * 60_000 + LATE_GRACE_MS;
}

/** Scheduled rounds that have not ended and start within `days`. */
export function upcomingWithin(
  rounds: { status: RoundStatus; scheduled_at: string; duration_min: number }[],
  days: number,
  now = Date.now()
): number {
  const horizon = now + days * 86_400_000;
  return rounds.filter((r) => {
    const start = new Date(r.scheduled_at).getTime();
    return r.status === 'scheduled' && start <= horizon && start + r.duration_min * 60_000 >= now;
  }).length;
}

/* ------------------------------------------------------------------ */
/* Scheduling in India time                                            */
/* ------------------------------------------------------------------ */

// Times are entered and shown in IST for everyone, as lib/format pins display:
// one college, so 11:00 means 11:00 whatever the device's zone.
const IST_OFFSET_MS = 330 * 60_000;
const LOCAL_INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** A datetime-local value showing the instant as India time. */
export function toIstInput(value: string | number): string {
  return new Date(new Date(value).getTime() + IST_OFFSET_MS).toISOString().slice(0, 16);
}

/** Reads a datetime-local value as India time; null if it is not one. */
export function fromIstInput(value: string): string | null {
  if (!LOCAL_INPUT.test(value)) return null;
  const t = new Date(`${value}:00+05:30`).getTime();
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/** `days` from `now`, at `hour`:00 India time, as a datetime-local value. */
export function istSlot(now: number, days: number, hour: number): string {
  const day = toIstInput(now + days * 86_400_000).slice(0, 10);
  return `${day}T${String(hour).padStart(2, '0')}:00`;
}

export function shiftIstInput(value: string, days: number): string {
  const iso = fromIstInput(value);
  return iso ? toIstInput(new Date(iso).getTime() + days * 86_400_000) : value;
}

/** The pipeline's status follows its rounds unless the owner closed it. */
export function derivePipelineStatus(
  current: InterviewStatus,
  rounds: { status: RoundStatus }[]
): InterviewStatus {
  if (current === 'cancelled') return 'cancelled';
  if (!rounds.length) return 'active';
  const open = rounds.some((r) => r.status === 'scheduled' || r.status === 'in_progress');
  return open ? 'active' : 'completed';
}

/* ------------------------------------------------------------------ */
/* Scorecards                                                          */
/* ------------------------------------------------------------------ */

export function validRatings(ratings: Record<string, unknown>): ratings is Record<string, number> {
  const entries = Object.entries(ratings);
  if (entries.length === 0 || entries.length > 12) return false;
  return entries.every(
    ([k, v]) => k.trim().length > 0 && k.length <= 60 && typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
  );
}

export function averageRating(ratings: Record<string, number>): number | null {
  const values = Object.values(ratings);
  if (!values.length) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

/* ------------------------------------------------------------------ */
/* MCQ                                                                 */
/* ------------------------------------------------------------------ */

export type McqQuestion = { id: string; prompt: string; options: string[]; answer?: number };

export function scoreMcq(questions: McqQuestion[], answers: Record<string, number>) {
  let score = 0;
  for (const q of questions) {
    if (typeof q.answer === 'number' && answers[q.id] === q.answer) score++;
  }
  return { score, max: questions.length };
}

/** What the candidate is allowed to see of a question. */
export function stripAnswers(questions: McqQuestion[]): McqQuestion[] {
  return questions.map(({ id, prompt, options }) => ({ id, prompt, options }));
}

/* ------------------------------------------------------------------ */
/* Proctoring vocabulary                                               */
/* ------------------------------------------------------------------ */

export const PROCTOR_TYPES = [
  'consent_given',
  'consent_declined',
  'session_start',
  'session_end',
  'tab_hidden',
  'tab_visible',
  'window_blur',
  'window_focus',
  'fullscreen_exit',
  'fullscreen_enter',
  'copy',
  'cut',
  'paste',
  'context_menu',
  'multiple_displays',
  'camera_off',
  'camera_on',
  'camera_blocked',
  'no_person',
  'multiple_people',
  'phone_detected',
  'vision_unavailable',
] as const;

export type ProctorType = (typeof PROCTOR_TYPES)[number];

export type Severity = 'high' | 'medium' | 'low' | 'info';

export const PROCTOR_META: Record<ProctorType, { label: string; severity: Severity }> = {
  consent_given: { label: 'Agreed to monitoring', severity: 'info' },
  consent_declined: { label: 'Declined monitoring', severity: 'info' },
  session_start: { label: 'Started the round', severity: 'info' },
  session_end: { label: 'Left the round', severity: 'info' },
  tab_hidden: { label: 'Switched away from the tab', severity: 'medium' },
  tab_visible: { label: 'Came back to the tab', severity: 'info' },
  window_blur: { label: 'Window lost focus', severity: 'low' },
  window_focus: { label: 'Window regained focus', severity: 'info' },
  fullscreen_exit: { label: 'Left full screen', severity: 'medium' },
  fullscreen_enter: { label: 'Entered full screen', severity: 'info' },
  copy: { label: 'Copied text', severity: 'low' },
  cut: { label: 'Cut text', severity: 'low' },
  paste: { label: 'Pasted text', severity: 'medium' },
  context_menu: { label: 'Opened the right-click menu', severity: 'low' },
  multiple_displays: { label: 'More than one display connected', severity: 'high' },
  camera_off: { label: 'Camera turned off', severity: 'medium' },
  camera_on: { label: 'Camera back on', severity: 'info' },
  camera_blocked: { label: 'Camera blocked or unavailable', severity: 'high' },
  no_person: { label: 'Nobody visible on camera', severity: 'medium' },
  multiple_people: { label: 'More than one person on camera', severity: 'high' },
  phone_detected: { label: 'Phone visible on camera', severity: 'high' },
  vision_unavailable: { label: 'Camera checks could not run', severity: 'info' },
};

export function isFlag(type: ProctorType): boolean {
  return PROCTOR_META[type].severity !== 'info';
}

export function isProctorType(v: unknown): v is ProctorType {
  return typeof v === 'string' && (PROCTOR_TYPES as readonly string[]).includes(v);
}

/**
 * The shortest gap between two logged events of one type. Discrete actions
 * (paste, right-click) get a short window so bursts collapse; camera findings
 * a long one, since a phone on the desk would otherwise log every sample.
 */
export const THROTTLE_MS: Partial<Record<ProctorType, number>> = {
  window_blur: 1500,
  window_focus: 1500,
  copy: 3000,
  cut: 3000,
  paste: 3000,
  context_menu: 3000,
  multiple_displays: 5 * 60_000,
  no_person: 30_000,
  multiple_people: 30_000,
  phone_detected: 30_000,
  camera_off: 10_000,
  camera_blocked: 60_000,
  vision_unavailable: 10 * 60_000,
};

/** Returns a gate that says whether an event of this type should be logged now. */
export function createThrottle(windows: Partial<Record<ProctorType, number>> = THROTTLE_MS) {
  const last = new Map<ProctorType, number>();
  return (type: ProctorType, now: number): boolean => {
    const gap = windows[type] ?? 0;
    const prev = last.get(type);
    if (prev !== undefined && now - prev < gap) return false;
    last.set(type, now);
    return true;
  };
}

/**
 * Counts from one camera sample, read off COCO-SSD's detections. A box below
 * the score threshold is ignored: a false phone flag is worse than a missed one.
 */
export function readDetections(
  detections: { class: string; score: number }[],
  threshold = { person: 0.55, phone: 0.6 }
) {
  let people = 0;
  let phone = false;
  for (const d of detections) {
    if (d.class === 'person' && d.score >= threshold.person) people++;
    if (d.class === 'cell phone' && d.score >= threshold.phone) phone = true;
  }
  return { people, phone };
}

/**
 * Turns a run of camera samples into findings, requiring a condition to hold
 * for `need` consecutive samples so a single bad frame is not a flag.
 */
export function createVisionTracker(need = 2) {
  const streak = { none: 0, many: 0, phone: 0 };
  return (sample: { people: number; phone: boolean }): ProctorType[] => {
    streak.none = sample.people === 0 ? streak.none + 1 : 0;
    streak.many = sample.people > 1 ? streak.many + 1 : 0;
    streak.phone = sample.phone ? streak.phone + 1 : 0;
    const out: ProctorType[] = [];
    if (streak.none >= need) out.push('no_person');
    if (streak.many >= need) out.push('multiple_people');
    if (streak.phone >= need) out.push('phone_detected');
    return out;
  };
}

/* ------------------------------------------------------------------ */
/* Integrity summary                                                   */
/* ------------------------------------------------------------------ */

export type ProctorEventLike = {
  type: ProctorType;
  occurred_at: string;
  duration_ms?: number | null;
};

export type IntegritySummary = {
  totalFlags: number;
  bySeverity: Record<Exclude<Severity, 'info'>, number>;
  byType: Partial<Record<ProctorType, number>>;
  /** Longest single stretch away from the tab or window, in ms. */
  longestAbsenceMs: number;
  totalAbsenceMs: number;
  absences: number;
  consented: boolean;
  visionAvailable: boolean;
  firstAt: string | null;
  lastAt: string | null;
};

const AWAY: Partial<Record<ProctorType, ProctorType>> = { tab_hidden: 'tab_visible', window_blur: 'window_focus' };
const BACK = new Set<ProctorType>(['tab_visible', 'window_focus']);

/**
 * Counts by type and how long the candidate was away. An absence runs from a
 * hide or blur to the matching return; one still open when the session ended
 * (or at the last event) is closed there. Overlapping hide and blur periods
 * are merged so leaving the tab is not counted twice.
 */
export function summarizeProctorEvents(events: ProctorEventLike[]): IntegritySummary {
  const sorted = [...events].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );
  const byType: Partial<Record<ProctorType, number>> = {};
  const bySeverity = { high: 0, medium: 0, low: 0 };
  let totalFlags = 0;

  for (const e of sorted) {
    byType[e.type] = (byType[e.type] ?? 0) + 1;
    const sev = PROCTOR_META[e.type]?.severity;
    if (sev && sev !== 'info') {
      bySeverity[sev]++;
      totalFlags++;
    }
  }

  // Build away intervals, then merge overlaps.
  const intervals: [number, number][] = [];
  const open = new Map<ProctorType, number>();
  for (const e of sorted) {
    const t = new Date(e.occurred_at).getTime();
    if (AWAY[e.type]) {
      if (!open.has(e.type)) open.set(e.type, t);
      continue;
    }
    if (BACK.has(e.type)) {
      const away = e.type === 'tab_visible' ? 'tab_hidden' : 'window_blur';
      const start = open.get(away);
      if (start !== undefined) {
        intervals.push([start, t]);
        open.delete(away);
      } else if (e.duration_ms) {
        // The hide was lost (a closed tab rarely flushes), but the return knows how long it was.
        intervals.push([t - e.duration_ms, t]);
      }
      continue;
    }
    if (e.type === 'session_end') {
      for (const start of open.values()) intervals.push([start, t]);
      open.clear();
    }
  }
  if (open.size && sorted.length) {
    const end = new Date(sorted[sorted.length - 1].occurred_at).getTime();
    for (const start of open.values()) intervals.push([start, end]);
  }

  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of intervals) {
    const prev = merged[merged.length - 1];
    if (prev && s <= prev[1]) prev[1] = Math.max(prev[1], e);
    else merged.push([s, e]);
  }
  const lengths = merged.map(([s, e]) => Math.max(0, e - s));

  return {
    totalFlags,
    bySeverity,
    byType,
    longestAbsenceMs: lengths.length ? Math.max(...lengths) : 0,
    totalAbsenceMs: lengths.reduce((s, v) => s + v, 0),
    absences: merged.length,
    consented: (byType.consent_given ?? 0) > 0,
    visionAvailable: (byType.vision_unavailable ?? 0) === 0,
    firstAt: sorted[0]?.occurred_at ?? null,
    lastAt: sorted[sorted.length - 1]?.occurred_at ?? null,
  };
}

/** 4m 05s, 12s, 1h 03m */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}
