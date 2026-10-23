import assert from 'assert';
import { rankFeed, featurize, scorePost, FEATURES, MODEL, type RankablePost, type ViewerContext } from './feed-rank';

const NOW = Date.parse('2026-10-20T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

function post(id: string, over: Partial<RankablePost> = {}): RankablePost {
  return {
    id,
    author_id: `author-${id}`,
    created_at: hoursAgo(24),
    branch: null,
    batch_year: null,
    designation: null,
    like_count: 5,
    comment_count: 1,
    repost_count: 0,
    opportunity: null,
    original: null,
    ...over,
  };
}

const student: ViewerContext = {
  id: 'viewer',
  role: 'student',
  branch: 'COMP',
  batch_year: 2027,
  target_role: 'SDE',
  skills: ['React', 'JavaScript', 'Data Structures'],
  connections: new Set(['friend']),
  now: NOW,
};

function runTests() {
  console.log('Running feed-rank.test.ts...');

  // Every feature is present and finite, and roughly 0..1.
  const f = featurize(post('a'), student);
  for (const k of FEATURES) {
    assert.ok(Number.isFinite(f[k]), `${k} finite`);
    assert.ok(f[k] >= 0 && f[k] <= 1, `${k} in 0..1`);
  }
  assert.ok(MODEL.weights.closed_listing <= 0, 'closed listings are never a bonus');
  assert.ok(MODEL.weights.opportunity_relevance >= 0, 'relevance is never a penalty');

  // A relevant open internship beats a closed unrelated listing, even when the
  // closed one is newer and busier.
  const internship = post('internship', {
    created_at: hoursAgo(60),
    like_count: 3,
    comment_count: 0,
    opportunity: { type: 'internship', title: 'Software Engineering Intern', skills: ['React', 'JavaScript'], open: true },
  });
  const closedSite = post('closed-site', {
    created_at: hoursAgo(6),
    like_count: 40,
    comment_count: 6,
    opportunity: { type: 'job', title: 'Site Engineer', skills: ['AutoCAD', 'Site Supervision'], open: false },
  });
  const ranked = rankFeed([closedSite, internship], student);
  assert.strictEqual(ranked[0].post.id, 'internship', `got ${ranked.map((r) => `${r.post.id}:${r.score.toFixed(3)}`).join(', ')}`);
  assert.ok(ranked[0].features.opportunity_relevance > ranked[1].features.opportunity_relevance);
  assert.strictEqual(ranked[1].features.closed_listing, 1);

  // A past deadline counts as closed even if the listing wasn't closed by hand.
  const lapsed = post('lapsed', { opportunity: { type: 'job', title: 'Software Engineer', skills: [], open: true, deadline: '2026-10-01' } });
  assert.strictEqual(featurize(lapsed, student).closed_listing, 1);

  // Connection and cohort lift an otherwise identical post.
  const stranger = post('stranger');
  const friend = post('friend-post', { author_id: 'friend', branch: 'COMP', batch_year: 2025 });
  assert.ok(scorePost(friend, student) > scorePost(stranger, student));

  // Newer beats older, all else equal.
  assert.ok(scorePost(post('new', { created_at: hoursAgo(2) }), student) > scorePost(post('old', { created_at: hoursAgo(200) }), student));

  // A repost is judged by the opportunity it shares.
  const repost = post('repost', { original: internship });
  assert.ok(featurize(repost, student).opportunity_relevance > 0);

  // Ranking is deterministic and keeps every post exactly once.
  const many = Array.from({ length: 30 }, (_, i) =>
    post(`p${i}`, { author_id: i % 3 === 0 ? 'prolific' : `a${i}`, created_at: hoursAgo(i * 5), like_count: i })
  );
  const r1 = rankFeed(many, student).map((r) => r.post.id);
  const r2 = rankFeed(many, student).map((r) => r.post.id);
  assert.deepStrictEqual(r1, r2);
  assert.strictEqual(new Set(r1).size, many.length);

  // The diversity pass stops one author taking the top three slots.
  const flood = [
    ...Array.from({ length: 4 }, (_, i) => post(`f${i}`, { author_id: 'prolific', created_at: hoursAgo(1 + i) })),
    post('other', { created_at: hoursAgo(8) }),
  ];
  const top3 = rankFeed(flood, student).slice(0, 3).map((r) => r.post.author_id);
  assert.ok(top3.includes('author-other'), `top three: ${top3.join(', ')}`);

  console.log('All feed-rank tests passed!');
}

runTests();
