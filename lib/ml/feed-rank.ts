/**
 * "Top" feed ranking: a logistic model over a handful of explainable features
 * of (viewer, post). Weights come from lib/ml/models/feed-ranker.json, written
 * by scripts/ml/train-feed-ranker.mjs; see that script for how far the current
 * interaction data can be trusted (not very: it is synthetic).
 *
 * Pure and synchronous, so the trainer computes features with this exact code.
 */
import rankerModel from './models/feed-ranker.json';
import { relatedness } from './semantic';
import { skillOverlap } from '../matching';
import type { FeedPost } from '@/lib/posts';

export const FEATURES = [
  'connected',
  'same_branch',
  'batch_proximity',
  'opportunity_relevance',
  'author_relevance',
  'kind_preference',
  'recency',
  'engagement',
  'closed_listing',
  'own_post',
] as const;
export type Feature = (typeof FEATURES)[number];

/** The parts of a FeedPost the ranker reads; FeedPost itself fits. */
export type RankablePost = Pick<FeedPost, 'id' | 'author_id' | 'created_at' | 'branch' | 'batch_year' | 'designation'> & {
  like_count: number;
  comment_count: number;
  repost_count?: number;
  opportunity: { type: string; title: string; skills: string[]; open: boolean; deadline?: string | null } | null;
  original?: RankablePost | null;
};

export type ViewerContext = {
  id: string;
  role: 'student' | 'alumni' | 'admin';
  branch: string | null;
  batch_year: number | null;
  /** A student's target role, or an alumnus' designation. */
  target_role: string | null;
  skills: string[];
  connections: ReadonlySet<string> | readonly string[];
  /** Reference time in ms; defaults to now. The trainer sets it to the interaction time. */
  now?: number;
};

// How much each viewer role wants each kind of post. Students are here for
// openings; alumni mostly for news and the occasional referral.
const KIND_PREFERENCE: Record<ViewerContext['role'], Record<string, number>> = {
  student: { internship: 1, placement: 0.9, job: 0.7, referral: 0.8, post: 0 },
  alumni: { referral: 0.3, job: 0.3, internship: 0.1, placement: 0.1, post: 0.2 },
  admin: { referral: 0.2, job: 0.2, internship: 0.2, placement: 0.3, post: 0.2 },
};

const RECENCY_HALF_LIFE_H = 48;
const BATCH_WINDOW = 6;
// log1p(reactions + 2*comments + 2*reposts) reaches 1 at about 100 of these.
const ENGAGEMENT_SCALE = Math.log1p(100);

type RankerModel = {
  weights: Record<Feature, number>;
  bias: number;
  author_repeat_decay?: number;
};

const PRIOR: RankerModel = {
  weights: {
    connected: 1.2,
    same_branch: 0.6,
    batch_proximity: 0.4,
    opportunity_relevance: 2.0,
    author_relevance: 0.6,
    kind_preference: 1.0,
    recency: 1.5,
    engagement: 0.8,
    closed_listing: -2.0,
    own_post: -1.0,
  },
  bias: -2,
  author_repeat_decay: 0.85,
};

function loadModel(): RankerModel {
  const m = rankerModel as Partial<RankerModel>;
  const weights = { ...PRIOR.weights };
  for (const f of FEATURES) {
    const v = m.weights?.[f];
    if (typeof v === 'number' && Number.isFinite(v)) weights[f] = v;
  }
  return {
    weights,
    bias: typeof m.bias === 'number' && Number.isFinite(m.bias) ? m.bias : PRIOR.bias,
    author_repeat_decay: m.author_repeat_decay ?? PRIOR.author_repeat_decay,
  };
}

export const MODEL = loadModel();
export const PRIOR_MODEL = PRIOR;

const has = (set: ViewerContext['connections'], id: string) =>
  set instanceof Set ? set.has(id) : (set as readonly string[]).includes(id);

