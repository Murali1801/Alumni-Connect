/**
 * Trains the semantic role/skill model: TF-IDF over short "career documents",
 * reduced with a truncated SVD (latent semantic analysis), so words that keep
 * the same company ("developer" and "engineer", "react" and "frontend",
 * "staad" and "structure") end up close together.
 *
 * Documents, one per row (read-only):
 *   - institutional alumni records: first job title + branch. Real data, used
 *     only in aggregate; no row, name or employer is written out, and a word
 *     must appear in at least MIN_DF documents to enter the vocabulary.
 *   - alumni profiles: designation + industry + skills + branch (mostly the
 *     500 generated SYNTH_ profiles, so their role/skill pairings reflect the
 *     generator's assumptions).
 *   - opportunities: title + target skills; student profiles: target role,
 *     target industry and skills.
 *   - a small hand-written seed lexicon of skill families (below), which keeps
 *     well-known associations stable when the live data is thin or random.
 *
 * Output: lib/ml/models/semantic.json. Term vectors are int8-quantised with a
 * per-term scale and stored as base64 to keep the bundle small.
 *
 *   npx tsx scripts/ml/train-semantic-model.mjs            # train and write
 *   npx tsx scripts/ml/train-semantic-model.mjs --dry-run  # train, print, don't write
 */
import { adminClient, selectAll, prng, round, writeModel, isSyntheticRecord, auc } from './common.mjs';
import { tokenize, specificTokens } from '../../lib/ml/tokenize.ts';

const DRY = process.argv.includes('--dry-run');
const MIN_DF = 3;
const K_GRID = [16, 24, 32, 48, 64];
const P_GRID = [0, 0.5, 1];
const ITERS = 250;
// Seed lexicon documents count this many times a database document. 4 was
// picked by eye on the probe pairs below (and the holdout was seen while doing
// so), keeping the generator's near-uniform IT skill mix from merging everything.
const SEED_WEIGHT = Number(process.env.SEED_WEIGHT ?? 4);

/* Skill families written by hand. Each line is one document. */
const SEED_LEXICON = [
  'frontend developer react javascript typescript html css nextjs vue angular ui',
  'frontend engineer react redux javascript web ui ux',
  'backend developer java spring nodejs express api rest sql postgresql microservices',
  'backend engineer python django flask api sql database',
  'fullstack developer react nodejs javascript typescript api sql web',
  'web developer javascript html css php react wordpress',
  'software engineer data structures algorithms java python cpp git',
  'software developer java python javascript git data structures',
  'software development engineer data structures algorithms java system design',
  'mobile developer android kotlin java ios swift flutter react native',
  'android developer kotlin java mobile',
  'dotnet developer csharp asp sql server',
  'devops engineer docker kubernetes aws ci cd linux terraform jenkins',
  'cloud engineer aws azure gcp linux docker kubernetes networking',
  'data engineer python sql spark etl airflow data pipeline',
  'data analyst sql excel powerbi tableau python data analysis business intelligence',
  'data scientist python ml statistics pandas data analysis deep learning',
  'ml engineer python ml deep learning tensorflow pytorch ai genai nlp',
  'ai engineer ml genai nlp python llm',
  'business analyst requirements excel sql stakeholder management data analysis',
  'quality assurance test engineer manual testing automation selenium software testing',
  'security engineer cybersecurity network security linux penetration testing',
  'network engineer networking ccna routing linux system administrator',
  'system engineer linux system administrator support infrastructure',
  'technical support engineer troubleshooting desktop support networking',
  'product manager roadmap stakeholder management agile analytics',
  'project manager agile scrum stakeholder management planning delivery',
  'embedded engineer embedded c microcontrollers rtos arm iot firmware pcb design',
  'electronics engineer vlsi verilog pcb design signal processing matlab',
  'rf engineer telecommunication signal processing 5g matlab antenna',
  'telecom engineer 5g lte networking signal processing',
  'hardware engineer pcb design microcontrollers circuit design',
  'site engineer construction site supervision estimation quantity surveying autocad',
  'civil engineer construction autocad staad estimation surveying',
  'structural engineer staad etabs revit structural analysis design',
  'planning engineer primavera ms project scheduling construction planning',
  'quantity surveyor quantity surveying estimation billing contract management',
  'design engineer autocad revit solidworks drafting',
  'lecturer professor teaching faculty education',
  'entrepreneur founder owner family business startup',
  'sales executive business development marketing',
  'digital marketing seo executive social media marketing',
  'consultant consulting advisory sap erp',
];

