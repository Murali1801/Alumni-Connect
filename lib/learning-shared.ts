/**
 * Learning hub logic that both server and client code use: labels, ordering,
 * progress, quiz scoring, the lesson-text parser and video embeds. lib/learning.ts
 * is server-only, so anything a client component or a test needs lives here.
 */

export const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_LABEL: Record<Level, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
};

export const LESSON_KINDS = ['text', 'video', 'link', 'quiz'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];
export const KIND_LABEL: Record<LessonKind, string> = {
  text: 'Reading',
  video: 'Video',
  link: 'Resource',
  quiz: 'Quiz',
};

/** Cover colours are palette tokens, so they follow the theme and stay solid. */
export const COVERS = ['primary', 'chart-2', 'chart-3', 'chart-4', 'success', 'warning', 'info', 'destructive'] as const;
export type Cover = (typeof COVERS)[number];
export const COVER_LABEL: Record<Cover, string> = {
  primary: 'Indigo',
  'chart-2': 'Violet',
  'chart-3': 'Orchid',
  'chart-4': 'Blue',
  success: 'Green',
  warning: 'Amber',
  info: 'Sky',
  destructive: 'Red',
};
export const coverColor = (cover: string) => `var(--${(COVERS as readonly string[]).includes(cover) ? cover : 'primary'})`;

export type QuizQuestion = {
  prompt: string;
  options: string[];
  /** Index into `options`. Never sent to a learner before they answer. */
  correct: number;
  explanation?: string;
};

/** A question as a learner sees it before answering. */
export type PublicQuestion = { prompt: string; options: string[] };

export type QuizResult = {
  correct: number;
  total: number;
  /** 0–100, rounded. */
  score: number;
  answers: { chosen: number | null; answer: number; right: boolean; explanation: string }[];
};

/* ------------------------------------------------------------------ */
/* Ordering                                                            */
/* ------------------------------------------------------------------ */

type Positioned = { id: string; position: number; created_at?: string };

/** Stable order by position, then creation, then id, so ties never reshuffle. */
export function byPosition<T extends Positioned>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => a.position - b.position || (a.created_at ?? '').localeCompare(b.created_at ?? '') || a.id.localeCompare(b.id)
  );
}

/** Lessons in reading order: module by module, each module's lessons in order. */
export function flattenLessons<M extends Positioned & { lessons: Positioned[] }>(modules: M[]): M['lessons'][number][] {
  return byPosition(modules).flatMap((m) => byPosition(m.lessons as M['lessons'][number][]));
}

