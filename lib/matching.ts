import matchModel from './ml/models/match-weights.json';
import { GENERIC, relatedness, tokenize } from './ml/semantic';

export type MatchSignal = {
  key: 'company' | 'role' | 'skills' | 'availability' | 'location';
  label: string;
  weight: number;
  raw: number;        // 0..1
  contribution: number; // raw * weight * 100, rounded
  detail: string;     // human-readable, shown in the UI
};

export type MatchResult = {
  score: number;          // 0..100
  signals: MatchSignal[];
  matchable: boolean;     // false when the alumnus has no claimed profile
  fallbackReason?: string;
};

type WeightKey = MatchSignal['key'];

// Hand-set priors. scripts/ml/train-match-weights.mjs fits real request
// outcomes around these and writes lib/ml/models/match-weights.json; with too
// few real outcomes it keeps them as they are.
const PRIOR_WEIGHTS: Record<WeightKey, number> = {
  company: 0.35,
  role: 0.25,
  skills: 0.20,
  availability: 0.15,
  location: 0.05,
};

/** Trained weights when the JSON is usable, normalised to sum to 1 so scores stay 0..100. */
function loadWeights(): Record<WeightKey, number> {
  const w = (matchModel as { weights?: Partial<Record<WeightKey, number>> }).weights ?? {};
  const keys = Object.keys(PRIOR_WEIGHTS) as WeightKey[];
  const vals = keys.map((k) => (Number.isFinite(w[k]) && (w[k] as number) >= 0 ? (w[k] as number) : PRIOR_WEIGHTS[k]));
  const sum = vals.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return PRIOR_WEIGHTS;
  return Object.fromEntries(keys.map((k, i) => [k, vals[i] / sum])) as Record<WeightKey, number>;
}

export const WEIGHTS = loadWeights();

// A related-but-different skill is worth half a shared one, and only once the
// model is fairly sure they belong together.
const RELATED_CREDIT = 0.5;
const RELATED_MIN = 0.5;

const norm = (s: string) => s.trim().toLowerCase();
const sameSkill = (a: string, b: string) => {
  if (norm(a) === norm(b)) return true;
  const ta = tokenize(a).join(' ');
  return !!ta && ta === tokenize(b).join(' ');
};

/** Per-skill credit against the other list: 1 for the same skill, partial for a related one. */
function bestCredit(skill: string, others: string[]): { credit: number; with: string | null } {
  let best = { credit: 0, with: null as string | null };
  for (const o of others) {
    if (sameSkill(skill, o)) return { credit: 1, with: o };
    const r = relatedness(skill, o);
    if (r >= RELATED_MIN && r * RELATED_CREDIT > best.credit) best = { credit: r * RELATED_CREDIT, with: o };
  }
  return best;
}

const uniqueSkills = (list: string[]) => {
  const seen = new Set<string>();
  return list.filter((s) => s && s.trim() && !seen.has(norm(s)) && seen.add(norm(s)));
};

/**
 * Soft Jaccard over skill tags: shared skills count 1, semantically related
 * ones (React and Next.js, STAAD Pro and ETABS) count partially. With no
 * related pairs it is exactly the Jaccard index.
 */
export function skillOverlap(a: string[], b: string[]): number {
  const A = uniqueSkills(a);
  const B = uniqueSkills(b);
  if (!A.length || !B.length) return 0;
  const fromA = A.reduce((s, x) => s + bestCredit(x, B).credit, 0);
  const fromB = B.reduce((s, x) => s + bestCredit(x, A).credit, 0);
  const inter = (fromA + fromB) / 2;
  return Math.min(1, inter / (A.length + B.length - inter));
}

/** Which of `mine` the other side shares outright, and which it has a close relative of. */
export function sharedSkills(mine: string[], theirs: string[]): { exact: string[]; related: { mine: string; theirs: string }[] } {
  const exact: string[] = [];
  const related: { mine: string; theirs: string }[] = [];
  const T = uniqueSkills(theirs);
  for (const s of uniqueSkills(mine)) {
    const best = bestCredit(s, T);
    if (best.credit === 1) exact.push(s);
    else if (best.with) related.push({ mine: s, theirs: best.with });
  }
  return { exact, related };
}

/**
 * How close an alumnus' work is to the student's target role, 0..1: the best
 * of exact word overlap, the semantic model on the designation, and (weaker)
 * on their industry and skills, so "Tech Lead" with React and TypeScript still
 * reads as related to a "Frontend Developer" target.
 */