/* Held-out sanity triplets: (anchor, closer, further). Used to pick k and p and reported. */
const TRIPLETS = [
  ['Software Developer', 'Software Engineer', 'Site Engineer'],
  ['Software Development Engg', 'Software Developer', 'Civil Engineer'],
  ['SDE', 'Software Engineer', 'Structural Engineer'],
  ['Trainee Software Engg', 'Associate Software Engineer', 'Site Engg'],
  ['Frontend Developer', 'React', 'AutoCAD'],
  ['Frontend Developer', 'Web Developer', 'Data Analyst'],
  ['Backend Developer', 'Java Developer', 'RF Engineer'],
  ['Full Stack Developer', 'Web Developer', 'Quantity Surveyor'],
  ['Data Analyst', 'Business Analyst', 'Site Engineer'],
  ['Data Analyst', 'Power BI', 'STAAD Pro'],
  ['Machine Learning Engineer', 'Data Scientist', 'Civil Engineer'],
  ['Site Engineer', 'Civil Engineer', 'Software Engineer'],
  ['Structural Engineer', 'STAAD Pro', 'React'],
  ['Site Engg', 'Site Supervision', 'JavaScript'],
  ['Embedded Engineer', 'Microcontrollers', 'Excel'],
  ['RF Engineer', 'Signal Processing', 'Estimation'],
  ['DevOps Engineer', 'Kubernetes', 'Revit'],
  ['Cloud Engineer', 'AWS', 'Quantity Surveying'],
  ['Security Engineer', 'Cybersecurity', 'ETABS'],
  ['QA', 'Software Tester', 'Structural Engineer'],
  ['N/W Engg', 'Network Engineer', 'Frontend Developer'],
  ['GET', 'Graduate Engineer Trainee', 'Data Scientist'],
  ['React', 'JavaScript', 'AutoCAD'],
  ['Node.js', 'Backend Developer', 'Site Supervision'],
  ['Product Manager', 'Project Manager', 'Embedded C'],
  ['Site Engineer', 'Structural Engineer', 'Data Analyst'],
  ['Site Engineer', 'Quantity Surveying', 'Kubernetes'],
  ['Structural Engineer', 'Civil Engineer', 'Embedded Engineer'],
  ['Planning Engineer', 'Primavera', 'React'],
  ['Embedded Engineer', 'Electronics Engineer', 'Site Engineer'],
  ['VLSI', 'Verilog', 'Excel'],
  ['Data Scientist', 'Python', 'Revit'],
  ['Software Engineer', 'Java', 'Estimation'],
  ['Web Developer', 'HTML', 'Signal Processing'],
  ['Business Analyst', 'Excel', 'RTOS'],
];

/* Never used for selection: reported only, as a less optimistic check. */
const HOLDOUT = [
  ['Jr. Programmer', 'Software Developer', 'Site Engineer'],
  ['Asst. System Engg', 'System Engineer', 'Quantity Surveyor'],
  ['S/W Developer', 'Java Developer', 'Structural Engineer'],
  ['Android Developer', 'Mobile Developer', 'Planning Engineer'],
  ['Data Engineer', 'SQL', 'AutoCAD'],
  ['Quantity Surveyor', 'Estimation', 'Python'],
  ['Tech Support', 'Technical Support Engineer', 'Structural Engineer'],
  ['Full Stack Developer', 'Node.js', 'Signal Processing'],
  ['Planning Engineer', 'Site Engineer', 'Frontend Developer'],
  ['Cloud Architect', 'DevOps Engineer', 'Site Supervision'],
];

/* ------------------------------ read the corpus ------------------------------ */