/** Move one id up or down a list; out-of-range moves leave the list unchanged. */
export function moveItem(ids: string[], id: string, direction: -1 | 1): string[] {
  const i = ids.indexOf(id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

/** Dense 0..n-1 positions for an ordered list of ids. */
export function positionsFor(ids: string[]): { id: string; position: number }[] {
  return ids.map((id, position) => ({ id, position }));
}

/** True when `ids` is exactly `existing` reordered: same members, no repeats. */
export function isPermutation(ids: string[], existing: string[]): boolean {
  if (ids.length !== existing.length) return false;
  const set = new Set(ids);
  return set.size === ids.length && existing.every((id) => set.has(id));
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

/** Whole-number percentage of lessons completed, 0 when there are none. */
export function progressPercent(total: number, done: number): number {
  if (total <= 0) return 0;
  return Math.round((Math.min(done, total) / total) * 100);
}

/**
 * Where a learner picks up: the lesson they last opened if it is unfinished,
 * otherwise the first unfinished lesson after it, otherwise the first
 * unfinished one anywhere. A finished course reopens on the last lesson viewed
 * (or the first lesson). Null only for a course with no lessons.
 */
export function pickResumeLesson(ordered: string[], completed: Set<string> | string[], lastLessonId: string | null): string | null {
  if (!ordered.length) return null;
  const done = completed instanceof Set ? completed : new Set(completed);
  const at = lastLessonId ? ordered.indexOf(lastLessonId) : -1;
  if (at >= 0 && !done.has(ordered[at])) return ordered[at];
  const after = ordered.slice(at + 1).find((id) => !done.has(id));
  if (after) return after;
  const first = ordered.find((id) => !done.has(id));
  if (first) return first;
  return at >= 0 ? ordered[at] : ordered[0];
}

/** Course score: the mean of the quiz scores, null for a course without quizzes. */
export function courseScore(quizScores: (number | null | undefined)[]): number | null {
  const scores = quizScores.filter((s): s is number => typeof s === 'number');
  if (!scores.length) return null;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/* ------------------------------------------------------------------ */
/* Quizzes                                                             */
/* ------------------------------------------------------------------ */

/** Score a submission. Missing or out-of-range answers count as wrong. */
export function scoreQuiz(questions: QuizQuestion[], answers: (number | null | undefined)[]): QuizResult {
  const rows = questions.map((q, i) => {
    const raw = answers[i];
    const chosen = typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw < q.options.length ? raw : null;
    return { chosen, answer: q.correct, right: chosen === q.correct, explanation: q.explanation ?? '' };
  });
  const correct = rows.filter((r) => r.right).length;
  const total = questions.length;
  return { correct, total, score: total ? Math.round((correct / total) * 100) : 0, answers: rows };
}

/** The questions without answers or explanations. */
export function publicQuiz(questions: QuizQuestion[]): PublicQuestion[] {
  return questions.map((q) => ({ prompt: q.prompt, options: [...q.options] }));
}

/** A problem with a quiz as written, or null when it is usable. */
export function quizProblem(questions: QuizQuestion[]): string | null {
  if (!questions.length) return 'Add at least one question.';
  for (const [i, q] of questions.entries()) {
    const n = i + 1;
    if (!q.prompt.trim()) return `Question ${n} needs a prompt.`;
    const options = q.options.map((o) => o.trim());
    if (options.length < 2) return `Question ${n} needs at least two options.`;
    if (options.some((o) => !o)) return `Question ${n} has an empty option.`;
    if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) return `Question ${n} repeats an option.`;
    if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct >= options.length) return `Mark the correct option for question ${n}.`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Tags                                                                */
/* ------------------------------------------------------------------ */

/** Trimmed, de-duplicated (case-insensitively) tags, first spelling wins. */
export function normaliseTags(list: string[] | string, max = 12): string[] {
  const raw = Array.isArray(list) ? list : list.split(',');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const tag = t.trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!tag || seen.has(tag.toLowerCase())) continue;
    seen.add(tag.toLowerCase());
    out.push(tag);
    if (out.length >= max) break;
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Lesson text: a small, safe subset of markdown                        */
/* ------------------------------------------------------------------ */

export type Inline = { kind: 'text' | 'bold' | 'code'; text: string };
export type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'bullets'; items: string[] }
  | { kind: 'numbers'; items: string[] }
  | { kind: 'code'; text: string };

/**
 * Split lesson text into blocks: `## heading`, `- item` / `* item` lists,
 * `1. item` lists, ``` fenced code, and paragraphs separated by blank lines.
 * The output is data that the renderer turns into elements; nothing is ever
 * treated as HTML.
 */
export function parseLessonText(text: string): Block[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: { kind: 'bullets' | 'numbers'; items: string[] } | null = null;

  const flush = () => {
    if (para.length) blocks.push({ kind: 'paragraph', text: para.join(' ') });
    para = [];
    if (list) blocks.push(list);
    list = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) code.push(lines[i]);
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }
    const heading = /^#{1,3}\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      blocks.push({ kind: 'heading', text: heading[1] });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(trimmed);
    const number = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (bullet || number) {
      const kind = bullet ? 'bullets' : 'numbers';
      if (para.length) {
        blocks.push({ kind: 'paragraph', text: para.join(' ') });
        para = [];
      }
      if (list && list.kind !== kind) {
        blocks.push(list);
        list = null;
      }
      list ??= { kind, items: [] };
      list.items.push((bullet ?? number)![1]);
      continue;
    }
    if (list) {
      // An indented line continues the previous item.
      if (/^\s+/.test(line) && list.items.length) {
        list.items[list.items.length - 1] += ' ' + trimmed;
        continue;
      }
      blocks.push(list);
      list = null;
    }
    para.push(trimmed);
  }
  flush();
  return blocks;
}

/** `**bold**` and `` `code` `` inside a line; everything else stays text. */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  for (const m of text.matchAll(pattern)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ kind: 'text', text: text.slice(last, i) });
    out.push(m[1] !== undefined ? { kind: 'bold', text: m[1] } : { kind: 'code', text: m[2] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ kind: 'text', text: text.slice(last) });
  return out;
}

/* ------------------------------------------------------------------ */
/* Video                                                               */
/* ------------------------------------------------------------------ */

/**
 * A privacy-enhanced embed for a YouTube or Vimeo link (youtube-nocookie.com,
 * Vimeo with do-not-track), or null for anything else, which is shown as a
 * plain link instead.
 */
export function videoEmbed(url: string): { provider: 'youtube' | 'vimeo'; src: string } | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^(www|m)\./, '');
  const yt = /^[A-Za-z0-9_-]{11}$/;
  let id: string | null = null;
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0];
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') id = u.searchParams.get('v');
    else {
      const m = /^\/(embed|shorts|live)\/([^/?#]+)/.exec(u.pathname);
      if (m) id = m[2];
    }
  }
  if (id && yt.test(id)) return { provider: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = /\/(?:video\/)?(\d{6,12})(?:\/|$)/.exec(u.pathname);
    if (m) return { provider: 'vimeo', src: `https://player.vimeo.com/video/${m[1]}?dnt=1` };
  }
  return null;
}

/** "1 h 30 min", "45 min" */
export function formatMinutes(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/** Workshop room: an in-app call path or an https link. */
export function isRoomPath(value: string): boolean {
  return /^\/call\/[A-Za-z0-9_-]{4,80}$/.test(value) || (/^https:\/\//i.test(value) && value.length <= 500);
}