/** Feature values for one post as seen by one viewer, each roughly 0..1. */
export function featurize(post: RankablePost, viewer: ViewerContext, engagementOverride?: number): Record<Feature, number> {
  const now = viewer.now ?? Date.now();
  // A repost is judged by what it shares.
  const subject = !post.opportunity && post.original ? post.original : post;
  const opp = subject.opportunity;

  const ageH = Math.max(0, (now - new Date(post.created_at).getTime()) / 3_600_000);
  const interactions =
    engagementOverride ?? subject.like_count + 2 * subject.comment_count + 2 * (subject.repost_count ?? 0);

  let opportunityRelevance = 0;
  if (opp) {
    const target = viewer.target_role ?? '';
    const titleRel = target ? relatedness(target, opp.title) : 0;
    const skillRel = viewer.skills.length && opp.skills.length ? skillOverlap(viewer.skills, opp.skills) : 0;
    opportunityRelevance = Math.max(titleRel, 0.6 * titleRel + 0.4 * skillRel, 0.5 * skillRel);
  }

  const closed = !!opp && (!opp.open || (!!opp.deadline && new Date(`${opp.deadline}T23:59:59Z`).getTime() < now));

  return {
    connected: has(viewer.connections, post.author_id) ? 1 : 0,
    same_branch: viewer.branch && post.branch && viewer.branch === post.branch ? 1 : 0,
    batch_proximity:
      viewer.batch_year && post.batch_year ? Math.max(0, 1 - Math.abs(viewer.batch_year - post.batch_year) / BATCH_WINDOW) : 0,
    opportunity_relevance: opportunityRelevance,
    author_relevance: viewer.target_role && post.designation ? relatedness(viewer.target_role, post.designation) : 0,
    kind_preference: KIND_PREFERENCE[viewer.role]?.[opp?.type ?? 'post'] ?? 0,
    recency: Math.pow(0.5, ageH / RECENCY_HALF_LIFE_H),
    engagement: Math.min(1, Math.log1p(Math.max(0, interactions)) / ENGAGEMENT_SCALE),
    closed_listing: closed ? 1 : 0,
    own_post: post.author_id === viewer.id ? 1 : 0,
  };
}

/** Logit of "the viewer engages with this post". */
export function scorePost(post: RankablePost, viewer: ViewerContext, model: RankerModel = MODEL): number {
  const x = featurize(post, viewer);
  let z = model.bias;
  for (const f of FEATURES) z += model.weights[f] * x[f];
  return z;
}

export type RankedPost<T> = { post: T; score: number; features: Record<Feature, number> };

/**
 * Posts best first. After scoring, a light diversity pass discounts each further
 * post from an author already placed, so one prolific poster can't fill the top.
 */
export function rankFeed<T extends RankablePost>(posts: T[], viewer: ViewerContext, model: RankerModel = MODEL): RankedPost<T>[] {
  const ctx = { ...viewer, now: viewer.now ?? Date.now() };
  const scored = posts.map((post) => {
    const features = featurize(post, ctx);
    let z = model.bias;
    for (const f of FEATURES) z += model.weights[f] * features[f];
    return { post, score: 1 / (1 + Math.exp(-z)), features };
  });
  scored.sort((a, b) => b.score - a.score || b.post.created_at.localeCompare(a.post.created_at));

  const decay = model.author_repeat_decay ?? 1;
  if (decay >= 1) return scored;
  const out: RankedPost<T>[] = [];
  const seen = new Map<string, number>();
  const pending = [...scored];
  while (pending.length) {
    let bestI = 0;
    let bestS = -Infinity;
    for (let i = 0; i < pending.length; i++) {
      const s = pending[i].score * Math.pow(decay, seen.get(pending[i].post.author_id) ?? 0);
      if (s > bestS) {
        bestS = s;
        bestI = i;
      }
      // Scores are sorted, so nothing further down can beat an undiscounted one.
      if (!seen.has(pending[i].post.author_id)) break;
    }
    const [next] = pending.splice(bestI, 1);
    seen.set(next.post.author_id, (seen.get(next.post.author_id) ?? 0) + 1);
    out.push(next);
  }
  return out;
}