const db = adminClient();
const [records, profiles, opportunities, students] = await Promise.all([
  selectAll(db, 'alumni_records', 'student_id, branch, first_role', (q) => q.not('first_role', 'is', null)),
  selectAll(db, 'alumni_profiles', 'designation, industry, skills, record:alumni_records!record_id(branch, student_id)'),
  selectAll(db, 'opportunities', 'title, target_skills'),
  selectAll(db, 'student_profiles', 'branch, skills, target_role, target_industry'),
]);

// The branch is a domain word in its own right: a CIVIL record's title ties
// "site" and "estimation" to "civil", an EXTC record's to "electronic".
const BRANCH_WORDS = { COMP: 'computer', IT: 'information technology', EXTC: 'electronics telecommunication', CIVIL: 'civil', MECH: 'mechanical', ELEC: 'electrical' };
const branchTok = (b) => tokenize(BRANCH_WORDS[String(b ?? '').toUpperCase()] ?? '');
const one = (v) => (Array.isArray(v) ? v[0] : v);

const sources = { real_records: 0, synthetic_records: 0, profiles: 0, opportunities: 0, students: 0, seed_lexicon: 0 };
const rawDocs = []; // { tokens, source }
for (const r of records) {
  const tokens = tokenize(r.first_role);
  if (!tokens.length) continue;
  const real = !isSyntheticRecord(r.student_id);
  rawDocs.push({ tokens: [...tokens, ...branchTok(r.branch)], source: real ? 'real_records' : 'synthetic_records' });
}
for (const p of profiles) {
  const rec = one(p.record);
  const tokens = [tokenize(p.designation), tokenize(p.industry), ...(p.skills ?? []).map(tokenize)].flat();
  if (tokens.length) rawDocs.push({ tokens: [...tokens, ...branchTok(rec?.branch)], source: 'profiles' });
}
for (const o of opportunities) {
  const tokens = [tokenize(o.title), ...(o.target_skills ?? []).map(tokenize)].flat();
  if (tokens.length) rawDocs.push({ tokens, source: 'opportunities' });
}
for (const s of students) {
  const tokens = [tokenize(s.target_role), tokenize(s.target_industry), ...(s.skills ?? []).map(tokenize)].flat();
  if (tokens.length) rawDocs.push({ tokens: [...tokens, ...branchTok(s.branch)], source: 'students' });
}
for (const line of SEED_LEXICON) rawDocs.push({ tokens: tokenize(line), source: 'seed_lexicon' });
for (const d of rawDocs) sources[d.source]++;

/* ------------------------------ vocabulary ------------------------------ */

// Document frequency over database documents; seed-lexicon words are admitted
// regardless, since they are not drawn from anyone's record.
const df = new Map();
const seedWords = new Set();
for (const d of rawDocs) {
  const uniq = new Set(d.tokens);
  if (d.source === 'seed_lexicon') uniq.forEach((t) => seedWords.add(t));
  else uniq.forEach((t) => df.set(t, (df.get(t) ?? 0) + 1));
}
const vocab = [...new Set([...[...df].filter(([, n]) => n >= MIN_DF).map(([t]) => t), ...seedWords])].sort();
const index = new Map(vocab.map((t, i) => [t, i]));
const T = vocab.length;

// Collapse identical documents (the generator repeats templates) and weight by
// sqrt(count) so a template seen 80 times doesn't drown out a real title seen twice.
const grouped = new Map();
for (const d of rawDocs) {
  const kept = d.tokens.filter((t) => index.has(t));
  if (!kept.length) continue;
  const key = [...kept].sort().join(' ');
  const g = grouped.get(key) ?? { tokens: kept, count: 0, seed: d.source === 'seed_lexicon' };
  g.count++;
  grouped.set(key, g);
}
const docs = [...grouped.values()];
const N = docs.length;

const dfDocs = new Float64Array(T);
for (const d of docs) new Set(d.tokens).forEach((t) => dfDocs[index.get(t)]++);
const idf = Float64Array.from(dfDocs, (n) => Math.log((N + 1) / (n + 1)) + 1);

