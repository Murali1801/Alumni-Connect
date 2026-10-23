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
 * Who writes the answer, in order: Groq first (fast, an answer in about a
 * second), then OpenRouter's free models if a key for it is set. Each model is
 * tried in turn and the first that answers wins; if all of them fail, the
 * retrieved sources still answer on their own.
 *
 * Both speak the OpenAI chat-completions format. Override the models with a
 * comma-separated GROQ_MODEL or OPENROUTER_MODEL; check
 * https://console.groq.com/docs/models if Groq retires one.
 */
type Provider = { name: string; url: string; key: string | undefined; models: string[]; headers?: Record<string, string> };

const list = (value: string) => value.split(',').map((m) => m.trim()).filter(Boolean);

function providers(): Provider[] {
  return [
    {
      name: 'groq',
      url: 'https://api.groq.com/openai/v1/chat/completions',
      key: process.env.GROQ_API_KEY,
      models: list(process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b,qwen/qwen3.8-27b,openai/gpt-oss-20b'),
    },
    {
      name: 'openrouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      key: process.env.OPENROUTER_API_KEY,
      models: list(process.env.OPENROUTER_MODEL ?? 'google/gemma-4-31b-it:free,nvidia/nemotron-3-super-120b-a12b:free'),
      // OpenRouter asks for these for attribution; they are not secrets.
      headers: { 'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000', 'X-Title': 'AlumniBridge' },
    },
  ].filter((p) => p.key && p.models.length);
}

/**
 * Per-model budget, and a hard ceiling across all attempts. Groq answers in a
 * second or two; OpenRouter's free models can take 10 to 30. A serverless
 * function that runs past its platform limit is killed with no response at
 * all, so stopping ourselves at 40s means the offline answer still gets out.
 */
const MODEL_TIMEOUT_MS = 14_000;
const TOTAL_BUDGET_MS = 40_000;
// Reasoning models spend part of this thinking before they write.
const MAX_ANSWER_TOKENS = 1_200;

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

  const writers = providers();
  if (!writers.length) return offline();

  const system = buildSystemPrompt({
    role: user.role,
    firstName: user.full_name.split(/\s+/)[0] || user.full_name,
    today: new Date(),
    blocks: chosen,
  });
  const messages = buildMessages(system, body.history, body.question);
  const deadline = started + TOTAL_BUDGET_MS;

  for (const provider of writers) {
    for (const model of provider.models) {
      // Do not start an attempt we cannot finish inside the budget.
      const remaining = deadline - Date.now();
      if (remaining < 4_000) {
        console.warn('assistant: out of time budget, answering from the sources');
        return offline();
      }

      try {
        const res = await fetch(provider.url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${provider.key}`, 'Content-Type': 'application/json', ...provider.headers },
          body: JSON.stringify({ model, max_tokens: MAX_ANSWER_TOKENS, temperature: 0.3, messages }),
          signal: AbortSignal.timeout(Math.min(MODEL_TIMEOUT_MS, remaining)),
        });

        if (!res.ok) {
          // 429 is a rate limit; 404 means the model was retired. Either way
          // the next model may still answer.
          console.warn(`assistant: ${provider.name} ${model} returned ${res.status}, trying the next model`);
          continue;
        }

        const data = await res.json();
        const raw: string | undefined = data?.choices?.[0]?.message?.content?.trim();
        if (!raw) {
          console.warn(`assistant: ${provider.name} ${model} returned an empty answer, trying the next model`);
          continue;
        }

        const { answer, sources } = citedSources(raw, chosen);
        return NextResponse.json({ answer, sources, mode: 'llm' as const, model });
      } catch (err) {
        console.warn(`assistant: ${provider.name} ${model} failed (${(err as Error).message}), trying the next model`);
      }
    }
  }

  // Every model was rate-limited or down — the retrieved sources still answer.
  console.warn('assistant: all models unavailable, answering from the sources');
  return offline();
}
