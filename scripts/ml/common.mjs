/**
 * Helpers the three trainers share: a service-role client from .env.local,
 * paged reads, a seeded PRNG and an L2-to-prior logistic regression.
 *
 * Trainers only read. They never write to the database.
 */
import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const MODELS_DIR = path.join(ROOT, 'lib', 'ml', 'models');

export function adminClient() {
  const env = Object.fromEntries(
    fs
      .readFileSync(path.join(ROOT, '.env.local'), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.startsWith('#') && l.includes('='))
      .map((l) => {
        const i = l.indexOf('=');
        return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')];
      })
  );
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** Every row of a select, 1000 at a time (PostgREST caps a page at 1000). */
export async function selectAll(db, table, columns, build = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(db.from(table).select(columns)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

/** Ids in chunks, for .in() filters that would otherwise overflow the URL. */
export const chunks = (arr, n = 150) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export function prng(seed = 1) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/**
 * Logistic regression by full-batch gradient descent with an L2 penalty that
 * pulls coefficients toward a prior instead of toward zero:
 *
 *   loss = mean(logloss) + lambda/2 * ||w - prior||^2
 *
 * With little or noisy data the fit stays close to the prior; with plenty of
 * signal the data moves it. The intercept is not penalised.
 */
export function fitLogistic(X, y, { prior, priorBias = 0, lambda = 1, lr = 0.5, iters = 3000, sampleWeight } = {}) {
  const d = prior.length;
  const w = [...prior];
  let b = priorBias;
  const n = X.length;
  const sw = sampleWeight ?? new Array(n).fill(1);
  const W = sw.reduce((a, v) => a + v, 0);
  for (let it = 0; it < iters; it++) {
    const g = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * X[i][j];
      const e = (sigmoid(z) - y[i]) * sw[i];
      for (let j = 0; j < d; j++) g[j] += e * X[i][j];
      gb += e;
    }
    for (let j = 0; j < d; j++) w[j] -= lr * (g[j] / W + lambda * (w[j] - prior[j]));
    b -= lr * (gb / W);
  }
  return { w, b };
}

export function logLoss(X, y, w, b) {
  let s = 0;
  for (let i = 0; i < X.length; i++) {
    let z = b;
    for (let j = 0; j < w.length; j++) z += w[j] * X[i][j];
    const p = Math.min(1 - 1e-9, Math.max(1e-9, sigmoid(z)));
    s -= y[i] * Math.log(p) + (1 - y[i]) * Math.log(1 - p);
  }
  return s / Math.max(1, X.length);
}

/** Area under the ROC curve via the rank-sum statistic (ties count half). */
export function auc(scores, labels) {
  const pos = [];
  const neg = [];
  scores.forEach((s, i) => (labels[i] ? pos : neg).push(s));
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : p === q ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

export const round = (x, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

export function writeModel(name, obj) {
  fs.mkdirSync(MODELS_DIR, { recursive: true });
  const file = path.join(MODELS_DIR, name);
  fs.writeFileSync(file, JSON.stringify(obj) + '\n');
  return { file, bytes: fs.statSync(file).size };
}

/** Synthetic or seeded-demo accounts and records, which must not count as real outcomes. */
export const isSyntheticRecord = (studentId) => /^(SYNTH_|MOCK_)/.test(studentId ?? '');
export const isDemoEmail = (email) => /@(example\.com|v3\.demo\.com)$/i.test(email ?? '');
