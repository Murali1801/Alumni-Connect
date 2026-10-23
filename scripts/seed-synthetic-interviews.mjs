/**
 * Interview pipelines between synthetic alumni (from seed-synthetic-alumni.mjs)
 * and the demo student (student1@v3.demo.com), so the Interviews pages have
 * something to show: upcoming rounds, one coding round open right now for a
 * proctoring demo, a pipeline waiting on results, and finished ones with
 * scorecards, submissions, proctoring timelines and released decisions.
 *
 * Every pipeline is owned by a synthetic alumnus, which is how --purge finds
 * them; deleting a pipeline cascades to its rounds, scorecards, submissions and
 * proctor events, and its trigger removes its notifications.
 *
 *   node scripts/seed-synthetic-interviews.mjs           # dry run
 *   node scripts/seed-synthetic-interviews.mjs --commit  # writes
 *   node scripts/seed-synthetic-interviews.mjs --purge   # removes them
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const COMMIT = process.argv.includes('--commit');
const PURGE = process.argv.includes('--purge');
const STUDENT_EMAIL = 'student1@v3.demo.com';

const env = Object.fromEntries(
  fs
    .readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const must = (res, what) => {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
};

/* ---------------- time helpers (IST wall clock) ---------------- */

const NOW = Date.now();
const DAY = 86_400_000;
/** `days` from today at hh:mm in India, as an ISO string. */
function ist(days, hh, mm = 0) {
  const today = new Date(NOW + 5.5 * 3600_000); // shift to IST to read the IST date
  const base = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), hh, mm) - 5.5 * 3600_000;
  return new Date(base + days * DAY).toISOString();
}
const plus = (iso, ms) => new Date(new Date(iso).getTime() + ms).toISOString();
const sec = (n) => n * 1000;
const min = (n) => n * 60_000;

/* ---------------- content ---------------- */

const APTITUDE = {
  instructions: 'One correct answer per question. No negative marking. Rough work on paper is fine.',
  questions: [
    { id: 'q1', prompt: 'A train 240 m long passes a pole in 12 seconds. What is its speed in km/h?', options: ['60', '72', '80', '84'], answer: 1 },
    { id: 'q2', prompt: 'What comes next: 2, 6, 12, 20, 30, ?', options: ['40', '42', '44', '48'], answer: 1 },
    { id: 'q3', prompt: 'A can finish a job in 12 days and B in 18 days. Working together, how many days do they take?', options: ['6', '7.2', '7.5', '8'], answer: 1 },
    { id: 'q4', prompt: 'A price rises by 20% and then falls by 20%. The net change is:', options: ['No change', '4% decrease', '4% increase', '2% decrease'], answer: 1 },
    { id: 'q5', prompt: 'If CODE is written as DPEF, how is BUG written?', options: ['CVH', 'CWH', 'AVF', 'CVG'], answer: 0 },
    { id: 'q6', prompt: 'The average of five numbers is 18. If one number is removed the average becomes 16. The removed number is:', options: ['22', '24', '26', '28'], answer: 2 },
    { id: 'q7', prompt: 'Which of these is a prime number?', options: ['91', '87', '97', '51'], answer: 2 },
    { id: 'q8', prompt: 'Simple interest on ₹8,000 at 6% a year for 3 years is:', options: ['₹1,280', '₹1,440', '₹1,520', '₹1,600'], answer: 1 },
    { id: 'q9', prompt: 'Pointing to a man, Riya says, “His mother is the only daughter of my mother.” How is Riya related to the man?', options: ['Sister', 'Aunt', 'Mother', 'Grandmother'], answer: 2 },
    { id: 'q10', prompt: 'A clock shows 3:15. What is the angle between the hour and minute hands?', options: ['0°', '7.5°', '15°', '22.5°'], answer: 1 },
  ],
};

const CS_MCQ = {
  instructions: 'Fundamentals check. 20 minutes is plenty; do not rush the last three.',
  questions: [
    { id: 'c1', prompt: 'What is the worst-case time complexity of quicksort?', options: ['O(n log n)', 'O(n²)', 'O(n)', 'O(log n)'], answer: 1 },
    { id: 'c2', prompt: 'Which data structure gives O(1) average lookup by key?', options: ['Binary search tree', 'Linked list', 'Hash table', 'Heap'], answer: 2 },
    { id: 'c3', prompt: 'In SQL, which clause filters groups after aggregation?', options: ['WHERE', 'HAVING', 'GROUP BY', 'ORDER BY'], answer: 1 },
    { id: 'c4', prompt: 'Which HTTP status code means “Not Found”?', options: ['301', '403', '404', '500'], answer: 2 },
    { id: 'c5', prompt: 'A process waiting for I/O is in which state?', options: ['Running', 'Ready', 'Blocked', 'Terminated'], answer: 2 },
    { id: 'c6', prompt: 'Which of these is not a JavaScript primitive?', options: ['string', 'symbol', 'object', 'bigint'], answer: 2 },
  ],
};

