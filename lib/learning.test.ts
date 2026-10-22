import assert from 'assert';
import {
  byPosition,
  courseScore,
  flattenLessons,
  isPermutation,
  isRoomPath,
  moveItem,
  normaliseTags,
  parseInline,
  parseLessonText,
  pickResumeLesson,
  positionsFor,
  progressPercent,
  publicQuiz,
  quizProblem,
  scoreQuiz,
  videoEmbed,
  type QuizQuestion,
} from './learning-shared';

let failures = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (err) {
    failures++;
    console.error(`  FAIL ${name}\n       ${(err as Error).message}`);
  }
}

console.log('Running learning.test.ts...');

test('progressPercent rounds and clamps', () => {
  assert.strictEqual(progressPercent(0, 0), 0);
  assert.strictEqual(progressPercent(3, 1), 33);
  assert.strictEqual(progressPercent(3, 2), 67);
  assert.strictEqual(progressPercent(4, 4), 100);
  assert.strictEqual(progressPercent(4, 9), 100);
});

test('pickResumeLesson: fresh course starts at the first lesson', () => {
  assert.strictEqual(pickResumeLesson(['a', 'b', 'c'], [], null), 'a');
});

test('pickResumeLesson: reopens an unfinished last lesson', () => {
  assert.strictEqual(pickResumeLesson(['a', 'b', 'c'], ['a'], 'c'), 'c');
});

test('pickResumeLesson: moves past a finished last lesson', () => {
  assert.strictEqual(pickResumeLesson(['a', 'b', 'c', 'd'], ['a', 'b'], 'b'), 'c');
});

test('pickResumeLesson: wraps to the first gap when everything after is done', () => {
  assert.strictEqual(pickResumeLesson(['a', 'b', 'c'], new Set(['a', 'c']), 'c'), 'b');
});

test('pickResumeLesson: finished course reopens the last lesson viewed', () => {
  assert.strictEqual(pickResumeLesson(['a', 'b', 'c'], ['a', 'b', 'c'], 'b'), 'b');
  assert.strictEqual(pickResumeLesson(['a', 'b', 'c'], ['a', 'b', 'c'], null), 'a');
});

test('pickResumeLesson: a deleted last lesson falls back to the first gap', () => {
  assert.strictEqual(pickResumeLesson(['a', 'b'], ['a'], 'gone'), 'b');
  assert.strictEqual(pickResumeLesson([], [], null), null);
});

const quiz: QuizQuestion[] = [
  { prompt: 'Binary search on a sorted array of n items runs in?', options: ['O(n)', 'O(log n)', 'O(1)'], correct: 1, explanation: 'Halves the range.' },
  { prompt: 'A stack is', options: ['FIFO', 'LIFO'], correct: 1 },
  { prompt: 'SQL keyword to filter groups', options: ['WHERE', 'HAVING', 'ORDER BY'], correct: 1 },
];

test('scoreQuiz counts right answers and rounds the score', () => {
  const r = scoreQuiz(quiz, [1, 1, 0]);
  assert.strictEqual(r.correct, 2);
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.score, 67);
  assert.deepStrictEqual(r.answers.map((a) => a.right), [true, true, false]);
  assert.strictEqual(r.answers[0].explanation, 'Halves the range.');
  assert.strictEqual(r.answers[1].explanation, '');
});

test('scoreQuiz treats missing and out-of-range answers as wrong', () => {
  const r = scoreQuiz(quiz, [7, null]);
  assert.strictEqual(r.correct, 0);
  assert.strictEqual(r.score, 0);
  assert.deepStrictEqual(r.answers.map((a) => a.chosen), [null, null, null]);
  assert.strictEqual(scoreQuiz(quiz, [1, 1, 1]).score, 100);
  assert.strictEqual(scoreQuiz([], []).score, 0);
});

test('publicQuiz never carries the answers', () => {
  const pub = publicQuiz(quiz);
  assert.strictEqual(pub.length, 3);
  for (const q of pub) {
    assert.ok(!('correct' in q));
    assert.ok(!('explanation' in q));
  }
});

test('quizProblem catches unusable quizzes', () => {
  assert.strictEqual(quizProblem(quiz), null);
  assert.ok(quizProblem([]));
  assert.ok(quizProblem([{ prompt: 'x', options: ['only'], correct: 0 }]));
  assert.ok(quizProblem([{ prompt: 'x', options: ['a', 'A'], correct: 0 }]));
  assert.ok(quizProblem([{ prompt: 'x', options: ['a', 'b'], correct: 2 }]));
  assert.ok(quizProblem([{ prompt: ' ', options: ['a', 'b'], correct: 0 }]));
});

