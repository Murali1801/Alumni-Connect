import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { getMemberCards, type MemberCard } from '@/lib/network';
import {
  byPosition,
  courseScore,
  flattenLessons,
  pickResumeLesson,
  progressPercent,
  publicQuiz,
  scoreQuiz,
  type Cover,
  type LessonKind,
  type Level,
  type PublicQuestion,
  type QuizQuestion,
  type QuizResult,
} from '@/lib/learning-shared';

export * from '@/lib/learning-shared';

/**
 * The Learning hub: courses alumni write, students' progress through them, and
 * live workshops. Every read goes through the service key after the caller's
 * role is checked, so this module decides what each viewer may see — quiz
 * answers, for one, never reach a learner before they submit.
 */

const COURSE_COLUMNS =
  'id, author_id, title, summary, cover, level, topics, skills, est_hours, published, published_at, created_at, updated_at';

type CourseRow = {
  id: string;
  author_id: string;
  title: string;
  summary: string;
  cover: Cover;
  level: Level;
  topics: string[];
  skills: string[];
  est_hours: number;
  published: boolean;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type ModuleRow = { id: string; course_id: string; title: string; position: number; created_at: string };

type LessonRow = {
  id: string;
  module_id: string;
  course_id: string;
  title: string;
  kind: LessonKind;
  position: number;
  body: string;
  url: string | null;
  quiz: QuizQuestion[];
  duration_min: number;
  created_at: string;
};

type EnrolmentRow = {
  course_id: string;
  user_id: string;
  enrolled_at: string;
  last_lesson_id: string | null;
  last_seen_at: string;
  completed_at: string | null;
  score: number | null;
};

export type CourseCard = Omit<CourseRow, 'est_hours'> & {
  est_hours: number;
  author: MemberCard | null;
  modules: number;
  lessons: number;
  minutes: number;
  learners: number;
  /** The viewer's own standing, when they are enrolled. */
  mine: { percent: number; done: number; completed_at: string | null; score: number | null } | null;
};

type Many<T> = T | T[] | null;
const one = <T,>(v: Many<T> | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

type ProgressRow = { lesson_id: string; completed_at: string | null; quiz_score: number | null; quiz_answers: (number | null)[] | null; attempts: number };

const chunks = <T,>(arr: T[], n = 150) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

/** Every row of a filtered select, past the 1,000-row page limit. */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await build(from, from + 999);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Escape a search term for a PostgREST `ilike` pattern. */
const likeTerm = (q: string) => `%${q.replace(/[\\%_,()]/g, ' ').trim()}%`;

/** Counts and the viewer's standing for a set of courses. */
async function decorate(rows: CourseRow[], viewerId: string | null): Promise<CourseCard[]> {
  if (!rows.length) return [];
  const db = createAdminClient();
  const ids = rows.map((r) => r.id);
  const modules: { course_id: string }[] = [];
  const lessons: { course_id: string; duration_min: number }[] = [];
  const enrolments: { course_id: string; user_id: string; completed_at: string | null; score: number | null }[] = [];
  for (const part of chunks(ids)) {
    const [m, l, e] = await Promise.all([
      fetchAll<{ course_id: string }>((a, b) => db.from('course_modules').select('course_id').in('course_id', part).range(a, b)),
      fetchAll<{ course_id: string; duration_min: number }>((a, b) =>
        db.from('course_lessons').select('course_id, duration_min').in('course_id', part).range(a, b)
      ),
      fetchAll<{ course_id: string; user_id: string; completed_at: string | null; score: number | null }>((a, b) =>
        db.from('course_enrolments').select('course_id, user_id, completed_at, score').in('course_id', part).range(a, b)
      ),
    ]);
    modules.push(...m);
    lessons.push(...l);
    enrolments.push(...e);
  }
  const done = new Map<string, number>();
  if (viewerId) {
    const { data } = await db
      .from('lesson_progress')
      .select('course_id')
      .eq('user_id', viewerId)
      .in('course_id', ids)
      .not('completed_at', 'is', null);
    for (const p of data ?? []) done.set(p.course_id, (done.get(p.course_id) ?? 0) + 1);
  }
  const authors = new Map((await getMemberCards(rows.map((r) => r.author_id))).map((a) => [a.id, a]));
  const count = <T extends { course_id: string }>(list: T[], id: string) => list.filter((x) => x.course_id === id);

  return rows.map((r) => {
    const ls = count(lessons, r.id);
    const es = count(enrolments, r.id);
    const own = viewerId ? es.find((e) => e.user_id === viewerId) : undefined;
    const doneCount = done.get(r.id) ?? 0;
    return {
      ...r,
      est_hours: Number(r.est_hours),
      author: authors.get(r.author_id) ?? null,
      modules: count(modules, r.id).length,
      lessons: ls.length,
      minutes: ls.reduce((a, l) => a + l.duration_min, 0),
      learners: es.length,
      mine: own
        ? { percent: own.completed_at ? 100 : progressPercent(ls.length, doneCount), done: doneCount, completed_at: own.completed_at, score: own.score }
        : null,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Catalogue                                                           */
/* ------------------------------------------------------------------ */

export type CatalogueFilters = { q?: string; topic?: string; level?: string; skill?: string };

/** Published courses matching the filters, newest first. */
export async function listCatalogue(filters: CatalogueFilters, viewerId: string | null): Promise<CourseCard[]> {
  const db = createAdminClient();
  let query = db.from('courses').select(COURSE_COLUMNS).eq('published', true);
  if (filters.q?.trim()) query = query.ilike('title', likeTerm(filters.q));
  if (filters.level && ['beginner', 'intermediate', 'advanced'].includes(filters.level)) query = query.eq('level', filters.level);
  if (filters.topic) query = query.contains('topics', [filters.topic]);
  if (filters.skill) query = query.contains('skills', [filters.skill]);
  const { data } = await query.order('published_at', { ascending: false }).limit(200);
  return decorate((data ?? []) as CourseRow[], viewerId);
}

/** Topics and skills used by published courses, most common first, for the filters. */
export async function getCatalogueFacets(): Promise<{ topics: string[]; skills: string[] }> {
  const db = createAdminClient();
  const { data } = await db.from('courses').select('topics, skills').eq('published', true).limit(1000);
  const tally = (lists: string[][]) => {
    const n = new Map<string, number>();
    for (const t of lists.flat()) n.set(t, (n.get(t) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([t]) => t);
  };
  return { topics: tally((data ?? []).map((c) => c.topics ?? [])), skills: tally((data ?? []).map((c) => c.skills ?? [])) };
}

export type MyCourse = CourseCard & {
  enrolled_at: string;
  last_seen_at: string;
  resume: { id: string; title: string } | null;
};

/** The student's enrolments, most recently opened first, with where to resume. */
export async function getMyLearning(userId: string): Promise<MyCourse[]> {
  const db = createAdminClient();
  const { data: enrolments } = await db
    .from('course_enrolments')
    .select('course_id, user_id, enrolled_at, last_lesson_id, last_seen_at, completed_at, score')
    .eq('user_id', userId)
    .order('last_seen_at', { ascending: false });
  const rows = (enrolments ?? []) as EnrolmentRow[];
  if (!rows.length) return [];
  const ids = rows.map((e) => e.course_id);
  const [{ data: courses }, { data: modules }, { data: lessons }, { data: progress }] = await Promise.all([
    db.from('courses').select(COURSE_COLUMNS).in('id', ids),
    db.from('course_modules').select('id, course_id, position, created_at').in('course_id', ids),
    db.from('course_lessons').select('id, module_id, course_id, title, position, created_at').in('course_id', ids).limit(5000),
    db.from('lesson_progress').select('lesson_id').eq('user_id', userId).in('course_id', ids).not('completed_at', 'is', null),
  ]);
  const cards = new Map((await decorate((courses ?? []) as CourseRow[], userId)).map((c) => [c.id, c]));
  const done = new Set((progress ?? []).map((p) => p.lesson_id));

  return rows
    .map((e) => {
      const card = cards.get(e.course_id);
      if (!card) return null;
      const mods = (modules ?? [])
        .filter((m) => m.course_id === e.course_id)
        .map((m) => ({ ...m, lessons: (lessons ?? []).filter((l) => l.module_id === m.id) }));
      const ordered = flattenLessons(mods);
      const resumeId = pickResumeLesson(ordered.map((l) => l.id), done, e.last_lesson_id);
      const resume = ordered.find((l) => l.id === resumeId);
      return {
        ...card,
        enrolled_at: e.enrolled_at,
        last_seen_at: e.last_seen_at,
        resume: resume ? { id: resume.id, title: resume.title } : null,
      };
    })
    .filter(Boolean) as MyCourse[];
}

/* ------------------------------------------------------------------ */
/* Completion records (for profiles)                                   */
/* ------------------------------------------------------------------ */

export type CompletedCourse = {
  course_id: string;
  title: string;
  level: Level;
  cover: Cover;
  skills: string[];
  author_id: string;
  author_name: string;
  completed_at: string;
  /** Mean quiz score, 0–100; null when the course had no quizzes. */
  score: number | null;
};

/** Courses a member has finished, most recent first. */
export async function getCompletedCourses(userId: string): Promise<CompletedCourse[]> {
  const db = createAdminClient();
  const { data } = await db
    .from('course_enrolments')
    .select('course_id, completed_at, score, course:courses!course_id(title, level, cover, skills, author_id, author:users!author_id(full_name))')
    .eq('user_id', userId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false });
  type Embedded = { title: string; level: Level; cover: Cover; skills: string[] | null; author_id: string; author: Many<{ full_name: string }> };
  type Row = { course_id: string; completed_at: string; score: number | null; course: Many<Embedded> };
  return ((data ?? []) as unknown as Row[])
    .map((row) => {
      const c = one(row.course);
      if (!c) return null;
      return {
        course_id: row.course_id,
        title: c.title,
        level: c.level,
        cover: c.cover,
        skills: c.skills ?? [],
        author_id: c.author_id,
        author_name: one(c.author)?.full_name ?? 'An SJCEM alumnus',
        completed_at: row.completed_at,
        score: row.score,
      };
    })
    .filter(Boolean) as CompletedCourse[];
}

/* ------------------------------------------------------------------ */
/* One course, as a learner sees it                                    */
/* ------------------------------------------------------------------ */

export type LearnerLesson = {
  id: string;
  module_id: string;
  title: string;
  kind: LessonKind;
  position: number;
  duration_min: number;
  /** Content is withheld until the student enrols. */
  body: string;
  url: string | null;
  quiz: PublicQuestion[];
  progress: { completed_at: string | null; quiz_score: number | null; attempts: number } | null;
  /** The last attempt, marked, so a learner can review it. */
  review: QuizResult | null;
};

export type LearnerModule = { id: string; title: string; position: number; lessons: LearnerLesson[] };

export type LearnerCourse = {
  course: CourseCard;
  modules: LearnerModule[];
  enrolment: Pick<EnrolmentRow, 'enrolled_at' | 'last_lesson_id' | 'completed_at' | 'score'> | null;
  resumeLessonId: string | null;
  workshops: WorkshopCard[];
};

async function loadContent(courseId: string) {
  const db = createAdminClient();
  const [{ data: modules }, { data: lessons }] = await Promise.all([
    db.from('course_modules').select('id, course_id, title, position, created_at').eq('course_id', courseId),
    db
      .from('course_lessons')
      .select('id, module_id, course_id, title, kind, position, body, url, quiz, duration_min, created_at')
      .eq('course_id', courseId),
  ]);
  const ms = byPosition((modules ?? []) as ModuleRow[]).map((m) => ({
    ...m,
    lessons: byPosition(((lessons ?? []) as LessonRow[]).filter((l) => l.module_id === m.id)),
  }));
  return ms;
}

/**
 * A course for a student: the syllabus always, the content once enrolled.
 * Unpublished courses are visible only to students already enrolled.
 */
export async function getCourseForLearner(courseId: string, userId: string): Promise<LearnerCourse | null> {
  const db = createAdminClient();
  const [{ data: row }, { data: enrolment }] = await Promise.all([
    db.from('courses').select(COURSE_COLUMNS).eq('id', courseId).maybeSingle(),
    db
      .from('course_enrolments')
      .select('enrolled_at, last_lesson_id, completed_at, score')
      .eq('course_id', courseId)
      .eq('user_id', userId)
      .maybeSingle(),
  ]);
  if (!row || (!row.published && !enrolment)) return null;
  const [[course], modules, { data: progress }, workshops] = await Promise.all([
    decorate([row as CourseRow], userId),
    loadContent(courseId),
    enrolment
      ? db.from('lesson_progress').select('lesson_id, completed_at, quiz_score, quiz_answers, attempts').eq('user_id', userId).eq('course_id', courseId)
      : Promise.resolve({ data: [] as ProgressRow[] }),
    listWorkshops({ viewerId: userId, courseId }),
  ]);
  const byLesson = new Map(((progress ?? []) as ProgressRow[]).map((p) => [p.lesson_id, p]));
  const enrolled = Boolean(enrolment);

  const learnerModules: LearnerModule[] = modules.map((m) => ({
    id: m.id,
    title: m.title,
    position: m.position,
    lessons: m.lessons.map((l) => {
      const p = byLesson.get(l.id);
      const quiz = Array.isArray(l.quiz) ? l.quiz : [];
      return {
        id: l.id,
        module_id: l.module_id,
        title: l.title,
        kind: l.kind,
        position: l.position,
        duration_min: l.duration_min,
        body: enrolled ? l.body : '',
        url: enrolled ? l.url : null,
        quiz: enrolled ? publicQuiz(quiz) : [],
        progress: p ? { completed_at: p.completed_at, quiz_score: p.quiz_score, attempts: p.attempts } : null,
        review: enrolled && l.kind === 'quiz' && Array.isArray(p?.quiz_answers) ? scoreQuiz(quiz, p.quiz_answers) : null,
      };
    }),
  }));
  const ordered = learnerModules.flatMap((m) => m.lessons);
  const done = new Set(ordered.filter((l) => l.progress?.completed_at).map((l) => l.id));
  return {
    course,
    modules: learnerModules,
    enrolment: enrolment ?? null,
    resumeLessonId: enrolment ? pickResumeLesson(ordered.map((l) => l.id), done, enrolment.last_lesson_id) : null,
    workshops,
  };
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export type LessonContext = LessonRow & { course: Pick<CourseRow, 'id' | 'author_id' | 'published' | 'title'> };

export async function getLesson(lessonId: string): Promise<LessonContext | null> {
  const db = createAdminClient();
  const { data } = await db
    .from('course_lessons')
    .select('id, module_id, course_id, title, kind, position, body, url, quiz, duration_min, created_at, course:courses!course_id(id, author_id, published, title)')
    .eq('id', lessonId)
    .maybeSingle();
  if (!data) return null;
  const row = data as unknown as LessonRow & { course: Many<LessonContext['course']> };
  const course = one(row.course);
  return course ? { ...row, course } : null;
}

export async function isEnrolled(courseId: string, userId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db.from('course_enrolments').select('course_id').eq('course_id', courseId).eq('user_id', userId).maybeSingle();
  return Boolean(data);
}

export type ProgressSummary = { done: number; total: number; percent: number; completed_at: string | null; score: number | null };

/**
 * Bring the enrolment in line with the lesson progress: once every lesson is
 * done the course is complete and keeps its completion date, and the score is
 * the mean of the best quiz scores.
 */
export async function syncEnrolment(userId: string, courseId: string): Promise<ProgressSummary> {
  const db = createAdminClient();
  const [{ data: lessons }, { data: progress }, { data: enrolment }] = await Promise.all([
    db.from('course_lessons').select('id, kind').eq('course_id', courseId),
    db.from('lesson_progress').select('lesson_id, completed_at, quiz_score').eq('user_id', userId).eq('course_id', courseId),
    db.from('course_enrolments').select('completed_at, score').eq('course_id', courseId).eq('user_id', userId).maybeSingle(),
  ]);
  const ids = new Set((lessons ?? []).map((l) => l.id));
  const quizIds = new Set((lessons ?? []).filter((l) => l.kind === 'quiz').map((l) => l.id));
  const rows = (progress ?? []).filter((p) => ids.has(p.lesson_id));
  const done = rows.filter((p) => p.completed_at).length;
  const total = ids.size;
  let completed_at = enrolment?.completed_at ?? null;
  if (enrolment && total > 0 && done >= total && !completed_at) completed_at = new Date().toISOString();
  // The score belongs to the completion record, so it stays empty until then.
  const score = completed_at ? courseScore(rows.filter((p) => quizIds.has(p.lesson_id)).map((p) => p.quiz_score)) : null;
  if (enrolment && (completed_at !== enrolment.completed_at || score !== enrolment.score)) {
    await db.from('course_enrolments').update({ completed_at, score }).eq('course_id', courseId).eq('user_id', userId);
  }
  return { done, total, percent: completed_at ? 100 : progressPercent(total, done), completed_at, score };
}

/** Mark a lesson opened, so the learner resumes there. */
export async function recordView(userId: string, lesson: LessonContext) {
  const db = createAdminClient();
  await db
    .from('course_enrolments')
    .update({ last_lesson_id: lesson.id, last_seen_at: new Date().toISOString() })
    .eq('course_id', lesson.course_id)
    .eq('user_id', userId);
}

/** Mark a non-quiz lesson done (or not done again). */
export async function setLessonDone(userId: string, lesson: LessonContext, done: boolean) {
  const db = createAdminClient();
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from('lesson_progress')
    .select('completed_at')
    .eq('user_id', userId)
    .eq('lesson_id', lesson.id)
    .maybeSingle();
  if (existing) {
    await db
      .from('lesson_progress')
      .update({ completed_at: done ? (existing.completed_at ?? now) : null, updated_at: now })
      .eq('user_id', userId)
      .eq('lesson_id', lesson.id);
  } else if (done) {
    await db.from('lesson_progress').insert({ user_id: userId, lesson_id: lesson.id, course_id: lesson.course_id, completed_at: now });
  }
}

/**
 * Score a quiz attempt server-side. Submitting completes the lesson; the best
 * score is the one that counts, so a retake can only help.
 */
export async function submitQuiz(userId: string, lesson: LessonContext, answers: (number | null)[]): Promise<QuizResult> {
  const db = createAdminClient();
  const quiz = Array.isArray(lesson.quiz) ? lesson.quiz : [];
  const result = scoreQuiz(quiz, answers);
  const now = new Date().toISOString();
  const { data: existing } = await db
    .from('lesson_progress')
    .select('completed_at, quiz_score, attempts')
    .eq('user_id', userId)
    .eq('lesson_id', lesson.id)
    .maybeSingle();
  const stored = result.answers.map((a) => a.chosen);
  if (existing) {
    await db
      .from('lesson_progress')
      .update({
        completed_at: existing.completed_at ?? now,
        quiz_score: Math.max(existing.quiz_score ?? 0, result.score),
        quiz_answers: stored,
        attempts: (existing.attempts ?? 0) + 1,
        updated_at: now,
      })
      .eq('user_id', userId)
      .eq('lesson_id', lesson.id);
  } else {
    await db.from('lesson_progress').insert({
      user_id: userId,
      lesson_id: lesson.id,
      course_id: lesson.course_id,
      completed_at: now,
      quiz_score: result.score,
      quiz_answers: stored,
      attempts: 1,
    });
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* Authoring                                                           */
/* ------------------------------------------------------------------ */

export type AuthorCourse = CourseCard & {
  completed: number;
  completionRate: number;
  avgQuizScore: number | null;
};

async function quizScores(courseIds: string[]) {
  const db = createAdminClient();
  if (!courseIds.length) return [] as { course_id: string; lesson_id: string; user_id: string; quiz_score: number | null; completed_at: string | null }[];
  return fetchAll<{ course_id: string; lesson_id: string; user_id: string; quiz_score: number | null; completed_at: string | null }>((a, b) =>
    db.from('lesson_progress').select('course_id, lesson_id, user_id, quiz_score, completed_at').in('course_id', courseIds).range(a, b)
  );
}

/** An alumnus's courses with learner counts, completion rate and mean quiz score. */
export async function getAuthorCourses(authorId: string): Promise<AuthorCourse[]> {
  const db = createAdminClient();
  const { data } = await db.from('courses').select(COURSE_COLUMNS).eq('author_id', authorId).order('updated_at', { ascending: false });
  const rows = (data ?? []) as CourseRow[];
  const ids = rows.map((r) => r.id);
  const [cards, enrolments, progress] = await Promise.all([
    decorate(rows, null),
    ids.length
      ? fetchAll<{ course_id: string; completed_at: string | null }>((a, b) =>
          db.from('course_enrolments').select('course_id, completed_at').in('course_id', ids).range(a, b)
        )
      : Promise.resolve([]),
    quizScores(ids),
  ]);
  return cards.map((c) => {
    const es = enrolments.filter((e) => e.course_id === c.id);
    const completed = es.filter((e) => e.completed_at).length;
    return {
      ...c,
      completed,
      completionRate: progressPercent(es.length, completed),
      avgQuizScore: courseScore(progress.filter((p) => p.course_id === c.id && p.quiz_score !== null).map((p) => p.quiz_score)),
    };
  });
}

export type EditorLesson = Omit<LessonRow, 'created_at' | 'course_id'>;
export type EditorModule = { id: string; title: string; position: number; lessons: EditorLesson[] };

export type CourseAnalytics = {
  learners: number;
  completed: number;
  completionRate: number;
  avgQuizScore: number | null;
  avgProgress: number;
  lessons: { id: string; title: string; kind: LessonKind; completed: number; rate: number; avgScore: number | null }[];
  people: {
    member: MemberCard;
    enrolled_at: string;
    last_seen_at: string;
    percent: number;
    completed_at: string | null;
    score: number | null;
  }[];
};

export type EditorCourse = { course: CourseCard; modules: EditorModule[]; analytics: CourseAnalytics };

/** A course for its author: everything, including answers, plus analytics. */
export async function getCourseForEditor(courseId: string, authorId: string): Promise<EditorCourse | null> {
  const db = createAdminClient();
  const { data: row } = await db.from('courses').select(COURSE_COLUMNS).eq('id', courseId).maybeSingle();
  if (!row || row.author_id !== authorId) return null;
  const [[course], modules, enrolments, progress] = await Promise.all([
    decorate([row as CourseRow], null),
    loadContent(courseId),
    fetchAll<EnrolmentRow>((a, b) =>
      db
        .from('course_enrolments')
        .select('course_id, user_id, enrolled_at, last_lesson_id, last_seen_at, completed_at, score')
        .eq('course_id', courseId)
        .order('last_seen_at', { ascending: false })
        .range(a, b)
    ),
    quizScores([courseId]),
  ]);
  const ordered = modules.flatMap((m) => m.lessons);
  const lessonIds = new Set(ordered.map((l) => l.id));
  const live = progress.filter((p) => lessonIds.has(p.lesson_id));
  const learners = enrolments.length;
  const completed = enrolments.filter((e) => e.completed_at).length;
  const doneBy = new Map<string, number>();
  for (const p of live) if (p.completed_at) doneBy.set(p.user_id, (doneBy.get(p.user_id) ?? 0) + 1);
  const percentOf = (e: EnrolmentRow) => (e.completed_at ? 100 : progressPercent(ordered.length, doneBy.get(e.user_id) ?? 0));
  const shown = enrolments.slice(0, 100);
  const members = new Map((await getMemberCards(shown.map((e) => e.user_id))).map((m) => [m.id, m]));

  return {
    course,
    modules: modules.map((m) => ({
      id: m.id,
      title: m.title,
      position: m.position,
      lessons: m.lessons.map((l) => ({
        id: l.id,
        module_id: l.module_id,
        title: l.title,
        kind: l.kind,
        position: l.position,
        body: l.body,
        url: l.url,
        quiz: Array.isArray(l.quiz) ? l.quiz : [],
        duration_min: l.duration_min,
      })),
    })),
    analytics: {
      learners,
      completed,
      completionRate: progressPercent(learners, completed),
      avgQuizScore: courseScore(live.map((p) => p.quiz_score)),
      avgProgress: learners ? Math.round(enrolments.reduce((a, e) => a + percentOf(e), 0) / learners) : 0,
      lessons: ordered.map((l) => {
        const ps = live.filter((p) => p.lesson_id === l.id);
        const c = ps.filter((p) => p.completed_at).length;
        return {
          id: l.id,
          title: l.title,
          kind: l.kind,
          completed: c,
          rate: progressPercent(learners, c),
          avgScore: l.kind === 'quiz' ? courseScore(ps.map((p) => p.quiz_score)) : null,
        };
      }),
      people: shown
        .map((e) => {
          const member = members.get(e.user_id);
          if (!member) return null;
          return { member, enrolled_at: e.enrolled_at, last_seen_at: e.last_seen_at, percent: percentOf(e), completed_at: e.completed_at, score: e.score };
        })
        .filter(Boolean) as CourseAnalytics['people'],
    },
  };
}

/** The course row when `authorId` wrote it, for API ownership checks. */
export async function getOwnedCourse(courseId: string, authorId: string): Promise<CourseRow | null> {
  const db = createAdminClient();
  const { data } = await db.from('courses').select(COURSE_COLUMNS).eq('id', courseId).maybeSingle();
  return data && data.author_id === authorId ? (data as CourseRow) : null;
}

/** Note that a course's content changed. */
export async function touchCourse(courseId: string) {
  const db = createAdminClient();
  await db.from('courses').update({ updated_at: new Date().toISOString() }).eq('id', courseId);
}

/* ------------------------------------------------------------------ */
/* Workshops                                                           */
/* ------------------------------------------------------------------ */

export type WorkshopCard = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  duration_min: number;
  capacity: number;
  location: string;
  /** Only for the host and for people who have a seat. */
  room_path: string | null;
  topics: string[];
  cancelled_at: string | null;
  course: { id: string; title: string } | null;
  host: MemberCard | null;
  host_id: string;
  attendees: number;
  attending: boolean;
  /** Filled for the host only. */
  attendeeList: MemberCard[];
  ended: boolean;
};

/**
 * Workshops a viewer can see. By default, upcoming ones that have not been
 * cancelled, plus cancelled ones the viewer had a seat at (so they find out).
 * `hostId` lists a host's own, past ones included.
 */
export async function listWorkshops(opts: { viewerId: string; hostId?: string; courseId?: string; limit?: number }): Promise<WorkshopCard[]> {
  const db = createAdminClient();
  let query = db
    .from('workshops')
    .select('id, host_id, course_id, title, description, starts_at, duration_min, capacity, location, room_path, topics, cancelled_at, course:courses!course_id(id, title)');
  if (opts.hostId) query = query.eq('host_id', opts.hostId);
  else query = query.gte('starts_at', new Date(Date.now() - 8 * 3600_000).toISOString());
  if (opts.courseId) query = query.eq('course_id', opts.courseId);
  const { data } = await query.order('starts_at', { ascending: !opts.hostId }).limit(opts.limit ?? 100);
  type Row = Omit<WorkshopCard, 'course' | 'host' | 'attendees' | 'attending' | 'attendeeList' | 'ended'> & { course: Many<{ id: string; title: string }> };
  const rows = (data ?? []) as unknown as Row[];
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const rsvps = await fetchAll<{ workshop_id: string; user_id: string }>((a, b) =>
    db.from('workshop_rsvps').select('workshop_id, user_id').in('workshop_id', ids).order('created_at').range(a, b)
  );
  const hosts = new Map((await getMemberCards(rows.map((r) => r.host_id))).map((m) => [m.id, m]));
  const isHost = Boolean(opts.hostId && opts.hostId === opts.viewerId);
  const people = isHost ? new Map((await getMemberCards(rsvps.map((r) => r.user_id))).map((m) => [m.id, m])) : new Map<string, MemberCard>();
  const now = Date.now();

  return rows
    .map((r) => {
      const seats = rsvps.filter((x) => x.workshop_id === r.id);
      const attending = seats.some((x) => x.user_id === opts.viewerId);
      const ended = new Date(r.starts_at).getTime() + r.duration_min * 60_000 < now;
      if (!opts.hostId && (ended || (r.cancelled_at && !attending))) return null;
      const course = one(r.course);
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        starts_at: r.starts_at,
        duration_min: r.duration_min,
        capacity: r.capacity,
        location: r.location,
        room_path: attending || r.host_id === opts.viewerId ? r.room_path : null,
        topics: r.topics ?? [],
        cancelled_at: r.cancelled_at,
        course: course ? { id: course.id, title: course.title } : null,
        host: hosts.get(r.host_id) ?? null,
        host_id: r.host_id,
        attendees: seats.length,
        attending,
        attendeeList: isHost ? (seats.map((s) => people.get(s.user_id)).filter(Boolean) as MemberCard[]) : [],
        ended,
      };
    })
    .filter(Boolean) as WorkshopCard[];
}
