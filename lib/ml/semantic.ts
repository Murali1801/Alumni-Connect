/**
 * Runtime for the semantic role/skill model (TF-IDF + LSA, trained by
 * scripts/ml/train-semantic-model.mjs). Pure TypeScript with the model JSON
 * imported statically, so it runs the same in Node, the browser and Workers.
 *
 * A text's embedding is the tf-weighted sum of its terms' latent vectors,
 * normalised to unit length. Words the model has never seen contribute
 * nothing, so every comparison also takes plain token overlap into account:
 * identical titles always score 1 even when they are out of vocabulary.
 */
import model from './models/semantic.json';
import { GENERIC, specificTokens, tokenize } from './tokenize';

export { GENERIC, tokenize };

type SemanticModel = {
  dim: number;
  vocab: string[];
  scales: number[];
  vectors: string;
  calibration: { floor: number; ceil: number };
};

const M = model as unknown as SemanticModel;
export const DIM = M.dim;

let table: { index: Map<string, number>; q: Int8Array } | null = null;

// Decoded on first use, not at import, so pages that never compare text pay nothing.
function terms() {
  if (table) return table;
  const bin = atob(M.vectors);
  const q = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) q[i] = (bin.charCodeAt(i) << 24) >> 24;
  table = { index: new Map(M.vocab.map((t, i) => [t, i])), q };
  return table;
}

const cache = new Map<string, Float32Array>();
const CACHE_MAX = 4000;

/** Unit-length embedding of a title, skill or short phrase; all zeros when no word is known. */
export function embed(text: string | null | undefined): Float32Array {
  const key = text ?? '';
  const hit = cache.get(key);
  if (hit) return hit;
  const { index, q } = terms();
  const tf = new Map<number, number>();
  // Generic words ("engineer") would pull every engineering title together.
  for (const t of specificTokens(tokenize(key))) {
    const j = index.get(t);
    if (j !== undefined) tf.set(j, (tf.get(j) ?? 0) + 1);
  }
  const out = new Float32Array(DIM);
  for (const [j, n] of tf) {
    const w = (1 + Math.log(n)) * M.scales[j];
    const base = j * DIM;
    for (let c = 0; c < DIM; c++) out[c] += w * q[base + c];
  }
  let norm = 0;
  for (let c = 0; c < DIM; c++) norm += out[c] * out[c];
  if (norm > 0) {
    norm = Math.sqrt(norm);
    for (let c = 0; c < DIM; c++) out[c] /= norm;
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, out);
  return out;
}

/** Cosine of two embeddings, floored at 0. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? Math.max(0, Math.min(1, d / Math.sqrt(na * nb))) : 0;
}

const sets = new Map<string, Set<string>>();
function tokenSet(text: string | null | undefined): Set<string> {
  const key = text ?? '';
  let set = sets.get(key);
  if (!set) {
    set = new Set(specificTokens(tokenize(key)));
    if (sets.size >= CACHE_MAX) sets.delete(sets.keys().next().value as string);
    sets.set(key, set);
  }
  return set;
}

/**
 * Jaccard over normalised tokens: the exact-word part of every comparison.
 * Generic words are ignored unless a side has nothing else.
 */
export function tokenJaccard(a: string | null | undefined, b: string | null | undefined): number {
  const A = tokenSet(a);
  const B = tokenSet(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((t) => B.has(t) && inter++);
  return inter / (A.size + B.size - inter);
}

/**
 * Similarity in 0..1: the larger of the latent cosine and exact token overlap.
 * Strings or precomputed embeddings; with two embeddings it is just the cosine.
 */
export function similarity(a: string | ArrayLike<number>, b: string | ArrayLike<number>): number {
  const va = typeof a === 'string' ? embed(a) : a;
  const vb = typeof b === 'string' ? embed(b) : b;
  const latent = cosine(va, vb);
  if (typeof a !== 'string' || typeof b !== 'string') return latent;
  return Math.max(latent, tokenJaccard(a, b));
}

/**
 * Similarity rescaled so that an unrelated pair scores 0: the floor is the
 * typical cosine between civil and computing job titles, measured at training.
 * Use this wherever the number feeds a score or a "related" label.
 */
export function relatedness(a: string, b: string): number {
  const { floor, ceil } = M.calibration;
  const latent = cosine(embed(a), embed(b));
  const scaled = Math.max(0, Math.min(1, (latent - floor) / (ceil - floor)));
  return Math.max(scaled, tokenJaccard(a, b));
}

/** The candidate most related to `text`, with its score; null when nothing clears the floor. */
export function closest(text: string, candidates: string[]): { value: string; score: number } | null {
  let best: { value: string; score: number } | null = null;
  for (const c of candidates) {
    const s = relatedness(text, c);
    if (s > 0 && (!best || s > best.score)) best = { value: c, score: s };
  }
  return best;
}
