import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { retrieve } from '@/lib/chatbot/rag';
import {
  RAG_LIMITS,
  buildMessages,
  buildSystemPrompt,
  citedSources,
  offlineAnswer,
  selectBlocks,
} from '@/lib/chatbot/rag-core';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The help assistant, grounded in retrieval.
 *
 *   POST /api/assistant  { question: string (2-500), history?: { role, content }[] (max 10) }
 *
 *   200 { answer: string,
 *         sources: { n: number, title: string, url: string | null, kind: 'doc'|'account'|'job'|'post'|'person' }[],
 *         mode: 'llm' | 'offline', model?: string }
 *
 * `answer` cites sources inline as [1], [2]; `sources` lists exactly the
 * numbers the answer cites, so the panel can link each one. Every request
 * retrieves fresh: knowledge docs, and when the question calls for them open
 * listings, recent posts, members and the asker's own account (lib/chatbot/rag.ts).
 */

const askSchema = z.object({
  question: z.string().trim().min(2).max(RAG_LIMITS.questionMax),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(4000) }))
    .max(10)
    .optional(),
});

/**
 * Models to try, in order, when an OpenRouter key is configured.
 *
 * OpenRouter's free tier rate-limits hard and unpredictably — in testing three
 * of four candidates returned 429 within the same second — so a single model is
 * not dependable. Each is tried in turn and the first that answers wins; if all
 * of them fail the retrieved sources still answer.
 *
 * Override with a comma-separated OPENROUTER_MODEL. Free slugs also come and go
 * (the one this shipped with stopped being free), so check
 * https://openrouter.ai/models?max_price=0 if every model starts failing.
 */
const MODELS = (
  process.env.OPENROUTER_MODEL ??
  'minimax/minimax-m2.7:free,google/gemma-4-31b-it:free,z-ai/glm-5.2:free,nvidia/nemotron-3-super-120b-a12b:free'
)
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);

/**
 * Per-model budget, and a hard ceiling across all attempts.
 *
 * Free models are slow — 10 to 30 seconds is normal — and a serverless function
 * that runs past its platform limit is killed with no response at all. Stopping
 * ourselves at 40s means the offline answer still gets returned instead.
 */
const MODEL_TIMEOUT_MS = 14_000;
const TOTAL_BUDGET_MS = 40_000;
const MAX_ANSWER_TOKENS = 700;

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  let body: z.infer<typeof askSchema>;
  try {
    body = askSchema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: `Ask a question between 2 and ${RAG_LIMITS.questionMax} characters.` },
      { status: 400 }
    );
  }

  const user = auth.user;
  const started = Date.now();
  const { blocks } = await retrieve(user, body.question);
  const chosen = selectBlocks(blocks);
  const offline = () => NextResponse.json({ ...offlineAnswer(blocks, user.role), mode: 'offline' as const });

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return offline();

  const system = buildSystemPrompt({
    role: user.role,
    firstName: user.full_name.split(/\s+/)[0] || user.full_name,
    today: new Date(),
    blocks: chosen,
  });
  const messages = buildMessages(system, body.history, body.question);
  const deadline = started + TOTAL_BUDGET_MS;

  for (const model of MODELS) {
    // Do not start an attempt we cannot finish inside the budget.
    const remaining = deadline - Date.now();
    if (remaining < 4_000) {
      console.warn('assistant: out of time budget, answering from the sources');
      break;
    }

    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          // OpenRouter asks for these for attribution; they are not secrets.
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
          'X-Title': 'AlumniBridge',
        },
        body: JSON.stringify({ model, max_tokens: MAX_ANSWER_TOKENS, temperature: 0.3, messages }),
        signal: AbortSignal.timeout(Math.min(MODEL_TIMEOUT_MS, remaining)),
      });

      if (!res.ok) {
        // 429 is routine on the free tier; 404 means the slug stopped being
        // free. Either way the next model may still answer.
        console.warn(`assistant: ${model} returned ${res.status}, trying the next model`);
        continue;
      }

      const data = await res.json();
      const raw: string | undefined = data?.choices?.[0]?.message?.content?.trim();
      if (!raw) {
        console.warn(`assistant: ${model} returned an empty answer, trying the next model`);
        continue;
      }

      const { answer, sources } = citedSources(raw, chosen);
      return NextResponse.json({ answer, sources, mode: 'llm' as const, model });
    } catch (err) {
      console.warn(`assistant: ${model} failed (${(err as Error).message}), trying the next model`);
    }
  }

  // Every model was rate-limited or down — the retrieved sources still answer.
  console.warn('assistant: all models unavailable, answering from the sources');
  return offline();
}
