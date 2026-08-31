import { scoreMatch, skillOverlap, roleOverlap, MatchSignal } from './matching';

// We mock a simple jest-like environment if run manually, or just use standard assert if it's node.
import assert from 'assert';

function runTests() {
  console.log('Running matching.test.ts...');

  // Test 1: skillOverlap
  assert.strictEqual(skillOverlap(['react', 'node'], ['node', 'express']), 1/3);
  assert.strictEqual(skillOverlap([], ['node']), 0);

  // Test 2: roleOverlap
  assert.strictEqual(roleOverlap('Software Engineer', 'Senior Software Engineer', 'Technology'), 1.0); // "software", "engineer"
  assert.strictEqual(roleOverlap('Product Manager', 'Software Engineer', 'Technology'), 0.0);

  // Test 3: scoreMatch Perfect
  const student = {
    branch: 'COMP',
    batch_year: 2024,
    target_company: 'Google',
    target_role: 'Software Engineer',
    skills: ['React', 'Node'],
    location_pref: 'Bangalore'
  };

  const alumnus1 = {
    alumni_records: { branch: 'COMP', batch_year: 2020 },
    alumni_profiles: {
      current_company: { name_canonical: 'google' },
      designation: 'Software Engineer',
      industry: 'Technology',
      skills: ['React', 'Node'],
      location: 'Bangalore',
      mentorship_available: true
    }
  };

  const res1 = scoreMatch(student, alumnus1, 'mentorship');
  assert.strictEqual(res1.score, 100);
  assert.strictEqual(res1.matchable, true);
  assert.strictEqual(res1.signals.reduce((acc, s) => acc + s.contribution, 0), 100);

  // Test 4: Dormant fallback
  const dormantAlumnus = {
    alumni_records: { branch: 'COMP', batch_year: 2024 }
  };
  const res2 = scoreMatch(student, dormantAlumnus, 'mentorship');
  assert.strictEqual(res2.matchable, false);
  assert.strictEqual(res2.score, 40); // Max possible is 40 for same branch + same year
  assert.strictEqual(res2.fallbackReason !== undefined, true);

  console.log('All matching tests passed!');
}

runTests();