const CODING_LONGEST = {
  problem:
    'Longest substring without repeating characters\n\nGiven a string s, return the length of the longest substring that contains no repeated character.\n\nExamples\n  "abcabcbb" → 3  ("abc")\n  "bbbbb"    → 1\n  "pwwkew"   → 3  ("wke")\n\nConstraints: 0 ≤ s.length ≤ 50,000. Aim for O(n). Talk through your approach in comments.',
  language: 'javascript',
  starter: 'function lengthOfLongestSubstring(s) {\n  \n}\n',
};

const CODING_INTERVALS = {
  problem:
    'Merge overlapping intervals\n\nGiven an array of intervals [start, end], merge all overlapping intervals and return the result sorted by start.\n\nExample\n  [[1,3],[2,6],[8,10],[15,18]] → [[1,6],[8,10],[15,18]]\n\nState the time and space complexity of your solution.',
  language: 'python',
  starter: 'def merge(intervals):\n    pass\n',
};

const CODING_TWOSUM = {
  problem:
    'Pair with target sum\n\nGiven an array of integers nums and an integer target, return the indices of the two numbers that add up to target. Exactly one answer exists; you may not use the same element twice.\n\nExample\n  nums = [2, 7, 11, 15], target = 9 → [0, 1]\n\nBonus: what changes if the array is sorted?',
  language: 'java',
  starter: 'class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        \n    }\n}\n',
};

const CODE_INTERVALS_ANSWER = `def merge(intervals):
    # Sort by start so overlapping intervals sit next to each other.
    intervals.sort(key=lambda x: x[0])
    merged = []
    for start, end in intervals:
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return merged

# Time: O(n log n) for the sort, O(n) for the pass.
# Space: O(n) for the output.
`;

/* ---------------- proctor timelines ---------------- */

/** Events for a round that ran from `start` for `mins`, with the given incidents. */
function timeline(start, mins, incidents = [], endReason = 'submitted') {
  const ev = [
    { type: 'consent_given', at: plus(start, sec(5)) },
    { type: 'session_start', at: plus(start, sec(6)), detail: { fullscreen: true, width: 1536, height: 864 } },
    { type: 'fullscreen_enter', at: plus(start, sec(7)) },
  ];
  for (const i of incidents) {
    const at = plus(start, i.at);
    if (i.type === 'away') {
      ev.push({ type: 'window_blur', at });
      ev.push({ type: 'tab_hidden', at: plus(at, 200) });
      ev.push({ type: 'tab_visible', at: plus(at, i.ms), duration_ms: i.ms - 200 });
      ev.push({ type: 'window_focus', at: plus(at, i.ms + 100), duration_ms: i.ms + 100 });
    } else if (i.type === 'fullscreen_exit') {
      ev.push({ type: 'fullscreen_exit', at });
      ev.push({ type: 'fullscreen_enter', at: plus(at, i.ms ?? sec(20)) });
    } else {
      ev.push({ type: i.type, at, detail: i.detail ?? {} });
    }
  }
  ev.push({ type: 'session_end', at: plus(start, min(mins) - sec(30)), detail: { reason: endReason } });
  return ev;
}

/* ---------------- main ---------------- */

async function main() {
  const [student] = must(await db.from('users').select('id, full_name').eq('email', STUDENT_EMAIL).limit(1), 'demo student');
  if (!student) throw new Error(`${STUDENT_EMAIL} not found`);

  const records = must(
    await db
      .from('alumni_records')
      .select('student_id, claimed_by, full_name, alumni_profiles(designation, current_company:companies!current_company_id(name))')
      .like('student_id', 'SYNTH_%')
      .not('claimed_by', 'is', null),
    'synthetic alumni'
  );
  const synthetic = new Map(
    records.map((r) => {
      const p = Array.isArray(r.alumni_profiles) ? r.alumni_profiles[0] : r.alumni_profiles;
      const company = Array.isArray(p?.current_company) ? p.current_company[0] : p?.current_company;
      return [r.student_id, { id: r.claimed_by, name: r.full_name, designation: p?.designation, company: company?.name ?? null }];
    })
  );
  const ids = [...synthetic.values()].map((s) => s.id);
  console.log(`${synthetic.size} synthetic alumni; demo student ${student.full_name}.`);

  const existing = [];
  for (let i = 0; i < ids.length; i += 100) {
    const part = must(
      await db.from('interviews').select('id').eq('candidate_id', student.id).in('interviewer_id', ids.slice(i, i + 100)),
      'existing'
    );
    existing.push(...part.map((r) => r.id));
  }

  if (PURGE) {
    if (existing.length) must(await db.from('interviews').delete().in('id', existing), 'purge');
    console.log(`Removed ${existing.length} synthetic interview pipelines (rounds, scorecards, submissions, proctor events and notifications with them).`);
    return;
  }
  if (existing.length) {
    console.log(`${existing.length} synthetic interviews already exist. Run with --purge first to regenerate.`);
    return;
  }

  const pick = (sid) => {
    const p = synthetic.get(sid);
    if (!p) throw new Error(`${sid} is missing — run seed-synthetic-alumni.mjs first`);
    return p;
  };
  const accenture = pick('SYNTH_0003');
  const zomato = pick('SYNTH_0033');
  const icici = pick('SYNTH_0014');
  const icici_hr = pick('SYNTH_0011');
  const lti = pick('SYNTH_0016');
  const ubifly = pick('SYNTH_0021');

  /** Each pipeline: interview fields, rounds, and what happened in them. */
  const pipelines = [
    {
      owner: accenture,
      createdDaysAgo: 9,
      interview: {
        title: 'Associate Software Engineer — 2027 graduates',
        company: accenture.company,
        description:
          'Three rounds for the campus hiring track. The aptitude round is done; the coding round is a single problem in the language of your choice, then a short conversation with HR.',
      },
      rounds: [
        {
          title: 'Aptitude', kind: 'mcq', at: ist(-6, 16), duration_min: 30, content: APTITUDE, interviewer: accenture,
          status: 'completed', outcome: 'passed', release: true, candidate_response: 'accepted',
          submission: { answers: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 0, q6: 2, q7: 2, q8: 3, q9: 2, q10: 0 } },
          scorecard: { ratings: { Fundamentals: 4, Accuracy: 4, 'Time management': 5 }, recommendation: 'yes', notes: 'Finished in 21 minutes. Two slips on interest and clock angles, both arithmetic.', feedback: 'Strong aptitude round — 8 of 10. Watch the arithmetic on interest questions.' },
          events: [{ type: 'window_blur', at: min(9) }, { type: 'window_focus', at: min(9) + sec(3), duration_ms: sec(3) }],
        },
        { title: 'Technical — coding', kind: 'coding', at: ist(2, 11), duration_min: 60, content: CODING_LONGEST, interviewer: accenture, candidate_response: 'accepted' },
        { title: 'HR', kind: 'video', at: ist(5, 15, 30), duration_min: 30, interviewer: accenture },
      ],
    },
    {
      owner: zomato,
      createdDaysAgo: 2,
      interview: {
        title: 'SDE Intern — Summer 2027',
        company: zomato.company,
        description:
          'A take-home style coding round you can start now, then a short fundamentals quiz. Both are proctored in the browser; read the consent screen before you start.',
      },
      rounds: [
        // Opened by the interviewer, so the demo student can walk straight in.
        { title: 'Coding — warm-up', kind: 'coding', at: ist(0, 9), duration_min: 45, content: CODING_TWOSUM, interviewer: zomato, status: 'in_progress', candidate_response: 'accepted' },
        { title: 'CS fundamentals', kind: 'mcq', at: ist(3, 17), duration_min: 20, content: CS_MCQ, interviewer: zomato },
      ],
    },
    {
      owner: icici,
      createdDaysAgo: 24,
      decision: { decision: 'selected', note: 'Congratulations — we would like to offer you the Graduate Engineer Trainee role. HR will write with the offer letter and joining date this week.' },
      interview: {
        title: 'Graduate Engineer Trainee — Technology',
        company: icici.company,
        description: 'Aptitude, a technical conversation on SQL and data modelling, and an HR round with a panel member.',
      },
      rounds: [
        {
          title: 'Aptitude', kind: 'mcq', at: ist(-20, 10), duration_min: 30, content: APTITUDE, interviewer: icici,
          status: 'completed', outcome: 'passed', release: true, candidate_response: 'accepted',
          submission: { answers: { q1: 1, q2: 1, q3: 1, q4: 1, q5: 0, q6: 2, q7: 2, q8: 1, q9: 2, q10: 1 } },
          scorecard: { ratings: { Fundamentals: 5, Accuracy: 5, 'Time management': 4 }, recommendation: 'strong_yes', notes: 'Full marks.', feedback: '10 of 10. Excellent.' },
          events: [{ type: 'copy', at: min(4) }],
        },
        {
          title: 'Technical interview', kind: 'video', at: ist(-15, 14), duration_min: 45, interviewer: icici,
          status: 'completed', outcome: 'passed', release: true, candidate_response: 'accepted',
          scorecard: { ratings: { Communication: 4, 'Technical depth': 4, 'Problem solving': 5, 'Culture fit': 4 }, recommendation: 'yes', notes: 'Normalised a messy schema on the spot and explained the trade-off of denormalising for reporting. Shaky on window functions.', feedback: 'Clear thinking on data modelling. Spend a week on SQL window functions — they will come up again.' },
          events: [
            { type: 'away', at: min(12), ms: sec(14) },
            { type: 'paste', at: min(20), detail: { characters: 38 } },
            { type: 'away', at: min(31), ms: sec(41) },
          ],
        },
        {
          title: 'HR', kind: 'video', at: ist(-12, 16), duration_min: 30, interviewer: icici_hr,
          status: 'completed', outcome: 'passed', release: true, candidate_response: 'accepted',
          scorecard: { ratings: { Communication: 5, 'Culture fit': 5 }, recommendation: 'strong_yes', notes: 'Relocation to Mumbai is fine. Expectations in band.', feedback: 'Great conversation — thank you.' },
          events: [],
        },
      ],
    },
    {
      owner: lti,
      createdDaysAgo: 18,
      decision: { decision: 'rejected', note: 'Thank you for your time. We are not moving forward this cycle. The coding round was solid; the technical interview did not give us enough to go on. You are welcome to apply again in six months.' },
      interview: {
        title: 'Software Engineer — Digital Engineering',
        company: lti.company,
        description: 'A coding round, then a technical interview on your project work.',
      },
      rounds: [
        {
          title: 'Coding', kind: 'coding', at: ist(-14, 11), duration_min: 60, content: CODING_INTERVALS, interviewer: lti,
          status: 'completed', outcome: 'passed', release: true, candidate_response: 'accepted',
          submission: { code: CODE_INTERVALS_ANSWER, language: 'python' },
          scorecard: { ratings: { Correctness: 5, 'Code quality': 4, 'Problem solving': 4, Communication: 3 }, recommendation: 'yes', notes: 'Correct first time, sensible comments.', feedback: 'Clean, correct solution with the right complexity.' },
          events: [{ type: 'context_menu', at: min(7) }, { type: 'fullscreen_exit', at: min(26), ms: sec(35) }],
        },
        {
          title: 'Technical interview', kind: 'video', at: ist(-10, 15), duration_min: 45, interviewer: lti,
          status: 'completed', outcome: 'failed', release: true, candidate_response: 'accepted',
          scorecard: { ratings: { Communication: 2, 'Technical depth': 2, 'Problem solving': 3, 'Culture fit': 3 }, recommendation: 'no', notes: 'Long pauses before answers and eyes repeatedly down and to the left. Proctoring flagged a phone twice and a second person once; I asked and the candidate said a sibling came in. Not holding that against them on its own, but the answers on their own project were thin.', feedback: 'Prepare to explain your own project end to end — the design choices, what broke, and what you would change.' },
          events: [
            { type: 'phone_detected', at: min(8) },
            { type: 'away', at: min(14), ms: min(3) + sec(5) },
            { type: 'multiple_people', at: min(22), detail: { people: 2 } },
            { type: 'phone_detected', at: min(29) },
            { type: 'no_person', at: min(33) },
          ],
        },
      ],
    },
    {
      owner: ubifly,
      createdDaysAgo: 6,
      interview: {
        title: 'Embedded Systems Engineer',
        company: ubifly.company,
        description: 'Two conversations: embedded C and microcontrollers first, then a design discussion with the hardware lead.',
      },
      rounds: [
        {
          title: 'Embedded C and microcontrollers', kind: 'video', at: ist(-3, 12), duration_min: 45, interviewer: ubifly,
          status: 'completed', outcome: 'passed', candidate_response: 'accepted',
          scorecard: { ratings: { Communication: 4, 'Technical depth': 4, 'Problem solving': 3, 'Culture fit': 4 }, recommendation: 'yes', notes: 'Good on interrupts and volatile; weaker on RTOS scheduling. Worth a second round.', feedback: 'Solid fundamentals on interrupts and memory-mapped I/O.' },
          events: [{ type: 'away', at: min(18), ms: sec(9) }],
        },
        {
          title: 'Design discussion', kind: 'video', at: ist(1, 10), duration_min: 45, interviewer: ubifly,
          candidate_response: 'reschedule_requested', reschedule_note: 'I have a university practical exam that morning. Any time after 2 pm on the same day, or Friday, works.',
        },
      ],
    },
  ];

  const roundCount = pipelines.reduce((s, p) => s + p.rounds.length, 0);
  console.log(`Plan: ${pipelines.length} pipelines, ${roundCount} rounds.`);
  for (const p of pipelines) console.log(`  · ${p.interview.title} (${p.owner.name}) — ${p.rounds.map((r) => `${r.title}:${r.status ?? 'scheduled'}`).join(', ')}`);
  if (!COMMIT) {
    console.log('Dry run. Re-run with --commit to write.');
    return;
  }

  let events = 0;
  for (const p of pipelines) {
    // Created now, then backdated: round inserts within a minute of the pipeline
    // are covered by its one notification rather than one each.
    const [iv] = must(
      await db
        .from('interviews')
        .insert({ candidate_id: student.id, interviewer_id: p.owner.id, ...p.interview })
        .select('id'),
      'interview'
    );

    const roundRows = must(
      await db
        .from('interview_rounds')
        .insert(
          p.rounds.map((r, i) => {
            const done = r.status === 'completed';
            return {
              interview_id: iv.id,
              position: i + 1,
              title: r.title,
              kind: r.kind,
              scheduled_at: r.at,
              duration_min: r.duration_min,
              interviewer_id: r.interviewer.id,
              status: r.status ?? 'scheduled',
              outcome: r.outcome ?? 'pending',
              candidate_response: r.candidate_response ?? 'pending',
              reschedule_note: r.reschedule_note ?? null,
              proctored: true,
              content: r.content ?? {},
              started_at: done ? plus(r.at, sec(5)) : null,
              ended_at: done ? plus(r.at, min(r.duration_min) - sec(30)) : null,
            };
          })
        )
        .select('id, position'),
      'rounds'
    );
    const roundId = (i) => roundRows.find((x) => x.position === i + 1).id;

    for (const [i, r] of p.rounds.entries()) {
      const id = roundId(i);
      if (r.submission) {
        let score = null;
        let max = null;
        if (r.kind === 'mcq') {
          max = r.content.questions.length;
          score = r.content.questions.filter((q) => r.submission.answers[q.id] === q.answer).length;
        }
        must(
          await db.from('interview_submissions').insert({
            round_id: id,
            candidate_id: student.id,
            code: r.submission.code ?? null,
            language: r.submission.language ?? null,
            answers: r.submission.answers ?? {},
            score,
            max_score: max,
            submitted_at: plus(r.at, min(r.duration_min) - min(4)),
            updated_at: plus(r.at, min(r.duration_min) - min(4)),
          }),
          'submission'
        );
      }
      if (r.scorecard) {
        must(
          await db.from('interview_scorecards').insert({
            round_id: id,
            reviewer_id: r.interviewer.id,
            ...r.scorecard,
            created_at: plus(r.at, min(r.duration_min + 20)),
            updated_at: plus(r.at, min(r.duration_min + 20)),
          }),
          'scorecard'
        );
      }
      if (r.events) {
        const rows = timeline(r.at, r.duration_min, r.events, r.kind === 'video' ? 'left the call' : 'submitted').map((e) => ({
          round_id: id,
          interview_id: iv.id,
          candidate_id: student.id,
          type: e.type,
          occurred_at: e.at,
          duration_ms: e.duration_ms ?? null,
          detail: e.detail ?? {},
          received_at: plus(e.at, 1500),
        }));
        must(await db.from('proctor_events').insert(rows), 'proctor events');
        events += rows.length;
      }
      // Released as an update, so the result notification fires as it would in the app.
      if (r.release) {
        must(await db.from('interview_rounds').update({ released_at: plus(r.at, min(r.duration_min + 30)) }).eq('id', id), 'release');
      }
    }

    const done = p.rounds.every((r) => r.status === 'completed');
    must(
      await db
        .from('interviews')
        .update({
          status: done ? 'completed' : 'active',
          created_at: new Date(NOW - p.createdDaysAgo * DAY).toISOString(),
          ...(p.decision
            ? { decision: p.decision.decision, decision_note: p.decision.note, decision_released_at: new Date(NOW - 3 * DAY).toISOString() }
            : {}),
        })
        .eq('id', iv.id),
      'finish interview'
    );
    console.log(`  created ${p.interview.title}`);
  }
  console.log(`Done: ${pipelines.length} pipelines, ${roundCount} rounds, ${events} proctor events.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
