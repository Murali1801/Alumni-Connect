/**
 * Fits the "Top" feed ranker (lib/ml/feed-rank.ts) from feed interactions.
 *
 * Positives: a member's first reaction, comment or repost on a post, featurised
 * as of that moment (the post's age and engagement then, not now).
 * Negatives: for each positive, NEG_PER_POS posts from the same member's feed
 * window (created in the WINDOW_DAYS before the interaction) that they never
 * touched. That approximates "seen and skipped"; there is no impression log.
 *
 * Logistic regression with an L2 penalty toward the hand-set weights in
 * lib/ml/feed-rank.ts, plus sign constraints from the prior (relevance can't
 * become a penalty, a closed listing can't become a bonus). When most
 * interactions come from synthetic accounts the penalty is strong, so the fit
 * stays near the prior; the JSON records the share and the split metrics.
 *
 *   npx tsx scripts/ml/train-feed-ranker.mjs            # fit and write
 *   npx tsx scripts/ml/train-feed-ranker.mjs --dry-run  # fit, print, don't write
 */
import { adminClient, selectAll, chunks, prng, fitLogistic, logLoss, auc, round, writeModel, isSyntheticRecord, isDemoEmail } from './common.mjs';
import { FEATURES, featurize, PRIOR_MODEL } from '../../lib/ml/feed-rank.ts';

const DRY = process.argv.includes('--dry-run');
const NEG_PER_POS = 2;
const WINDOW_DAYS = 14;
const LAMBDA_SYNTHETIC = 1;
const LAMBDA_REAL = 0.05;
const MAX_POSITIVES = 15000;
const rand = prng(7);

const db = adminClient();
const [posts, likes, comments, users, connections] = await Promise.all([
  selectAll(
    db,
    'post_feed',
    'id, author_id, created_at, branch, batch_year, designation, repost_of, opportunity_id, opportunity_type, opportunity_title, target_skills, opportunity_open, deadline'
  ),
  selectAll(db, 'post_likes', 'post_id, user_id, created_at'),
  selectAll(db, 'post_comments', 'post_id, author_id, created_at'),
  selectAll(db, 'users', 'id, role, email'),
  selectAll(db, 'connections', 'requester_id, addressee_id', (q) => q.eq('status', 'accepted')),
]);

/* ------------------------------ members ------------------------------ */

const role = new Map(users.map((u) => [u.id, u.role]));
const email = new Map(users.map((u) => [u.id, u.email]));
const friends = new Map();
for (const c of connections) {
  for (const [a, b] of [[c.requester_id, c.addressee_id], [c.addressee_id, c.requester_id]]) {
    if (!friends.has(a)) friends.set(a, new Set());
    friends.get(a).add(b);
  }
}

// Interactions: [post, member, time, weight-for-engagement].
const events = [
  ...likes.map((l) => [l.post_id, l.user_id, new Date(l.created_at).getTime(), 1]),
  ...comments.map((c) => [c.post_id, c.author_id, new Date(c.created_at).getTime(), 2]),
  ...posts.filter((p) => p.repost_of).map((p) => [p.repost_of, p.author_id, new Date(p.created_at).getTime(), 2]),
];

const viewerIds = [...new Set(events.map((e) => e[1]))];
const profiles = new Map();
for (const part of chunks(viewerIds)) {
  const [a, s] = await Promise.all([
    db.from('alumni_profiles').select('user_id, designation, skills, record:alumni_records!record_id(branch, batch_year, student_id)').in('user_id', part),
    db.from('student_profiles').select('user_id, branch, batch_year, skills, target_role').in('user_id', part),
  ]);
  if (a.error || s.error) throw new Error((a.error ?? s.error).message);
  for (const x of a.data) {
    const rec = Array.isArray(x.record) ? x.record[0] : x.record;
    profiles.set(x.user_id, { branch: rec?.branch ?? null, batch_year: rec?.batch_year ?? null, target_role: x.designation, skills: x.skills ?? [], synthetic: isSyntheticRecord(rec?.student_id) });
  }
  for (const x of s.data) profiles.set(x.user_id, { branch: x.branch, batch_year: x.batch_year, target_role: x.target_role, skills: x.skills ?? [], synthetic: false });
}
const isSyntheticMember = (id) => isDemoEmail(email.get(id)) || !!profiles.get(id)?.synthetic;

