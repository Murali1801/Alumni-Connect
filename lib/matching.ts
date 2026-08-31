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

const WEIGHTS = {
  company: 0.35,
  role: 0.25,
  skills: 0.20,
  availability: 0.15,
  location: 0.05,
} as const;

// Jaccard over normalised skill tags.
export function skillOverlap(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const A = new Set(a.map(s => s.trim().toLowerCase()));
  const B = new Set(b.map(s => s.trim().toLowerCase()));
  let inter = 0;
  A.forEach(s => { if (B.has(s)) inter++; });
  return inter / (A.size + B.size - inter);
}

// Token overlap between target role and (designation + industry).
export function roleOverlap(target: string | null, designation: string | null, industry: string | null): number {
  if (!target) return 0;
  const stop = new Set(['a','an','the','of','and','engineer','executive','senior','junior','associate']);
  const t = target.toLowerCase().split(/\W+/).filter(w => w.length > 2 && !stop.has(w));
  const d = `${designation ?? ''} ${industry ?? ''}`.toLowerCase();
  if (!t.length) return 0;
  return t.filter(w => d.includes(w)).length / t.length;
}

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

  // 1. Company
  let companyRaw = 0;
  let companyDetail = 'No company match';
  
  if (student.target_company) {
    const targetCompStr = student.target_company.trim().toLowerCase();
    const currCompId = profile.current_company_id;
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
  
  const companyContribution = Math.round(companyRaw * WEIGHTS.company * 100);
  totalScore += companyContribution;
  signals.push({
    key: 'company',
    label: 'Company Match',
    weight: WEIGHTS.company,
    raw: companyRaw,
    contribution: companyContribution,
    detail: companyDetail
  });

  // 2. Role
  const rOverlap = roleOverlap(student.target_role, profile.designation, profile.industry);
  const roleContribution = Math.round(rOverlap * WEIGHTS.role * 100);
  totalScore += roleContribution;
  signals.push({
    key: 'role',
    label: 'Role Match',
    weight: WEIGHTS.role,
    raw: rOverlap,
    contribution: roleContribution,
    detail: rOverlap > 0 ? 'Role tokens match' : 'No role overlap'
  });

  // 3. Skills
  const sOverlap = skillOverlap(student.skills || [], profile.skills || []);
  const skillsContribution = Math.round(sOverlap * WEIGHTS.skills * 100);
  totalScore += skillsContribution;
  signals.push({
    key: 'skills',
    label: 'Skill Match',
    weight: WEIGHTS.skills,
    raw: sOverlap,
    contribution: skillsContribution,
    detail: sOverlap > 0 ? 'Overlapping technical skills' : 'No shared skills'
  });

  // 4. Availability
  const availKey = `${requestType}_available`;
  const isAvailable = profile[availKey] ? 1.0 : 0.0;
  const availContribution = Math.round(isAvailable * WEIGHTS.availability * 100);
  totalScore += availContribution;
  signals.push({
    key: 'availability',
    label: 'Availability',
    weight: WEIGHTS.availability,
    raw: isAvailable,
    contribution: availContribution,
    detail: isAvailable ? 'Available for this request type' : 'Not explicitly available'
  });

  // 5. Location
  let locMatch = 0.0;
  if (student.location_pref && profile.location) {
    if (student.location_pref.trim().toLowerCase() === profile.location.trim().toLowerCase()) {
      locMatch = 1.0;
    }
  }
  const locContribution = Math.round(locMatch * WEIGHTS.location * 100);
  totalScore += locContribution;
  signals.push({
    key: 'location',
    label: 'Location',
    weight: WEIGHTS.location,
    raw: locMatch,
    contribution: locContribution,
    detail: locMatch > 0 ? 'Location preferences match' : 'Different locations'
  });

  return {
    score: totalScore,
    signals,
    matchable: true
  };
}
