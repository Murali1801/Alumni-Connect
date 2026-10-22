import { scoreMatch, skillOverlap, roleOverlap, sharedSkills, WEIGHTS } from './matching';

// We mock a simple jest-like environment if run manually, or just use standard assert if it's node.
import assert from 'assert';

function runTests() {
  console.log('Running matching.test.ts...');

  // Test 1: skillOverlap. Exact sharing is plain Jaccard; related skills only add to it.
  assert.ok(skillOverlap(['react', 'node'], ['node', 'express']) >= 1 / 3);
  assert.strictEqual(skillOverlap(['Java', 'SQL'], ['java', 'Kotlin Multiplatform Thing']), 1 / 3);
  assert.strictEqual(skillOverlap([], ['node']), 0);
  assert.strictEqual(skillOverlap(['AutoCAD', 'STAAD Pro'], ['React', 'Node.js']), 0);
  assert.ok(skillOverlap(['React', 'TypeScript'], ['Next.js', 'JavaScript']) > 0, 'related web skills earn partial credit');
  assert.ok(
    skillOverlap(['React', 'TypeScript'], ['Next.js', 'JavaScript']) < skillOverlap(['React', 'TypeScript'], ['React', 'TypeScript']),
    'related never beats identical'
  );
  const shared = sharedSkills(['React', 'SQL'], ['react', 'JavaScript']);
  assert.deepStrictEqual(shared.exact, ['React']);

  // Test 2: roleOverlap
  assert.strictEqual(roleOverlap('Software Engineer', 'Senior Software Engineer', 'Technology'), 1.0); // "software", "engineer"
  assert.strictEqual(roleOverlap('Product Manager', 'Software Engineer', 'Technology'), 0.0);
  assert.ok(roleOverlap('Software Developer', 'Software Engineer', null) >= 0.5, 'developer ~ engineer');
  assert.ok(roleOverlap('SDE', 'Software Development Engg', null) >= 0.8, 'placement-sheet abbreviations expand');
  assert.ok(
    roleOverlap('Software Engineer', 'Software Developer', null) > roleOverlap('Software Engineer', 'Site Engineer', null),
    'shared "engineer" alone is not a role match'
  );
  assert.strictEqual(roleOverlap(null, 'Software Engineer', null), 0);

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
  assert.ok(Math.abs(res1.signals.reduce((acc, s) => acc + s.contribution, 0) - 100) <= 2);
  assert.ok(Math.abs(Object.values(WEIGHTS).reduce((a, b) => a + b, 0) - 1) < 1e-9, 'weights sum to 1');

  // Test 4: Dormant fallback
  const dormantAlumnus = {
    alumni_records: { branch: 'COMP', batch_year: 2024 }
  };
  const res2 = scoreMatch(student, dormantAlumnus, 'mentorship');
  assert.strictEqual(res2.matchable, false);
  assert.strictEqual(res2.score, 40); // Max possible is 40 for same branch + same year
  assert.strictEqual(res2.fallbackReason !== undefined, true);

  // Test 5: semantic matching ranks a developer above a site engineer for an SDE target.
  const sdeStudent = { ...student, target_company: null, target_role: 'SDE', skills: ['React', 'TypeScript', 'SQL'] };
  const dev = {
    alumni_profiles: { designation: 'Software Developer', industry: 'Information Technology', skills: ['Next.js', 'JavaScript', 'PostgreSQL'], location: 'Pune' }
  };
  const site = {
    alumni_profiles: { designation: 'Site Engineer', industry: 'Construction & Infrastructure', skills: ['AutoCAD', 'Site Supervision'], location: 'Pune' }
  };
  const a = scoreMatch(sdeStudent, dev, 'mentorship');
  const b = scoreMatch(sdeStudent, site, 'mentorship');
  assert.ok(a.score > b.score, `developer ${a.score} should outrank site engineer ${b.score}`);
  const roleSignal = a.signals.find((s) => s.key === 'role')!;
  assert.ok(roleSignal.raw > 0 && roleSignal.detail.length > 0, 'role signal stays explainable');
  assert.strictEqual(b.signals.find((s) => s.key === 'skills')!.raw, 0);

  console.log('All matching tests passed!');
}

runTests();
