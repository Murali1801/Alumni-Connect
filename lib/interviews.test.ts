import assert from 'assert';
import {
  averageRating,
  canRelease,
  canRespond,
  canSetOutcome,
  canTransition,
  candidateCanJoin,
  createThrottle,
  createVisionTracker,
  derivePipelineStatus,
  formatDuration,
  fromIstInput,
  istSlot,
  shiftIstInput,
  toIstInput,
  upcomingWithin,
  readDetections,
  scoreMcq,
  stripAnswers,
  summarizeProctorEvents,
  validRatings,
  type ProctorEventLike,
} from './interview-logic';

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok   ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}\n       ${(err as Error).message}`);
  }
}

console.log('Running interviews.test.ts...');

/* ---------------- transitions ---------------- */

test('scheduled rounds can start, finish, be cancelled or marked no-show', () => {
  assert.ok(canTransition('scheduled', 'in_progress'));
  assert.ok(canTransition('scheduled', 'completed'));
  assert.ok(canTransition('scheduled', 'cancelled'));
  assert.ok(canTransition('scheduled', 'no_show'));
});

test('a completed round cannot be reopened', () => {
  assert.ok(!canTransition('completed', 'scheduled'));
  assert.ok(!canTransition('completed', 'in_progress'));
  assert.ok(canTransition('completed', 'completed'));
});

test('an in-progress round cannot go back to scheduled or no-show', () => {
  assert.ok(!canTransition('in_progress', 'scheduled'));
  assert.ok(!canTransition('in_progress', 'no_show'));
  assert.ok(canTransition('in_progress', 'completed'));
});

test('cancelled and no-show rounds can be reinstated', () => {
  assert.ok(canTransition('cancelled', 'scheduled'));
  assert.ok(canTransition('no_show', 'scheduled'));
  assert.ok(!canTransition('cancelled', 'completed'));
});

test('outcomes need a finished round', () => {
  assert.ok(!canSetOutcome('scheduled', 'passed'));
  assert.ok(canSetOutcome('completed', 'passed'));
  assert.ok(canSetOutcome('completed', 'failed'));
  assert.ok(canSetOutcome('no_show', 'failed'));
  assert.ok(!canSetOutcome('no_show', 'passed'));
  assert.ok(canSetOutcome('scheduled', 'pending'));
});

test('release needs an outcome', () => {
  assert.ok(!canRelease('completed', 'pending'));
  assert.ok(canRelease('completed', 'passed'));
  assert.ok(!canRelease('in_progress', 'passed'));
});

test('candidates respond only to scheduled rounds', () => {
  assert.ok(canRespond('scheduled', 'pending', 'accepted'));
  assert.ok(canRespond('scheduled', 'accepted', 'reschedule_requested'));
  assert.ok(canRespond('scheduled', 'reschedule_requested', 'reschedule_requested'));
  assert.ok(!canRespond('scheduled', 'accepted', 'accepted'));
  assert.ok(!canRespond('completed', 'pending', 'accepted'));
  assert.ok(!canRespond('scheduled', 'accepted', 'pending'));
});

test('join window opens ten minutes early and an in-progress round is always open', () => {
  const start = new Date('2026-10-23T10:00:00Z').getTime();
  const round = { status: 'scheduled' as const, scheduled_at: new Date(start).toISOString(), duration_min: 45 };
  assert.ok(!candidateCanJoin(round, start - 11 * 60_000));
  assert.ok(candidateCanJoin(round, start - 9 * 60_000));
  assert.ok(candidateCanJoin(round, start + 30 * 60_000));
  assert.ok(!candidateCanJoin(round, start + 2 * 3600_000));
  assert.ok(candidateCanJoin({ ...round, status: 'in_progress' }, start - 86_400_000));
  assert.ok(!candidateCanJoin({ ...round, status: 'cancelled' }, start));
});

test('pipeline status follows its rounds', () => {
  assert.strictEqual(derivePipelineStatus('active', []), 'active');
  assert.strictEqual(derivePipelineStatus('active', [{ status: 'completed' }, { status: 'scheduled' }]), 'active');
  assert.strictEqual(derivePipelineStatus('active', [{ status: 'completed' }, { status: 'cancelled' }]), 'completed');
  assert.strictEqual(derivePipelineStatus('cancelled', [{ status: 'scheduled' }]), 'cancelled');
});

/* ---------------- scorecards and MCQ ---------------- */

test('ratings must be whole numbers from 1 to 5', () => {
  assert.ok(validRatings({ Communication: 4, 'Problem solving': 5 }));
  assert.ok(!validRatings({}));
  assert.ok(!validRatings({ Communication: 6 }));
  assert.ok(!validRatings({ Communication: 3.5 }));
  assert.ok(!validRatings({ ' ': 3 }));
  assert.strictEqual(averageRating({ a: 4, b: 5, c: 3 }), 4);
  assert.strictEqual(averageRating({ a: 4, b: 5 }), 4.5);
});

test('MCQ scoring counts exact matches and the candidate copy has no key', () => {
  const qs = [
    { id: 'q1', prompt: 'A', options: ['x', 'y'], answer: 1 },
    { id: 'q2', prompt: 'B', options: ['x', 'y'], answer: 0 },
    { id: 'q3', prompt: 'C', options: ['x', 'y'], answer: 0 },
  ];
  assert.deepStrictEqual(scoreMcq(qs, { q1: 1, q2: 1 }), { score: 1, max: 3 });
  assert.ok(stripAnswers(qs).every((q) => !('answer' in q)));
});

/* ---------------- throttling and vision ---------------- */

test('throttle drops repeats inside the window and lets them through after', () => {
  const allow = createThrottle({ paste: 3000 });
  assert.ok(allow('paste', 0));
  assert.ok(!allow('paste', 1000));
  assert.ok(!allow('paste', 2999));
  assert.ok(allow('paste', 3000));
  // Types without a window are never throttled.
  assert.ok(allow('tab_hidden', 0));
  assert.ok(allow('tab_hidden', 1));
});

test('throttle windows are per type', () => {
  const allow = createThrottle({ copy: 3000, paste: 3000 });
  assert.ok(allow('copy', 0));
  assert.ok(allow('paste', 100));
  assert.ok(!allow('copy', 200));
});

test('detections below threshold are ignored', () => {
  const r = readDetections([
    { class: 'person', score: 0.9 },
    { class: 'person', score: 0.3 },
    { class: 'cell phone', score: 0.5 },
    { class: 'cup', score: 0.99 },
  ]);
  assert.deepStrictEqual(r, { people: 1, phone: false });
  assert.deepStrictEqual(readDetections([{ class: 'cell phone', score: 0.8 }]), { people: 0, phone: true });
});

test('vision tracker needs consecutive samples before flagging', () => {
  const track = createVisionTracker(2);
  assert.deepStrictEqual(track({ people: 0, phone: false }), []);
  assert.deepStrictEqual(track({ people: 0, phone: false }), ['no_person']);
  assert.deepStrictEqual(track({ people: 1, phone: true }), []);
  assert.deepStrictEqual(track({ people: 2, phone: true }), ['phone_detected']);
  assert.deepStrictEqual(track({ people: 2, phone: false }), ['multiple_people']);
  assert.deepStrictEqual(track({ people: 1, phone: false }), []);
});

/* ---------------- integrity summary ---------------- */

const at = (s: number) => new Date(Date.UTC(2026, 9, 23, 10, 0, s)).toISOString();

test('summary counts flags by type and severity, ignoring informational events', () => {
  const events: ProctorEventLike[] = [
    { type: 'consent_given', occurred_at: at(0) },
    { type: 'session_start', occurred_at: at(1) },
    { type: 'paste', occurred_at: at(10) },
    { type: 'paste', occurred_at: at(20) },
    { type: 'phone_detected', occurred_at: at(30) },
    { type: 'copy', occurred_at: at(40) },
    { type: 'session_end', occurred_at: at(50) },
  ];
  const s = summarizeProctorEvents(events);
  assert.strictEqual(s.totalFlags, 4);
  assert.strictEqual(s.byType.paste, 2);
  assert.deepStrictEqual(s.bySeverity, { high: 1, medium: 2, low: 1 });
  assert.ok(s.consented);
  assert.ok(s.visionAvailable);
  assert.strictEqual(s.firstAt, at(0));
  assert.strictEqual(s.lastAt, at(50));
});

test('longest absence pairs hide with return and merges overlapping blur', () => {
  const events: ProctorEventLike[] = [
    { type: 'tab_hidden', occurred_at: at(10) },
    { type: 'window_blur', occurred_at: at(10) },
    { type: 'tab_visible', occurred_at: at(25) },
    { type: 'window_focus', occurred_at: at(26) },
    { type: 'tab_hidden', occurred_at: at(40) },
    { type: 'tab_visible', occurred_at: at(44) },
  ];
  const s = summarizeProctorEvents(events);
  assert.strictEqual(s.absences, 2);
  assert.strictEqual(s.longestAbsenceMs, 16_000);
  assert.strictEqual(s.totalAbsenceMs, 20_000);
});

test('an absence still open at session end is closed there', () => {
  const s = summarizeProctorEvents([
    { type: 'session_start', occurred_at: at(0) },
    { type: 'tab_hidden', occurred_at: at(5) },
    { type: 'session_end', occurred_at: at(35) },
  ]);
  assert.strictEqual(s.longestAbsenceMs, 30_000);
});

test('a return without its hide uses the duration it carries', () => {
  const s = summarizeProctorEvents([{ type: 'tab_visible', occurred_at: at(30), duration_ms: 12_000 }]);
  assert.strictEqual(s.longestAbsenceMs, 12_000);
  assert.strictEqual(s.absences, 1);
});

test('summary of nothing is empty, and order of input does not matter', () => {
  const empty = summarizeProctorEvents([]);
  assert.strictEqual(empty.totalFlags, 0);
  assert.strictEqual(empty.longestAbsenceMs, 0);
  assert.ok(!empty.consented);
  const shuffled = summarizeProctorEvents([
    { type: 'tab_visible', occurred_at: at(20) },
    { type: 'tab_hidden', occurred_at: at(5) },
  ]);
  assert.strictEqual(shuffled.longestAbsenceMs, 15_000);
});

test('vision_unavailable marks the camera checks as not run', () => {
  assert.ok(!summarizeProctorEvents([{ type: 'vision_unavailable', occurred_at: at(0) }]).visionAvailable);
});

test('durations format compactly', () => {
  assert.strictEqual(formatDuration(12_000), '12s');
  assert.strictEqual(formatDuration(245_000), '4m 05s');
  assert.strictEqual(formatDuration(3_780_000), '1h 03m');
});

test('scheduling inputs are read and written as India time', () => {
  assert.strictEqual(toIstInput('2026-10-23T05:30:00.000Z'), '2026-10-23T11:00');
  assert.strictEqual(fromIstInput('2026-10-23T11:00'), '2026-10-23T05:30:00.000Z');
  assert.strictEqual(fromIstInput('not a date'), null);
  // 20:00 UTC is already the next day in India.
  assert.strictEqual(istSlot(Date.parse('2026-10-23T20:00:00Z'), 1, 11), '2026-10-25T11:00');
  assert.strictEqual(shiftIstInput('2026-10-31T11:00', 1), '2026-11-01T11:00');
  const iso = '2026-12-01T09:15:00.000Z';
  assert.strictEqual(fromIstInput(toIstInput(iso)), iso);
});

test('upcoming counts scheduled rounds inside the window that have not ended', () => {
  const now = Date.parse('2026-10-23T10:00:00Z');
  const r = (h: number, status: 'scheduled' | 'cancelled' = 'scheduled') => ({
    status,
    scheduled_at: new Date(now + h * 3600_000).toISOString(),
    duration_min: 60,
  });
  assert.strictEqual(upcomingWithin([r(-2), r(-0.5), r(5), r(24 * 6), r(24 * 8), r(5, 'cancelled')], 7, now), 3);
});

if (failures) {
  console.error(`\n${failures} interview test(s) failed.`);
  process.exit(1);
}
console.log('All interview tests passed!');