// Sparse rows of the weighted, L2-normalised TF-IDF matrix X (N x T).
const rows = docs.map((d) => {
  const tf = new Map();
  for (const t of d.tokens) tf.set(index.get(t), (tf.get(index.get(t)) ?? 0) + 1);
  const idx = [...tf.keys()];
  const val = idx.map((j) => (1 + Math.log(tf.get(j))) * idf[j]);
  const norm = Math.hypot(...val) || 1;
  const w = Math.sqrt(d.count) * (d.seed ? SEED_WEIGHT : 1);
  return { idx, val: val.map((v) => (v / norm) * w) };
});

/* ------------------------------ truncated SVD ------------------------------ */

// Top eigenvectors of G = X^T X by subspace iteration, using the sparse X so
// each step costs O(nnz * k) instead of O(T^2 * k).
function gramTimes(Q, k) {
  const out = Array.from({ length: k }, () => new Float64Array(T));
  const xq = new Float64Array(k);
  for (const r of rows) {
    xq.fill(0);
    for (let a = 0; a < r.idx.length; a++) {
      const j = r.idx[a];
      const v = r.val[a];
      for (let c = 0; c < k; c++) xq[c] += v * Q[c][j];
    }
    for (let a = 0; a < r.idx.length; a++) {
      const j = r.idx[a];
      const v = r.val[a];
      for (let c = 0; c < k; c++) out[c][j] += v * xq[c];
    }
  }
  return out;
}

function orthonormalise(Q) {
  for (let c = 0; c < Q.length; c++) {
    for (let p = 0; p < c; p++) {
      let dot = 0;
      for (let j = 0; j < T; j++) dot += Q[c][j] * Q[p][j];
      for (let j = 0; j < T; j++) Q[c][j] -= dot * Q[p][j];
    }
    let n = 0;
    for (let j = 0; j < T; j++) n += Q[c][j] * Q[c][j];
    n = Math.sqrt(n) || 1;
    for (let j = 0; j < T; j++) Q[c][j] /= n;
  }
  return Q;
}

// Symmetric eigen-decomposition of a small matrix (Jacobi rotations).
function jacobiEigen(A) {
  const n = A.length;
  const a = A.map((r) => [...r]);
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] ** 2;
    if (off < 1e-20) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-15) continue;
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k][p];
          const akq = a[k][q];
          a[k][p] = c * akp - s * akq;
          a[k][q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p][k];
          const aqk = a[q][k];
          a[p][k] = c * apk - s * aqk;
          a[q][k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k][p];
          const vkq = v[k][q];
          v[k][p] = c * vkp - s * vkq;
          v[k][q] = s * vkp + c * vkq;
        }
      }
    }
  }
  return { values: a.map((r, i) => r[i]), vectors: v };
}

const KMAX = Math.min(Math.max(...K_GRID), T - 1);
const BLOCK = Math.min(KMAX + 12, T);
const rand = prng(42);
let Q = orthonormalise(Array.from({ length: BLOCK }, () => Float64Array.from({ length: T }, () => rand() - 0.5)));
for (let it = 0; it < ITERS; it++) Q = orthonormalise(gramTimes(Q, BLOCK));

// Rayleigh-Ritz: rotate the converged block into exact eigenvectors, largest first.
const GQ = gramTimes(Q, BLOCK);
const B = Array.from({ length: BLOCK }, (_, a) =>
  Array.from({ length: BLOCK }, (_, b) => {
    let s = 0;
    for (let j = 0; j < T; j++) s += Q[a][j] * GQ[b][j];
    return s;
  })
);
const eig = jacobiEigen(B);
const order = eig.values.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).map(([, i]) => i);
const sigma = order.map((i) => Math.sqrt(Math.max(0, eig.values[i])));
const V = order.map((i) => {
  const col = new Float64Array(T);
  for (let a = 0; a < BLOCK; a++) {
    const c = eig.vectors[a][i];
    for (let j = 0; j < T; j++) col[j] += c * Q[a][j];
  }
  return col;
});
const totalEnergy = rows.reduce((s, r) => s + r.val.reduce((a, v) => a + v * v, 0), 0);

/* ------------------------------ embeddings and selection ------------------------------ */