export function roleOverlap(
  target: string | null,
  designation: string | null,
  industry: string | null,
  skills: string[] = []
): number {
  if (!target) return 0;
  const t = [...new Set(tokenize(target))].filter((w) => !GENERIC.has(w));
  if (!t.length && !tokenize(target).length) return 0;
  const have = new Set([...tokenize(designation), ...tokenize(industry)]);
  const lexical = t.length ? t.filter((w) => have.has(w)).length / t.length : 0;
  const semantic = Math.max(
    designation ? relatedness(target, designation) : 0,
    industry ? 0.5 * relatedness(target, industry) : 0,
    skills.length ? 0.5 * relatedness(target, skills.join(' ')) : 0
  );
  return Math.round(Math.max(lexical, semantic) * 100) / 100;
}

const list = (xs: string[], n = 3) => xs.slice(0, n).join(', ');

export function scoreMatch(
  student: any,
  alumnus: any,
  requestType: 'mentorship' | 'mock_interview' | 'internship' | 'referral'
): MatchResult {
  const profile = alumnus.alumni_profiles;
  const record = alumnus.alumni_records || alumnus; // Handle nested or flat record

  if (!profile) {
    // Dormant-record fallback
    let cohortProximity = 0;
    if (student.batch_year && record.batch_year) {
      const branchScore = record.branch === student.branch ? 1 : 0;
      const batchDiff = Math.abs(record.batch_year - student.batch_year);
      cohortProximity = 0.6 * branchScore + 0.4 * Math.max(0, 1 - batchDiff / 10);
    }
    const score = Math.round(cohortProximity * 100);
    return {
      matchable: false,
      score: Math.min(score, 40), // Capped at 40
      signals: [],
      fallbackReason: "This alumnus hasn't claimed their profile yet. Ranking uses branch and batch only."
    };
  }

  const signals: MatchSignal[] = [];
  let totalScore = 0;
  const push = (key: WeightKey, label: string, raw: number, detail: string) => {
    const contribution = Math.round(raw * WEIGHTS[key] * 100);
    totalScore += contribution;
    signals.push({ key, label, weight: Math.round(WEIGHTS[key] * 1000) / 1000, raw, contribution, detail });
  };

  // 1. Company
  let companyRaw = 0;
  let companyDetail = 'No company match';

  if (student.target_company) {
    const targetCompStr = student.target_company.trim().toLowerCase();
    const currCompName = profile.current_company?.name_canonical || profile.current_company?.name;
    const firstCompId = record.first_company_id;

    // For MVP, we simply string match the target_company against the canonical company name if ID is unavailable
    if (currCompName && currCompName.toLowerCase().includes(targetCompStr)) {
      companyRaw = 1.0;
      companyDetail = 'Exact match with current employer';
    } else if (firstCompId) {
      // If we joined company name for first_company, we'd check it here.
      // For now, if the student typed an ID that matches or the name matches
      companyRaw = 0.5;
      companyDetail = 'Matched first employer (at graduation)';
    }
  }
  push('company', 'Company Match', companyRaw, companyDetail);

  // 2. Role
  const rOverlap = roleOverlap(student.target_role, profile.designation, profile.industry, profile.skills || []);
  push(
    'role',
    'Role Match',
    rOverlap,
    rOverlap >= 0.8
      ? `Works as ${profile.designation ?? 'a professional'}, close to your target role`
      : rOverlap > 0
        ? `Related to ${student.target_role}${profile.designation ? `: works as ${profile.designation}` : ''}`
        : 'No role overlap'
  );

  // 3. Skills
  const sOverlap = skillOverlap(student.skills || [], profile.skills || []);
  const shared = sharedSkills(student.skills || [], profile.skills || []);
  const skillDetail = [
    shared.exact.length ? `Shared: ${list(shared.exact)}` : '',
    shared.related.length ? `Related: ${list(shared.related.map((r) => `${r.mine} ~ ${r.theirs}`), 2)}` : '',
  ].filter(Boolean).join('; ');
  push('skills', 'Skill Match', sOverlap, sOverlap > 0 ? skillDetail || 'Overlapping technical skills' : 'No shared skills');

  // 4. Availability
  const availKey = `${requestType}_available`;
  const isAvailable = profile[availKey] ? 1.0 : 0.0;
  push('availability', 'Availability', isAvailable, isAvailable ? 'Available for this request type' : 'Not explicitly available');

  // 5. Location
  let locMatch = 0.0;
  if (student.location_pref && profile.location) {
    if (student.location_pref.trim().toLowerCase() === profile.location.trim().toLowerCase()) {
      locMatch = 1.0;
    }
  }
  push('location', 'Location', locMatch, locMatch > 0 ? 'Location preferences match' : 'Different locations');

  return {
    // Trained weights need not round to exactly 100 at the top end.
    score: Math.min(100, totalScore),
    signals,
    matchable: true
  };
}
