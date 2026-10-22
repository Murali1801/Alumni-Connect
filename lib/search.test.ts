import assert from 'assert';
import {
  clampLimit,
  clampOffset,
  emptyPage,
  groupOrder,
  inRankOrder,
  isSearchable,
  makeSnippet,
  normaliseQuery,
  parseBatch,
  parseSearchType,
  queryTerms,
  SEARCH_QUERY_MAX,
} from './search-shared';

// Run with: npx tsx lib/search.test.ts — exits non-zero on the first failure.

function runTests() {
  console.log('Running search.test.ts...');

  /* normaliseQuery */
  assert.strictEqual(normaliseQuery('  data   scientist\n mumbai '), 'data scientist mumbai');
  assert.strictEqual(normaliseQuery('a\u0000b\u0007c'), 'a b c');
  assert.strictEqual(normaliseQuery('!!! ---'), '', 'punctuation only is empty');
  assert.strictEqual(normaliseQuery(undefined), '');
  assert.strictEqual(normaliseQuery(42), '');
  assert.strictEqual(normaliseQuery('x'.repeat(500)).length, SEARCH_QUERY_MAX);
  assert.strictEqual(normaliseQuery('ｒｅａｃｔ'), 'react', 'full-width folds to ASCII');
  assert.strictEqual(normaliseQuery('"machine learning" -intern'), '"machine learning" -intern', 'search syntax survives');
  assert.strictEqual(normaliseQuery("'; drop table users; --"), "'; drop table users; --", 'kept as text: SQL never sees it as code');

  /* isSearchable */
  assert.strictEqual(isSearchable('ab'), true);
  assert.strictEqual(isSearchable('a'), false);
  assert.strictEqual(isSearchable('a!'), false);
  assert.strictEqual(isSearchable('c#'), false);
  assert.strictEqual(isSearchable('c++ go'), true);
  assert.strictEqual(isSearchable('हिंदी'), true, 'non-Latin letters count');

  /* params */
  assert.strictEqual(parseSearchType('people'), 'people');
  assert.strictEqual(parseSearchType('PEOPLE'), 'all');
  assert.strictEqual(parseSearchType(null), 'all');
  assert.strictEqual(clampLimit('7'), 7);
  assert.strictEqual(clampLimit('500'), 50);
  assert.strictEqual(clampLimit('0'), 20);
  assert.strictEqual(clampLimit('-3', 5), 5);
  assert.strictEqual(clampLimit('abc', 5, 10), 5);
  assert.strictEqual(clampLimit('12.9', 5, 10), 10);
  assert.strictEqual(clampOffset('40'), 40);
  assert.strictEqual(clampOffset('-1'), 0);
  assert.strictEqual(clampOffset('99999'), 1000);
  assert.strictEqual(parseBatch('2021'), 2021);
  assert.strictEqual(parseBatch('21'), null);
  assert.strictEqual(parseBatch('2021.5'), null);
  assert.strictEqual(parseBatch(null), null);

  /* queryTerms */
  assert.deepStrictEqual(queryTerms('React react, Node.js a'), ['react', 'node', 'js']);
  assert.deepStrictEqual(queryTerms('हिंदी notes'), ['हिंदी', 'notes'], 'combining marks stay inside words');

  /* makeSnippet */
  const short = 'Hiring two React interns in Pune.';
  assert.strictEqual(makeSnippet(short, 'react'), short, 'short text comes back whole');
  assert.strictEqual(makeSnippet(null, 'react'), '');
  const long =
    'We are a small team building payments infrastructure for co-operative banks across Maharashtra. ' +
    'Most of the work is backend services, reconciliation jobs and a fair amount of on-call. ' +
    'This opening is for a Kubernetes platform engineer who has run clusters in production. ' +
    'Freshers with strong Linux fundamentals are welcome to apply as well.';
  const s1 = makeSnippet(long, 'kubernetes', 120);
  assert.ok(s1.toLowerCase().includes('kubernetes'), 'snippet contains the match');
  assert.ok(s1.startsWith('…') && s1.endsWith('…'), 'mid-text snippet is marked on both sides');
  assert.ok(s1.length <= 122, 'snippet stays near the limit');
  const s2 = makeSnippet(long, 'payments', 120);
  assert.ok(s2.startsWith('We are'), 'early match leads with the opening');
  assert.ok(s2.endsWith('…'));
  const s3 = makeSnippet(long, 'nothing-matches', 100);
  assert.ok(s3.startsWith('We are') && s3.length <= 101, 'no match falls back to the opening');

  /* groupOrder */
  const page = (ranks: number[]) => ({ items: ranks.map((rank) => ({ rank })), total: ranks.length, limit: 5, offset: 0 });
  assert.deepStrictEqual(
    groupOrder({ people: page([0.2]), posts: page([0.9, 0.1]), jobs: page([]), companies: page([0.5]) }),
    ['posts', 'companies', 'people', 'jobs'],
    'strongest hit first, empty last'
  );
  assert.deepStrictEqual(
    groupOrder({ people: page([]), posts: page([]), jobs: page([]), companies: page([]) }),
    ['people', 'jobs', 'posts', 'companies'],
    'all empty keeps the fixed order'
  );
  assert.deepStrictEqual(
    groupOrder({ people: page([0.5]), posts: page([0.5]), jobs: page([0.5]), companies: page([0.5]) }),
    ['people', 'jobs', 'posts', 'companies'],
    'ties keep the fixed order'
  );

  /* inRankOrder */
  assert.deepStrictEqual(
    inRankOrder(['c', 'a', 'x', 'b'], [{ id: 'a' }, { id: 'b' }, { id: 'c' }]).map((r) => r.id),
    ['c', 'a', 'b'],
    'rank order kept, missing rows dropped'
  );

  assert.deepStrictEqual(emptyPage(5, 10), { items: [], total: 0, limit: 5, offset: 10 });

  console.log('All search tests passed!');
}

runTests();