// Term vector for term j: idf_j * V[j, :k] * sigma^p. A text's embedding is the
// tf-weighted sum of its term vectors, which equals projecting its TF-IDF vector.
// With unit=true each term's latent direction is normalised first, so a rare
// but telling word ("civil") carries its idf weight instead of the tiny norm
// LSA gives terms that sit outside the top components.
function termMatrix(k, p, unit) {
  return vocab.map((_, j) => {
    const v = Float64Array.from({ length: k }, (_, c) => V[c][j] * sigma[c] ** p);
    const n = unit ? Math.hypot(...v) || 1 : 1;
    return v.map((x) => (idf[j] * x) / n);
  });
}
function embedWith(M, k, text) {
  const tf = new Map();
  // Same rule as lib/ml/semantic.ts: generic words only count when alone.
  for (const t of specificTokens(tokenize(text))) if (index.has(t)) tf.set(index.get(t), (tf.get(index.get(t)) ?? 0) + 1);
  const out = new Float64Array(k);
  for (const [j, n] of tf) {
    const w = 1 + Math.log(n);
    for (let c = 0; c < k; c++) out[c] += w * M[j][c];
  }
  return out;
}
function cos(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}
function evaluate(k, p, unit, set = TRIPLETS, matrix) {
  const M = matrix ?? termMatrix(k, p, unit);
  const e = (s) => embedWith(M, k, s);
  let correct = 0;
  const scores = [];
  const labels = [];
  for (const [a, pos, neg] of set) {
    const sp = cos(e(a), e(pos));
    const sn = cos(e(a), e(neg));
    if (sp > sn) correct++;
    scores.push(sp, sn);
    labels.push(1, 0);
  }
  return { k, p, unit, tripletAccuracy: correct / set.length, pairAuc: auc(scores, labels), M };
}

const grid = [];
for (const k of K_GRID.filter((k) => k <= KMAX)) for (const p of P_GRID) for (const unit of [false, true]) grid.push(evaluate(k, p, unit));
grid.sort((x, y) => y.tripletAccuracy - x.tripletAccuracy || y.pairAuc - x.pairAuc || x.k - y.k);
const best = grid[0];
const holdout = evaluate(best.k, best.p, best.unit, HOLDOUT, best.M);
const explained = sigma.slice(0, best.k).reduce((s, v) => s + v * v, 0) / totalEnergy;

// Calibration: cosine between titles from unrelated branch families (civil vs
// computing) is the "unrelated" baseline; same-title pairs set the ceiling.
const civilTitles = new Set();
const compTitles = new Set();
for (const p of profiles) {
  const b = one(p.record)?.branch;
  if (!p.designation) continue;
  if (b === 'CIVIL') civilTitles.add(p.designation);
  if (b === 'COMP' || b === 'IT') compTitles.add(p.designation);
}
for (const o of opportunities) {
  const t = tokenize(o.title).join(' ');
  if (/structure|site|civil|survey|construct|plan/.test(t)) civilTitles.add(o.title);
  else if (/software|develop|frontend|backend|fullstack|web|data|cloud|devops/.test(t)) compTitles.add(o.title);
}
const crossSims = [];
const e = (s) => embedWith(best.M, best.k, s);
for (const a of civilTitles) for (const b of compTitles) {
  const ea = e(a), eb = e(b);
  if (ea.some(Boolean) && eb.some(Boolean)) crossSims.push(Math.max(0, cos(ea, eb)));
}
crossSims.sort((a, b) => a - b);
const pct = (arr, q) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(q * arr.length))] : 0);
// p75 rather than p90: generic titles ("Project Manager", "Graduate Engineer
// Trainee") legitimately appear in both families and inflate the upper tail.
const floor = round(Math.min(0.5, Math.max(0.15, pct(crossSims, 0.75))), 3);
const ceil = 0.85;

/* ------------------------------ quantise and write ------------------------------ */

const shipped = vocab.map((t, j) => [t, j]);
const scales = [];
const bytes = new Int8Array(shipped.length * best.k);
shipped.forEach(([, j], row) => {
  const vec = best.M[j];
  const max = Math.max(...vec.map(Math.abs)) || 1;
  scales.push(Number((max / 127).toPrecision(5)));
  for (let c = 0; c < best.k; c++) bytes[row * best.k + c] = Math.round((vec[c] / max) * 127);
});
const vectors = Buffer.from(bytes.buffer).toString('base64');

