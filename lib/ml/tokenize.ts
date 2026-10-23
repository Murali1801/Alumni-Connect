/**
 * Text normalisation shared by the semantic model's trainer and its runtime, so
 * a title is tokenised the same way when the model learns it and when it is
 * scored. No imports: scripts/ml/train-semantic-model.mjs loads this file too.
 *
 * Placement sheets are full of abbreviations ("Trainee Software Engg", "GET",
 * "Asst. System Engg", "S/W Developer"), so those are expanded first, then
 * words are reduced to a crude stem so "developer" / "development" and
 * "analyst" / "analysis" land on one token.
 */

// Whole-word expansions, applied to lower-cased text before splitting.
const ABBREVIATIONS: [RegExp, string][] = [
  [/\bs\/w\b/g, 'software'],
  [/\bh\/w\b/g, 'hardware'],
  [/\bn\/w\b/g, 'network'],
  [/\bc\+\+/g, 'cpp'],
  [/\bc#/g, 'csharp'],
  [/(^|\s)\.net\b/g, '$1dotnet'],
  [/\bnode\.?js\b/g, 'nodejs'],
  [/\bnext\.?js\b/g, 'nextjs'],
  [/\breact\.?js\b/g, 'react'],
  [/\bvue\.?js\b/g, 'vue'],
  [/\bexpress\.?js\b/g, 'express'],
  [/\bfull[\s-]?stack\b/g, 'fullstack'],
  [/\bfront[\s-]?end\b/g, 'frontend'],
  [/\bback[\s-]?end\b/g, 'backend'],
  [/\bdev[\s-]?ops\b/g, 'devops'],
  [/\bui\s*\/\s*ux\b/g, 'ui ux'],
  [/\bstaad[\s.]*pro\b/g, 'staad'],
  [/\bpower\s*bi\b/g, 'powerbi'],
  [/\bspring\s*boot\b/g, 'spring'],
  [/\bmachine\s+learning\b/g, 'ml'],
  [/\bartificial\s+intelligence\b/g, 'ai'],
  [/\bgen\s*ai\b/g, 'genai'],
];

// Single-token expansions (after splitting). Indian placement-sheet shorthand.
const EXPAND: Record<string, string> = {
  engg: 'engineer',
  engr: 'engineer',
  eng: 'engineer',
  get: 'graduate engineer trainee',
  gte: 'graduate trainee engineer',
  gat: 'graduate apprentice trainee',
  sde: 'software development engineer',
  swe: 'software engineer',
  sse: 'senior software engineer',
  ase: 'associate software engineer',
  sr: 'senior',
  jr: 'junior',
  asst: 'assistant',
  assoc: 'associate',
  mgr: 'manager',
  mngr: 'manager',
  exec: 'executive',
  dev: 'developer',
  devs: 'developer',
  qa: 'quality assurance',
  qc: 'quality control',
  dba: 'database administrator',
  sysadmin: 'system administrator',
  admin: 'administrator',
  sw: 'software',
  hw: 'hardware',
  nw: 'network',
  infra: 'infrastructure',
  mech: 'mechanical',
  elec: 'electrical',
  extc: 'electronics telecommunication',
  entc: 'electronics telecommunication',
  telecom: 'telecommunication',
  ece: 'electronics communication',
  cse: 'computer science',
  comp: 'computer',
  it: 'information technology',
  bi: 'business intelligence',
  // Recurring misspellings in the institutional sheet.
  node: 'nodejs',
  js: 'javascript',
  k8s: 'kubernetes',
  sofware: 'software',
  softwear: 'software',
  enginner: 'engineer',
  enginer: 'engineer',
  devloper: 'developer',
  engineeri: 'engineer',
  tranee: 'trainee',
  incharege: 'incharge',
  enterprenour: 'entrepreneur',
  entreprurnr: 'entrepreneur',
  entrepreneurship: 'entrepreneur',
};

// Stems for word families that should share a token.
const STEM: Record<string, string> = {
  developer: 'develop', development: 'develop', developing: 'develop', developers: 'develop',
  engineering: 'engineer', engineers: 'engineer',
  analyst: 'analy', analysis: 'analy', analytics: 'analy', analytical: 'analy', analysts: 'analy', analyzing: 'analy',
  tester: 'test', testing: 'test', tests: 'test',
  designer: 'design', designing: 'design',
  manager: 'manag', management: 'manag', managing: 'manag', managers: 'manag',
  programmer: 'program', programming: 'program', programs: 'program',
  consultant: 'consult', consulting: 'consult', consultancy: 'consult',
  architect: 'architect', architecture: 'architect',
  scientist: 'science', sciences: 'science',
  administrator: 'admin', administration: 'admin',
  structural: 'structure', structures: 'structure',
  embedded: 'embed',
  networking: 'network', networks: 'network',
  surveying: 'survey', surveyor: 'survey',
  estimation: 'estimat', estimator: 'estimat', estimating: 'estimat',
  supervision: 'supervis', supervisor: 'supervis',
  security: 'secur', cybersecurity: 'cybersecur',
  marketing: 'market',
  operations: 'operat', operation: 'operat',
  automation: 'automat',
  planning: 'plan', planner: 'plan',
  teaching: 'teach', teacher: 'teach',
  support: 'support',
  services: 'service', apis: 'api',
  systems: 'system',
  technologies: 'technology', technical: 'technology', tech: 'technology',
  electronics: 'electronic',
  telecommunications: 'telecommunication',
  communications: 'communication',
  infrastructure: 'infrastructure',
  construction: 'construct',
};

/**
 * Words that say how senior someone is, not what they do. Dropped so a target
 * of "Software Engineer" matches "Senior Software Engineer" and an internship
 * titled "Software Engineering Intern".
 */
const LEVEL = new Set([
  'senior', 'junior', 'lead', 'principal', 'head', 'chief', 'staff', 'trainee', 'intern', 'internship',
  'associate', 'assistant', 'graduate', 'apprentice', 'fresher', 'ii', 'iii', 'iv', 'i', 'l1', 'l2', 'l3',
  'campus', 'drive', 'placement', 'opening', 'openings', 'hiring', 'role', 'position', 'job',
]);

const STOP = new Set([
  'a', 'an', 'the', 'of', 'and', 'or', 'at', 'in', 'on', 'for', 'with', 'to', 'by', 'as', 'from', 'my',
  'through', 'via', 'pvt', 'ltd', 'limited', 'private', 'inc', 'llp', 'co', 'company', 'india', 'na', 'n', 'nil', 'none',
]);

/** Words too generic to make two titles the same role on their own ("Site Engineer" vs "Software Engineer"). */
export const GENERIC = new Set(['engineer', 'executive', 'officer', 'specialist', 'professional', 'member']);

/** Tokens with generic words removed, unless that would leave nothing. */
export function specificTokens(tokens: string[]): string[] {
  const kept = tokens.filter((t) => !GENERIC.has(t));
  return kept.length ? kept : tokens;
}

function stem(w: string): string {
  if (STEM[w]) return STEM[w];
  // Plain plurals: "skills" -> "skill", but not "analysis", "class", "bus".
  if (w.length > 4 && w.endsWith('s') && !/(ss|is|us|os|js)$/.test(w)) {
    const s = w.slice(0, -1);
    return STEM[s] ?? s;
  }
  return w;
}

/** Normalised tokens for one string: expanded, stemmed, with level words and stop words removed. */
export function tokenize(text: string | null | undefined): string[] {
  if (!text) return [];
  let t = ` ${text.toLowerCase()} `;
  for (const [re, rep] of ABBREVIATIONS) t = t.replace(re, rep);
  const out: string[] = [];
  for (const raw of t.split(/[^a-z0-9+#]+/)) {
    if (!raw) continue;
    const expanded = EXPAND[raw] ?? raw;
    for (const w of expanded.split(' ')) {
      if (w.length < 2 && w !== 'c' && w !== 'r') continue;
      if (/^\d+$/.test(w)) continue;
      if (STOP.has(w) || LEVEL.has(w)) continue;
      out.push(stem(w));
    }
  }
  return out;
}