test('courseScore averages quiz scores and ignores missing ones', () => {
  assert.strictEqual(courseScore([]), null);
  assert.strictEqual(courseScore([null, undefined]), null);
  assert.strictEqual(courseScore([100, 50, null]), 75);
  assert.strictEqual(courseScore([67, 100, 100]), 89);
});

test('byPosition and flattenLessons give reading order', () => {
  const modules = [
    { id: 'm2', position: 1, lessons: [{ id: 'l4', position: 0 }] },
    { id: 'm1', position: 0, lessons: [{ id: 'l2', position: 1 }, { id: 'l1', position: 0 }, { id: 'l3', position: 1, created_at: '2026-01-02' }] },
  ];
  assert.deepStrictEqual(flattenLessons(modules).map((l) => l.id), ['l1', 'l2', 'l3', 'l4']);
  assert.deepStrictEqual(byPosition([{ id: 'b', position: 0 }, { id: 'a', position: 0 }]).map((x) => x.id), ['a', 'b']);
});

test('moveItem swaps neighbours and ignores impossible moves', () => {
  assert.deepStrictEqual(moveItem(['a', 'b', 'c'], 'b', -1), ['b', 'a', 'c']);
  assert.deepStrictEqual(moveItem(['a', 'b', 'c'], 'b', 1), ['a', 'c', 'b']);
  assert.deepStrictEqual(moveItem(['a', 'b', 'c'], 'a', -1), ['a', 'b', 'c']);
  assert.deepStrictEqual(moveItem(['a', 'b', 'c'], 'c', 1), ['a', 'b', 'c']);
  assert.deepStrictEqual(moveItem(['a'], 'z', 1), ['a']);
});

test('positionsFor and isPermutation', () => {
  assert.deepStrictEqual(positionsFor(['x', 'y']), [{ id: 'x', position: 0 }, { id: 'y', position: 1 }]);
  assert.ok(isPermutation(['b', 'a'], ['a', 'b']));
  assert.ok(!isPermutation(['a', 'a'], ['a', 'b']));
  assert.ok(!isPermutation(['a'], ['a', 'b']));
  assert.ok(!isPermutation(['a', 'c'], ['a', 'b']));
});

test('normaliseTags trims and de-duplicates', () => {
  assert.deepStrictEqual(normaliseTags(' SQL, sql ,  Power  BI,,'), ['SQL', 'Power BI']);
  assert.strictEqual(normaliseTags(['a', 'b', 'c'], 2).length, 2);
});

test('parseLessonText builds safe blocks', () => {
  const blocks = parseLessonText('## Arrays\nAn array stores\nitems in order.\n\n- O(1) access\n- O(n) insert\n1. First\n2. Second\n\n```\nint a[5];\n```\n<b>not html</b>');
  assert.deepStrictEqual(blocks, [
    { kind: 'heading', text: 'Arrays' },
    { kind: 'paragraph', text: 'An array stores items in order.' },
    { kind: 'bullets', items: ['O(1) access', 'O(n) insert'] },
    { kind: 'numbers', items: ['First', 'Second'] },
    { kind: 'code', text: 'int a[5];' },
    { kind: 'paragraph', text: '<b>not html</b>' },
  ]);
});

test('parseInline finds bold and code only', () => {
  assert.deepStrictEqual(parseInline('Use **HAVING** after `GROUP BY`.'), [
    { kind: 'text', text: 'Use ' },
    { kind: 'bold', text: 'HAVING' },
    { kind: 'text', text: ' after ' },
    { kind: 'code', text: 'GROUP BY' },
    { kind: 'text', text: '.' },
  ]);
});

test('videoEmbed uses privacy-enhanced players', () => {
  assert.deepStrictEqual(videoEmbed('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), {
    provider: 'youtube',
    src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0',
  });
  assert.strictEqual(videoEmbed('https://youtu.be/dQw4w9WgXcQ')?.provider, 'youtube');
  assert.strictEqual(videoEmbed('https://vimeo.com/76979871')?.src, 'https://player.vimeo.com/video/76979871?dnt=1');
  assert.strictEqual(videoEmbed('http://youtube.com/watch?v=dQw4w9WgXcQ'), null);
  assert.strictEqual(videoEmbed('https://example.com/video.mp4'), null);
  assert.strictEqual(videoEmbed('not a url'), null);
});

test('isRoomPath accepts call rooms and https links only', () => {
  assert.ok(isRoomPath('/call/abc123'));
  assert.ok(isRoomPath('https://meet.example.com/x'));
  assert.ok(!isRoomPath('/call/../admin'));
  assert.ok(!isRoomPath('javascript:alert(1)'));
});

if (failures) {
  console.error(`${failures} learning test(s) failed.`);
  process.exit(1);
}
console.log('All learning tests passed!');