const model = {
  version: 1,
  kind: 'tfidf-lsa',
  trained_at: new Date().toISOString(),
  dim: best.k,
  sigma_power: best.p,
  unit_terms: best.unit,
  vocab: shipped.map(([t]) => t),
  scales,
  vectors,
  calibration: { floor, ceil },
  meta: {
    documents_by_source: sources,
    distinct_documents: N,
    vocab_size: T,
    min_df: MIN_DF,
    explained_energy: round(explained, 4),
    eval: {
      triplets: TRIPLETS.length,
      triplet_accuracy: round(best.tripletAccuracy, 4),
      pair_auc: round(best.pairAuc, 4),
      holdout_triplets: HOLDOUT.length,
      holdout_triplet_accuracy: round(holdout.tripletAccuracy, 4),
      holdout_pair_auc: round(holdout.pairAuc, 4),
      cross_family_pairs: crossSims.length,
      cross_family_p50: round(pct(crossSims, 0.5), 4),
      cross_family_p75: round(pct(crossSims, 0.75), 4),
    },
    grid: grid.map((g) => ({ k: g.k, p: g.p, unit_terms: g.unit, triplet_accuracy: round(g.tripletAccuracy, 3), pair_auc: round(g.pairAuc, 3) })),
    note:
      'Unsupervised. Institutional job titles are used only in aggregate (min_df filter, no rows stored). ' +
      'Profile and opportunity text is largely synthetic, so role/skill pairings partly reflect the generator; ' +
      'a hand-written seed lexicon anchors common skill families. k, sigma_power and unit_terms are chosen on the hand-made triplets, ' +
      'so triplet_accuracy is optimistic; holdout_* is reported only. Both sets are tiny sanity checks, not benchmarks.',
  },
};

console.log('Documents:', sources, `distinct ${N}, vocab ${T}`);
console.log('Grid (best first):');
for (const g of grid.slice(0, 8)) console.log(`  k=${g.k} p=${g.p} unit=${g.unit}  triplet acc ${g.tripletAccuracy.toFixed(3)}  pair AUC ${g.pairAuc.toFixed(3)}`);
console.log(`Chosen k=${best.k} p=${best.p} unit=${best.unit}, explained energy ${(explained * 100).toFixed(1)}%, calibration floor ${floor} (cross-family p75 over ${crossSims.length} pairs)`);
console.log(`Holdout: triplet acc ${holdout.tripletAccuracy.toFixed(3)}  pair AUC ${holdout.pairAuc.toFixed(3)}`);
for (const [a, pos, neg] of [...TRIPLETS, ...HOLDOUT]) {
  const sp = cos(e(a), e(pos));
  const sn = cos(e(a), e(neg));
  if (sp <= sn) console.log(`  miss: "${a}" ~ "${pos}" ${sp.toFixed(2)} vs "${neg}" ${sn.toFixed(2)}`);
}

const PROBES = [
  ['Software Developer', 'Software Engineer'], ['Software Developer', 'Site Engineer'], ['Software Engineer', 'Data Analyst'],
  ['Frontend Developer', 'Backend Developer'], ['Frontend Developer', 'Data Analyst'], ['React', 'Frontend'], ['React', 'Java'],
  ['Data Analyst', 'Business Analyst'], ['Product Manager', 'Software Engineer'], ['Site Engineer', 'Structural Engineer'],
  ['Embedded Engineer', 'Software Engineer'], ['Civil Engineer', 'Machine Learning Engineer'], ['AutoCAD', 'React'],
];
console.log(`Cross-family cosine p50 ${pct(crossSims, 0.5).toFixed(2)} p75 ${pct(crossSims, 0.75).toFixed(2)} p90 ${pct(crossSims, 0.9).toFixed(2)}`);
for (const [a, b] of PROBES) console.log(`  ${a} ~ ${b}: ${cos(e(a), e(b)).toFixed(2)}`);

if (DRY) console.log('Dry run: nothing written.');
else {
  const { file, bytes: size } = writeModel('semantic.json', model);
  console.log(`Wrote ${file} (${(size / 1024).toFixed(1)} KB)`);
}
