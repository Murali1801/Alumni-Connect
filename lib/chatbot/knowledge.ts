import 'server-only';

/**
 * Curated facts about how this platform actually behaves.
 *
 * This is the grounding set for the help chatbot. Answers are drawn from here
 * rather than from a model's own recollection, so the bot cannot invent a
 * feature that does not exist. When an LLM is configured it is given these
 * entries as context and told to answer only from them.
 */

import { FACTS, type Fact } from './facts';

export { FACTS, type Fact };

/**
 * Words that carry no topic signal. Without this list a question like "where is
 * the help page" scores against every entry whose title happens to contain
 * "the", and the first such entry wins by array order.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'this', 'that', 'these', 'those',
  'with', 'from', 'have', 'has', 'had', 'can', 'could', 'would', 'should',
  'will', 'shall', 'may', 'might', 'must', 'does', 'did', 'you', 'your',
  'yours', 'our', 'their', 'its', 'his', 'her', 'about', 'there', 'here',
  'what', 'when', 'where', 'which', 'who', 'whom', 'how', 'why', 'not',
  'but', 'all', 'any', 'some', 'get', 'got', 'let', 'see', 'use', 'used',
  'want', 'need', 'find', 'know', 'tell', 'show', 'please', 'thanks',
]);

/** A hit must clear this to count as an answer rather than a coincidence. */
const MIN_SCORE = 3;

export type FactHit = { fact: Fact; score: number };

/**
 * Score a question against the knowledge base.
 *
 * Scoring, strongest signal first:
 *   - a multi-word keyword appearing verbatim in the question
 *   - a single keyword appearing verbatim
 *   - a content word matching a keyword exactly, or as a prefix
 *   - a content word appearing in the entry's own question
 *
 * Stopwords are dropped before any of that, and anything below `MIN_SCORE` is
 * discarded so the caller can say "I do not know" instead of guessing.
 */
export function scoreFacts(query: string, role?: string): FactHit[] {
  const q = query.toLowerCase();
  const words = q
    .split(/\W+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  // A question can be entirely stopwords — "who are you" — and still match a
  // keyword phrase verbatim, so never bail out before the phrase check.

  return FACTS.map((fact) => {
    if (fact.roles && role && !fact.roles.includes(role as any)) return { fact, score: -1 };

    let score = 0;

    for (const kw of fact.keywords) {
      if (q.includes(kw)) score += kw.includes(' ') ? 6 : 4;
    }

    const questionWords = new Set(
      fact.question.toLowerCase().split(/\W+/).filter((w) => w.length > 2 && !STOPWORDS.has(w))
    );

    for (const w of words) {
      if (fact.keywords.some((kw) => kw === w)) score += 3;
      else if (fact.keywords.some((kw) => kw.startsWith(w) || w.startsWith(kw))) score += 2;
      if (questionWords.has(w)) score += 2;
    }

    return { fact, score };
  })
    .filter((r) => r.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
}

/**
 * Best matches only. A second entry is returned solely when it scores close to
 * the winner — stapling a weak second answer onto a good one reads as confusion.
 */
export function searchFacts(query: string, role?: string, limit = 3): Fact[] {
  const hits = scoreFacts(query, role);
  if (hits.length === 0) return [];
  const best = hits[0].score;
  return hits
    .filter((h) => h.score >= best * 0.6)
    .slice(0, limit)
    .map((h) => h.fact);
}

