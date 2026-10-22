/**
 * Pure search helpers: input cleaning, paging limits, snippets and grouping.
 * No server imports, so the search page and lib/search.test.ts can use them.
 */

export const SEARCH_TYPES = ['all', 'people', 'posts', 'jobs', 'companies'] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
export type SearchGroupKey = Exclude<SearchType, 'all'>;

export const SEARCH_QUERY_MAX = 100;
export const SEARCH_QUERY_MIN = 2;
export const SEARCH_LIMIT_MAX = 50;

/**
 * What reaches the database. Control characters and runs of whitespace go,
 * length is capped, and anything that is only punctuation becomes empty. The
 * SQL side (search_query) still turns every token into letters and digits, so
 * this is about sensible behaviour, not injection.
 */
export function normaliseQuery(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const cleaned = raw
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SEARCH_QUERY_MAX)
    .trim();
  return /[\p{L}\p{N}]/u.test(cleaned) ? cleaned : '';
}

/** Long enough to search: two letters or digits, so "ab" works but "a" or "!!" does not. */
export function isSearchable(q: string): boolean {
  return (q.match(/[\p{L}\p{N}]/gu)?.length ?? 0) >= SEARCH_QUERY_MIN;
}

export function parseSearchType(raw: unknown): SearchType {
  return SEARCH_TYPES.includes(raw as SearchType) ? (raw as SearchType) : 'all';
}

export function clampLimit(raw: unknown, fallback = 20, max = SEARCH_LIMIT_MAX): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

export function clampOffset(raw: unknown, max = 1000): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

/** A 4-digit graduating year, or null. */
export function parseBatch(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1950 && n <= 2100 ? n : null;
}

/** Words of a query, lowercased, for highlighting and snippets. */
export function queryTerms(q: string): string[] {
  // \p{M} keeps combining marks (Devanagari vowel signs) inside their word.
  return [...new Set((q.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).filter((t) => t.length >= 2))];
}

/**
 * A short excerpt around the first matching word, on word boundaries. Plain
 * text: the caller decides how to highlight, so no markup can leak from a post.
 */
export function makeSnippet(text: string | null | undefined, q: string, max = 180): string {
  const body = (text ?? '').replace(/\s+/g, ' ').trim();
  if (body.length <= max) return body;
  const lower = body.toLowerCase();
  let at = -1;
  for (const t of queryTerms(q)) {
    const i = lower.indexOf(t);
    if (i >= 0 && (at < 0 || i < at)) at = i;
  }
  // Match near the start, or none: lead with the opening.
  if (at < max * 0.4) {
    const cut = body.lastIndexOf(' ', max);
    return body.slice(0, cut > max * 0.6 ? cut : max).trimEnd() + '…';
  }
  let start = Math.max(0, at - Math.floor(max * 0.3));
  const space = body.indexOf(' ', start);
  if (space >= 0 && space < at) start = space + 1;
  let end = Math.min(body.length, start + max);
  const back = body.lastIndexOf(' ', end);
  if (end < body.length && back > at) end = back;
  return (start > 0 ? '…' : '') + body.slice(start, end).trim() + (end < body.length ? '…' : '');
}

export type Page<T> = { items: T[]; total: number; limit: number; offset: number };

export const emptyPage = <T,>(limit = 0, offset = 0): Page<T> => ({ items: [], total: 0, limit, offset });

export type RankedGroups = Record<SearchGroupKey, Page<{ rank: number }>>;

/**
 * The order to show the groups of an "all" search in: the group holding the
 * single strongest hit first, empty groups last, ties in a fixed order. Ranks
 * are comparable across groups because every search function uses ts_rank on
 * the same scale, with name similarity on top for people and companies.
 */
export function groupOrder(groups: RankedGroups): SearchGroupKey[] {
  const fixed: SearchGroupKey[] = ['people', 'jobs', 'posts', 'companies'];
  const best = (k: SearchGroupKey) => groups[k].items.reduce((m, h) => Math.max(m, h.rank), -1);
  return [...fixed].sort((a, b) => {
    const ea = groups[a].items.length === 0;
    const eb = groups[b].items.length === 0;
    if (ea !== eb) return ea ? 1 : -1;
    const d = best(b) - best(a);
    return Math.abs(d) > 1e-9 ? d : fixed.indexOf(a) - fixed.indexOf(b);
  });
}

/** Ids in rank order, then rows from a second query put back in that order. */
export function inRankOrder<T extends { id: string }>(ids: string[], rows: T[]): T[] {
  const by = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => by.get(id)).filter((r): r is T => Boolean(r));
}
