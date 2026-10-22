import { NextResponse } from 'next/server';
import { z } from 'zod';
import { COVERS, LESSON_KINDS, LEVELS, isRoomPath, normaliseTags, quizProblem } from '@/lib/learning-shared';

/**
 * Request bodies for the Learning hub API, shared by its route handlers.
 *
 * Field definitions carry no defaults: zod applies an inner `.default()` even
 * through `.partial()`, which would make every PATCH reset the fields it left
 * out. Defaults are added only on the create schemas.
 */

const tags = z
  .union([z.array(z.string().max(60)).max(30), z.string().max(600)])
  .transform((v) => normaliseTags(v));

const httpsUrl = z
  .string()
  .trim()
  .max(500, 'Keep the link under 500 characters.')
  .regex(/^https:\/\/\S+$/i, 'Use a full https:// link.');

const course = {
  title: z.string().trim().min(3, 'Give the course a title of at least 3 characters.').max(120, 'Keep the title under 120 characters.'),
  summary: z.string().trim().max(800, 'Keep the summary under 800 characters.'),
  cover: z.enum(COVERS),
  level: z.enum(LEVELS),
  topics: tags,
  skills: tags,
  est_hours: z.coerce.number().positive('Estimate the hours it takes.').max(500, 'At most 500 hours.'),
};

export const courseSchema = z.object({
  title: course.title,
  summary: course.summary.default(''),
  cover: course.cover.default('primary'),
  level: course.level.default('beginner'),
  topics: course.topics.default([]),
  skills: course.skills.default([]),
  est_hours: course.est_hours.default(1),
});

export const coursePatchSchema = z.object({ ...course, published: z.boolean() }).partial();

export const moduleSchema = z.object({
  title: z.string().trim().min(1, 'Name the module.').max(120, 'Keep the module name under 120 characters.'),
});

export const questionSchema = z.object({
  prompt: z.string().trim().min(1, 'Every question needs a prompt.').max(500),
  options: z.array(z.string().trim().max(300)).min(2, 'Every question needs at least two options.').max(6, 'Up to six options.'),
  correct: z.number().int().min(0),
  explanation: z.string().trim().max(1000).optional(),
});

const lesson = {
  title: z.string().trim().min(1, 'Give the lesson a title.').max(120, 'Keep the title under 120 characters.'),
  kind: z.enum(LESSON_KINDS),
  body: z.string().max(20000, 'Keep the text under 20,000 characters.'),
  url: httpsUrl.nullable(),
  quiz: z.array(questionSchema).max(30, 'Up to 30 questions per quiz.'),
  duration_min: z.coerce.number().int().min(1, 'At least a minute.').max(600, 'At most 10 hours.'),
};

/** A lesson must carry what its kind needs: text, a link, or a usable quiz. */
export function lessonProblem(l: { kind: string; body?: string; url?: string | null; quiz?: z.infer<typeof questionSchema>[] }): string | null {
  if (l.kind === 'text' && !l.body?.trim()) return 'Write the lesson text.';
  if ((l.kind === 'video' || l.kind === 'link') && !l.url) return l.kind === 'video' ? 'Paste the video link.' : 'Paste the resource link.';
  if (l.kind === 'quiz') return quizProblem((l.quiz ?? []).map((q) => ({ ...q, explanation: q.explanation ?? '' })));
  return null;
}

export const lessonSchema = z
  .object({
    title: lesson.title,
    kind: lesson.kind,
    body: lesson.body.default(''),
    url: lesson.url.optional(),
    quiz: lesson.quiz.default([]),
    duration_min: lesson.duration_min.default(5),
  })
  .superRefine((l, ctx) => {
    const problem = lessonProblem(l);
    if (problem) ctx.addIssue({ code: 'custom', message: problem });
  });

/** Checked against the stored lesson in the route, once merged. */
export const lessonPatchSchema = z.object(lesson).partial();

export const reorderSchema = z.discriminatedUnion('scope', [
  z.object({ scope: z.literal('modules'), ids: z.array(z.string().uuid()).max(200) }),
  z.object({ scope: z.literal('lessons'), module_id: z.string().uuid(), ids: z.array(z.string().uuid()).max(500) }),
]);

export const progressSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('view') }),
  z.object({ action: z.literal('complete'), done: z.boolean().optional() }),
  z.object({ action: z.literal('quiz'), answers: z.array(z.number().int().min(0).nullable()).max(30) }),
]);

const roomPath = z
  .string()
  .trim()
  .max(500)
  .refine((v) => !v || isRoomPath(v), 'Use an in-app room path like /call/abc123 or a full https:// meeting link.')
  .transform((v) => v || null);

const workshop = {
  title: z.string().trim().min(3, 'Give the workshop a title of at least 3 characters.').max(120),
  description: z.string().trim().max(2000, 'Keep the description under 2,000 characters.'),
  starts_at: z
    .string()
    .min(10, 'Pick a date and time.')
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'That date and time could not be read.'),
  duration_min: z.coerce.number().int().min(15, 'At least 15 minutes.').max(480, 'At most 8 hours.'),
  capacity: z.coerce.number().int().min(1, 'At least one seat.').max(1000, 'At most 1,000 seats.'),
  location: z.string().trim().max(120),
  room_path: roomPath.nullable(),
  topics: tags,
  course_id: z.string().uuid().nullable(),
};

export const workshopSchema = z.object({
  title: workshop.title,
  description: workshop.description.default(''),
  starts_at: workshop.starts_at,
  duration_min: workshop.duration_min.default(60),
  capacity: workshop.capacity.default(50),
  location: workshop.location.default('Online'),
  room_path: workshop.room_path.optional(),
  topics: workshop.topics.default([]),
  course_id: workshop.course_id.optional(),
});

export const workshopPatchSchema = z.object({ ...workshop, cancelled: z.boolean() }).partial();

/** Parse a JSON body, or the 400 response to return. */
export async function readBody<S extends z.ZodTypeAny>(
  request: Request,
  schema: S,
  fallback = 'Check the details and try again.'
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: fallback }, { status: 400 }) };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, response: NextResponse.json({ error: parsed.error.issues[0]?.message ?? fallback }, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });
