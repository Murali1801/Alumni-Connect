/**
 * Fits the student→alumnus match weights from real request outcomes.
 *
 * Each request is one example. Features are the raw match signals lib/matching.ts
 * computes today (company, role, skills, availability, location, each 0..1) from
 * the two current profiles; the label is whether the alumnus said yes:
 *   accepted or closed (done)           -> 1
 *   declined, or pending > 21 days old  -> 0
 *   pending and recent                  -> left out
 *
 * Logistic regression with an L2 penalty toward the hand-set weights (scaled to
 * logits), so a handful of outcomes can only nudge them. Requests involving
 * seeded demo or synthetic accounts are not real outcomes and never count
 * toward the fit; below MIN_REAL real examples the priors are kept and the JSON
 * says so. A diagnostic fit on all labelled requests (demo included) is printed
 * and recorded for transparency but not used.
 *
 *   npx tsx scripts/ml/train-match-weights.mjs            # fit and write
 *   npx tsx scripts/ml/train-match-weights.mjs --dry-run  # fit, print, don't write
 */
import { adminClient, selectAll, chunks, fitLogistic, logLoss, auc, round, writeModel, isSyntheticRecord, isDemoEmail, sigmoid } from './common.mjs';
import { scoreMatch } from '../../lib/matching.ts';

const DRY = process.argv.includes('--dry-run');
const MIN_REAL = 50;
const IGNORED_AFTER_DAYS = 21;
const KEYS = ['company', 'role', 'skills', 'availability', 'location'];
const PRIOR = { company: 0.35, role: 0.25, skills: 0.2, availability: 0.15, location: 0.05 };
// A perfect match on every signal moves the logit by this much under the prior.
const PRIOR_SCALE = 4;
const LAMBDA = 2;

const db = adminClient();
const requests = await selectAll(db, 'requests', 'id, student_id, alumni_id, type, status, created_at');
const userIds = [...new Set(requests.flatMap((r) => [r.student_id, r.alumni_id]))];

const users = new Map();
const students = new Map();
const alumni = new Map();
for (const part of chunks(userIds)) {
  const [u, s, a] = await Promise.all([
    db.from('users').select('id, email').in('id', part),
    db.from('student_profiles').select('user_id, branch, batch_year, skills, target_role, target_company, location_pref').in('user_id', part),
    db
      .from('alumni_profiles')
      .select(
        'user_id, designation, industry, location, skills, mentorship_available, mock_interview_available, referral_available, internship_available, ' +
          'current_company:companies!current_company_id(name, name_canonical), record:alumni_records!record_id(branch, batch_year, first_company_id, student_id)'
      )
      .in('user_id', part),
  ]);
  for (const err of [u.error, s.error, a.error]) if (err) throw new Error(err.message);
  u.data.forEach((x) => users.set(x.id, x));
  s.data.forEach((x) => students.set(x.user_id, x));
  a.data.forEach((x) => alumni.set(x.user_id, x));
}

const one = (v) => (Array.isArray(v) ? v[0] : v);
const now = Date.now();
const examples = [];
for (const r of requests) {
  let y;
  if (r.status === 'accepted' || r.status === 'closed') y = 1;
  else if (r.status === 'declined') y = 0;
  else if (now - new Date(r.created_at).getTime() > IGNORED_AFTER_DAYS * 86_400_000) y = 0;
  else continue;
  const student = students.get(r.student_id);
  const profile = alumni.get(r.alumni_id);
  if (!student || !profile) continue;
  const record = one(profile.record) ?? {};
  const result = scoreMatch(student, { alumni_profiles: { ...profile, current_company: one(profile.current_company) }, alumni_records: record }, r.type);
  const raw = Object.fromEntries(result.signals.map((s) => [s.key, s.raw]));
  const real =
    !isDemoEmail(users.get(r.student_id)?.email) && !isDemoEmail(users.get(r.alumni_id)?.email) && !isSyntheticRecord(record.student_id);
  examples.push({ x: KEYS.map((k) => raw[k] ?? 0), y, real });
}

const priorW = KEYS.map((k) => PRIOR[k] * PRIOR_SCALE);

function fitAndReport(rows, label) {
  if (!rows.length) return null;
  const X = rows.map((e) => e.x);
  const y = rows.map((e) => e.y);
  const base = y.reduce((a, b) => a + b, 0) / y.length;
  // Centre the prior intercept so a typical example sits at the observed accept rate.
  const meanPriorLogit = X.reduce((s, x) => s + x.reduce((a, v, j) => a + v * priorW[j], 0), 0) / X.length;
  const priorBias = Math.log(Math.max(1e-3, base) / Math.max(1e-3, 1 - base)) - meanPriorLogit;
  const fit = fitLogistic(X, y, { prior: priorW, priorBias, lambda: LAMBDA });

  // 5-fold cross-validated AUC of the fitted model vs the prior score.
  const folds = 5;
  const cvScores = new Array(rows.length);
  for (let f = 0; f < folds; f++) {
    const trainIdx = rows.map((_, i) => i).filter((i) => i % folds !== f);
    const m = fitLogistic(trainIdx.map((i) => X[i]), trainIdx.map((i) => y[i]), { prior: priorW, priorBias, lambda: LAMBDA, iters: 1500 });
    rows.forEach((_, i) => {
      if (i % folds === f) cvScores[i] = sigmoid(m.b + X[i].reduce((a, v, j) => a + v * m.w[j], 0));
    });
  }
  const priorScores = X.map((x) => x.reduce((a, v, j) => a + v * priorW[j], 0));
  const report = {
    n: rows.length,
    positives: y.filter(Boolean).length,
    accept_rate: round(base, 3),
    coef: Object.fromEntries(KEYS.map((k, j) => [k, round(fit.w[j], 4)])),
    intercept: round(fit.b, 4),
    log_loss: round(logLoss(X, y, fit.w, fit.b), 4),
    prior_auc: auc(priorScores, y) === null ? null : round(auc(priorScores, y), 3),
    cv_auc: auc(cvScores, y) === null ? null : round(auc(cvScores, y), 3),
    feature_means: Object.fromEntries(KEYS.map((k, j) => [k, round(X.reduce((s, x) => s + x[j], 0) / X.length, 3)])),
  };
  console.log(`${label}:`, report);
  return { fit, report };
}

const realRows = examples.filter((e) => e.real);
console.log(`Requests ${requests.length}; labelled ${examples.length}; real ${realRows.length} (need ${MIN_REAL} to fit)`);
const real = realRows.length ? fitAndReport(realRows, 'Real outcomes') : null;
const diagnostic = fitAndReport(examples, 'Diagnostic, all labelled (demo included, not used)');

let weights = { ...PRIOR };
let source = 'prior';
if (real && realRows.length >= MIN_REAL) {
  const pos = KEYS.map((_, j) => Math.max(0, real.fit.w[j]));
  const sum = pos.reduce((a, b) => a + b, 0);
  if (sum > 0) {
    weights = Object.fromEntries(KEYS.map((k, j) => [k, round(pos[j] / sum, 4)]));
    source = 'fitted';
  }
}

const out = {
  version: 1,
  source,
  weights,
  prior: PRIOR,
  n_examples: realRows.length,
  n_labelled_all: examples.length,
  min_examples: MIN_REAL,
  trained_at: new Date().toISOString(),
  label_rule: `accepted|closed = 1; declined or pending > ${IGNORED_AFTER_DAYS} days = 0`,
  regularisation: { kind: 'l2-to-prior', lambda: LAMBDA, prior_scale: PRIOR_SCALE },
  real: real?.report ?? null,
  diagnostic: diagnostic?.report ?? null,
  note:
    source === 'fitted'
      ? 'Weights are the positive logistic coefficients, normalised to sum to 1.'
      : `Only ${realRows.length} real request outcomes (requests from seeded demo or synthetic accounts are excluded), ` +
        `below the ${MIN_REAL} needed, so the hand-set priors are kept. The diagnostic fit uses seeded demo requests and is not used.`,
};

console.log(`Weights (${source}):`, weights);
if (DRY) console.log('Dry run: nothing written.');
else {
  const { file, bytes } = writeModel('match-weights.json', out);
  console.log(`Wrote ${file} (${bytes} bytes)`);
}
