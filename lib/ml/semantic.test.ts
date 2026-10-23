import assert from 'assert';
import { embed, similarity, relatedness, tokenize, closest, DIM } from './semantic';
import model from './models/semantic.json';

function runTests() {
  console.log('Running semantic.test.ts...');

  // Placement-sheet shorthand expands to the same tokens as the long form.
  assert.deepStrictEqual(tokenize('Sr. Software Engg'), tokenize('Senior Software Engineer'));
  assert.deepStrictEqual(tokenize('SDE'), tokenize('Software Development Engineer'));
  assert.deepStrictEqual(tokenize('GET'), tokenize('Graduate Engineer Trainee'));
  assert.deepStrictEqual(tokenize('Asst. System Engg'), tokenize('Assistant System Engineer'));
  assert.deepStrictEqual(tokenize('Jr. Developer'), tokenize('Junior Developer'));
  assert.deepStrictEqual(tokenize('S/W Developer'), tokenize('Software Developer'));
  assert.deepStrictEqual(tokenize('Node.js'), tokenize('NodeJS'));
  assert.deepStrictEqual(tokenize(''), []);

  // Embeddings: right size, unit length (or zero), deterministic.
  const e1 = embed('Software Developer');
  const e2 = embed('Software Developer');
  assert.strictEqual(e1.length, DIM);
  assert.strictEqual(DIM, (model as { dim: number }).dim);
  assert.deepStrictEqual(Array.from(e1), Array.from(e2));
  const n = Math.hypot(...Array.from(e1));
  assert.ok(Math.abs(n - 1) < 1e-4, `unit length, got ${n}`);
  assert.ok(Array.from(embed('qwertyuiop zxcvb')).every((v) => v === 0), 'unknown words embed to zero');

  // Similarity is symmetric, in 0..1 and 1 for identical text.
  const pairs: [string, string][] = [['Software Developer', 'Site Engineer'], ['React', 'AutoCAD'], ['Data Analyst', 'Business Analyst']];
  for (const [a, b] of pairs) {
    const s = similarity(a, b);
    assert.ok(s >= 0 && s <= 1, `${a}/${b} in range`);
    assert.ok(Math.abs(s - similarity(b, a)) < 1e-6, 'symmetric');
  }
  assert.strictEqual(similarity('Kotlin Wizard', 'kotlin wizard'), 1, 'identical text is 1 even out of vocabulary');

  // The orderings the matcher relies on.
  const gt = (a: string, b: string, c: string) =>
    assert.ok(similarity(a, b) > similarity(a, c), `"${a}": "${b}" ${similarity(a, b).toFixed(2)} should beat "${c}" ${similarity(a, c).toFixed(2)}`);
  gt('Software Developer', 'Software Engineer', 'Site Engineer');
  gt('Trainee Software Engg', 'Associate Software Engineer', 'Site Engg');
  gt('SDE', 'Software Engineer', 'Structural Engineer');
  gt('Frontend Developer', 'React', 'AutoCAD');
  gt('Data Analyst', 'Business Analyst', 'Site Engineer');
  gt('Site Engineer', 'Civil Engineer', 'Software Engineer');
  gt('Embedded Engineer', 'Microcontrollers', 'Excel');
  gt('DevOps Engineer', 'Kubernetes', 'Revit');

  // relatedness is calibrated: unrelated families score 0, near-synonyms high.
  assert.strictEqual(relatedness('AutoCAD', 'React'), 0);
  assert.strictEqual(relatedness('Product Manager', 'Software Engineer'), 0);
  assert.ok(relatedness('Software Developer', 'Software Engineer') >= 0.5);
  assert.ok(relatedness('React', 'Frontend') >= 0.5);

  assert.strictEqual(closest('Frontend Developer', ['AutoCAD', 'React', 'Excel'])?.value, 'React');
  assert.strictEqual(closest('Frontend Developer', ['AutoCAD', 'Revit']), null);

  console.log('All semantic tests passed!');
}

runTests();
