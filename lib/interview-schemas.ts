import { z } from 'zod';
import { PROCTOR_TYPES } from '@/lib/interview-logic';

/** Request bodies for the interview routes. */

const when = z
  .string()
  .min(10, 'Pick a date and time.')
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'That date and time could not be read.');

export const codingContentSchema = z.object({
  problem: z.string().trim().min(10, 'Write the problem statement — at least 10 characters.').max(5000),
  language: z.string().trim().min(1).max(40).default('javascript'),
  starter: z.string().max(5000).optional(),
});

export const mcqQuestionSchema = z
  .object({
    id: z.string().min(1).max(40),
    prompt: z.string().trim().min(3, 'Every question needs a prompt.').max(1000),
    options: z.array(z.string().trim().min(1, 'Options cannot be empty.').max(300)).min(2, 'Give at least two options.').max(6),
    answer: z.number().int().min(0),
  })
  .refine((q) => q.answer < q.options.length, 'Mark the correct option for every question.');

export const mcqContentSchema = z.object({
  instructions: z.string().max(1000).optional(),
  questions: z.array(mcqQuestionSchema).min(1, 'Add at least one question.').max(50),
});

/** The stored form of a round's content; throws a ZodError if it does not fit the kind. */
export function normalizeContent(kind: 'video' | 'coding' | 'mcq', content: unknown): Record<string, unknown> {
  if (kind === 'coding') return codingContentSchema.parse(content);
  if (kind === 'mcq') return mcqContentSchema.parse(content);
  return {};
}

export const roundInputSchema = z
  .object({
    title: z.string().trim().min(2, 'Name each round.').max(80),
    kind: z.enum(['video', 'coding', 'mcq']),
    scheduled_at: when,
    duration_min: z.number().int().min(10).max(240).default(45),
    interviewer_id: z.string().uuid().optional(),
    proctored: z.boolean().default(true),
    content: z.record(z.string(), z.unknown()).default({}),
  })
  .superRefine((r, ctx) => {
    const schema = r.kind === 'coding' ? codingContentSchema : r.kind === 'mcq' ? mcqContentSchema : null;
    if (!schema) return;
    const parsed = schema.safeParse(r.content);
    if (!parsed.success) {
      ctx.addIssue({ code: 'custom', path: ['content'], message: `${r.title}: ${parsed.error.issues[0]?.message ?? 'check the content'}` });
    }
  });

export const createInterviewSchema = z.object({
  candidate_id: z.string().uuid('Choose a candidate.'),
  title: z.string().trim().min(3, 'Give the interview a title of at least 3 characters.').max(120),
  company: z.string().trim().max(120).optional(),
  description: z.string().trim().max(2000).optional(),
  opportunity_id: z.string().uuid().nullable().optional(),
  request_id: z.string().uuid().nullable().optional(),
  rounds: z.array(roundInputSchema).min(1, 'Add at least one round.').max(8, 'Eight rounds at most.'),
});

export const updateInterviewSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(),
  company: z.string().trim().max(120).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  status: z.enum(['active', 'cancelled']).optional(),
  decision: z.enum(['pending', 'selected', 'rejected', 'on_hold']).optional(),
  decision_note: z.string().trim().max(1000).nullable().optional(),
  release_decision: z.boolean().optional(),
});

export const staffRoundUpdateSchema = z.object({
  title: z.string().trim().min(2).max(80).optional(),
  scheduled_at: when.optional(),
  duration_min: z.number().int().min(10).max(240).optional(),
  status: z.enum(['scheduled', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
  outcome: z.enum(['pending', 'passed', 'failed']).optional(),
  proctored: z.boolean().optional(),
  content: z.record(z.string(), z.unknown()).optional(),
  release: z.boolean().optional(),
});

export const candidateRoundUpdateSchema = z.object({
  response: z.enum(['accepted', 'reschedule_requested']),
  note: z.string().trim().max(500).optional(),
});

export const scorecardSchema = z.object({
  ratings: z.record(z.string(), z.number().int().min(1).max(5)),
  recommendation: z.enum(['strong_yes', 'yes', 'no', 'strong_no']).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
  feedback: z.string().max(2000).nullable().optional(),
});

export const submissionSchema = z.object({
  code: z.string().max(100000).optional(),
  language: z.string().max(40).optional(),
  answers: z.record(z.string(), z.number().int().min(0).max(10)).optional(),
  final: z.boolean().default(false),
});

export const proctorBatchSchema = z.object({
  round_id: z.string().uuid(),
  events: z
    .array(
      z.object({
        type: z.enum(PROCTOR_TYPES),
        at: z.string().min(10),
        duration_ms: z.number().nonnegative().nullable().optional(),
        detail: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional(),
      })
    )
    .min(1)
    .max(100),
});

export function firstIssue(error: unknown, fallback = 'Check the form.'): string {
  if (error instanceof z.ZodError) return error.issues[0]?.message ?? fallback;
  return fallback;
}