/* ------------------------------ posts as the ranker sees them ------------------------------ */

const byId = new Map();
for (const p of posts) {
  byId.set(p.id, {
    id: p.id,
    author_id: p.author_id,
    created_at: p.created_at,
    t: new Date(p.created_at).getTime(),
    branch: p.branch,
    batch_year: p.batch_year,
    designation: p.designation,
    like_count: 0,
    comment_count: 0,
    repost_count: 0,
    repost_of: p.repost_of,
    opportunity: p.opportunity_id
      ? { type: p.opportunity_type, title: p.opportunity_title ?? '', skills: p.target_skills ?? [], open: p.opportunity_open !== false, deadline: p.deadline }
      : null,
    original: null,
  });
}
for (const p of byId.values()) if (p.repost_of) p.original = byId.get(p.repost_of) ?? null;

// Engagement timeline per post, to read "how busy was it at time t" without leaking the label.
const timeline = new Map();
for (const [postId, , t, w] of events) {
  if (!timeline.has(postId)) timeline.set(postId, []);
  timeline.get(postId).push([t, w]);
}
for (const list of timeline.values()) list.sort((a, b) => a[0] - b[0]);
function engagementBefore(postId, t) {
  let s = 0;
  for (const [ti, w] of timeline.get(postId) ?? []) {
    if (ti >= t) break;
    s += w;
  }
  return s;
}

/* ------------------------------ examples ------------------------------ */

const firstTouch = new Map(); // "viewer|post" -> time
for (const [postId, member, t] of events) {
  const key = `${member}|${postId}`;
  if (!firstTouch.has(key) || firstTouch.get(key) > t) firstTouch.set(key, t);
}
const touched = new Map();
for (const key of firstTouch.keys()) {
  const [m, p] = key.split('|');
  if (!touched.has(m)) touched.set(m, new Set());
  touched.get(m).add(p);
}

const sortedPosts = [...byId.values()].sort((a, b) => a.t - b.t);
let positives = [...firstTouch.entries()];
// Fisher-Yates with the seeded PRNG, then cap, so reruns pick the same sample.
for (let i = positives.length - 1; i > 0; i--) {
  const j = Math.floor(rand() * (i + 1));
  [positives[i], positives[j]] = [positives[j], positives[i]];
}
positives = positives.slice(0, MAX_POSITIVES);

function viewerAt(id, t) {
  const p = profiles.get(id) ?? { branch: null, batch_year: null, target_role: null, skills: [] };
  return { id, role: role.get(id) ?? 'alumni', ...p, connections: friends.get(id) ?? new Set(), now: t };
}

const rows = [];
let syntheticEvents = 0;
for (const [key, t] of positives) {
  const [viewerId, postId] = key.split('|');
  const post = byId.get(postId);
  if (!post || !role.has(viewerId)) continue;
  if (isSyntheticMember(viewerId)) syntheticEvents++;
  const viewer = viewerAt(viewerId, t);
  const subjectId = post.opportunity || !post.original ? post.id : post.original.id;
  rows.push({ viewerId, x: FEATURES.map((f) => featurize(post, viewer, engagementBefore(subjectId, t))[f]), y: 1 });

  // Candidates the member could have seen at t and didn't touch.
  const lo = t - WINDOW_DAYS * 86_400_000;
  const window = sortedPosts.filter((p) => p.t >= lo && p.t < t && !touched.get(viewerId)?.has(p.id));
  for (let k = 0; k < NEG_PER_POS && window.length; k++) {
    const neg = window[Math.floor(rand() * window.length)];
    const negSubject = neg.opportunity || !neg.original ? neg.id : neg.original.id;
    rows.push({ viewerId, x: FEATURES.map((f) => featurize(neg, viewer, engagementBefore(negSubject, t))[f]), y: 0 });
  }
}

/* ------------------------------ fit ------------------------------ */

// Hold out a fifth of members (not of rows), so the test set is people the fit never saw.
const hash = (s) => [...s].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);
const train = rows.filter((r) => Math.abs(hash(r.viewerId)) % 5 !== 0);
const test = rows.filter((r) => Math.abs(hash(r.viewerId)) % 5 === 0);

const syntheticShare = positives.length ? syntheticEvents / positives.length : 1;
const lambda = syntheticShare > 0.5 ? LAMBDA_SYNTHETIC : LAMBDA_REAL;
const prior = FEATURES.map((f) => PRIOR_MODEL.weights[f]);
const X = train.map((r) => r.x);
const y = train.map((r) => r.y);
const base = y.reduce((a, b) => a + b, 0) / Math.max(1, y.length);
const fit = fitLogistic(X, y, { prior, priorBias: Math.log(base / (1 - base)), lambda, lr: 0.5, iters: 1500 });
const unconstrained = [...fit.w];
// Sign constraints: a feature may shrink to zero but not flip against the prior.
fit.w = fit.w.map((w, j) => (prior[j] >= 0 ? Math.max(0, w) : Math.min(0, w)));

const score = (w, b) => (r) => b + r.x.reduce((a, v, j) => a + v * w[j], 0);
const priorBias = Math.log(base / (1 - base));
const metrics = {
  train_rows: train.length,
  test_rows: test.length,
  test_auc_prior: round(auc(test.map(score(prior, priorBias)), test.map((r) => r.y)) ?? NaN, 4),
  test_auc_fitted: round(auc(test.map(score(fit.w, fit.b)), test.map((r) => r.y)) ?? NaN, 4),
  test_log_loss_fitted: round(logLoss(test.map((r) => r.x), test.map((r) => r.y), fit.w, fit.b), 4),
};
// What the data alone would say, for comparison (weak penalty, no sign constraint).
const free = fitLogistic(X, y, { prior: prior.map(() => 0), priorBias, lambda: 0.001, lr: 0.5, iters: 1500 });
metrics.test_auc_data_only = round(auc(test.map(score(free.w, free.b)), test.map((r) => r.y)) ?? NaN, 4);

const out = {
  version: 1,
  source: syntheticShare > 0.5 ? 'prior-dominated' : 'fitted',
  weights: Object.fromEntries(FEATURES.map((f, j) => [f, round(fit.w[j], 4)])),
  bias: round(fit.b, 4),
  author_repeat_decay: PRIOR_MODEL.author_repeat_decay,
  prior: PRIOR_MODEL.weights,
  data_only_weights: Object.fromEntries(FEATURES.map((f, j) => [f, round(free.w[j], 4)])),
  unconstrained_weights: Object.fromEntries(FEATURES.map((f, j) => [f, round(unconstrained[j], 4)])),
  n_positives: rows.filter((r) => r.y === 1).length,
  n_negatives: rows.filter((r) => r.y === 0).length,
  n_members: new Set(rows.map((r) => r.viewerId)).size,
  synthetic_interaction_share: round(syntheticShare, 4),
  regularisation: { kind: 'l2-to-prior', lambda, sign_constrained: true },
  sampling: { negatives_per_positive: NEG_PER_POS, window_days: WINDOW_DAYS, max_positives: MAX_POSITIVES },
  metrics,
  trained_at: new Date().toISOString(),
  note:
    syntheticShare > 0.5
      ? `${Math.round(syntheticShare * 100)}% of interactions come from synthetic accounts whose reactions were assigned at random by the seed script, ` +
        'so they say little about relevance. The fit is held close to the hand-set prior (strong L2, sign constraints); ' +
        'retrain once real members have been reacting for a few weeks.'
      : 'Fitted on real interactions with a light pull toward the prior.',
};

console.log(`Interactions ${events.length}; positives used ${out.n_positives}, negatives ${out.n_negatives}, members ${out.n_members}`);
console.log(`Synthetic share ${(syntheticShare * 100).toFixed(1)}% -> lambda ${lambda}`);
console.log('Metrics:', metrics);
console.log('Weights:', out.weights, 'bias', out.bias);
console.log('Data-only:', out.data_only_weights);
if (DRY) console.log('Dry run: nothing written.');
else {
  const { file, bytes } = writeModel('feed-ranker.json', out);
  console.log(`Wrote ${file} (${bytes} bytes)`);
}
