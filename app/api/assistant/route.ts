import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { FACTS, searchFacts, type Fact } from '@/lib/chatbot/knowledge';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const askSchema = z.object({
  question: z.string().min(2).max(500),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().max(2000) }))
    .max(10)
    .optional(),
});

/**
 * Models to try, in order, when an OpenRouter key is configured.
 *
 * OpenRouter's free tier rate-limits hard and unpredictably — in testing three
 * of four candidates returned 429 within the same second — so a single model is
 * not dependable. Each is tried in turn and the first that answers wins; if all
 * of them fail the curated knowledge base still answers.
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
 * ourselves at 40s means the curated answer still gets returned instead.
 */
const MODEL_TIMEOUT_MS = 14_000;
const TOTAL_BUDGET_MS = 40_000;

function grounded(facts: Fact[]) {
  return facts
    .map((f) => `### ${f.question}\n${f.answer}${f.href ? `\n(Relevant page: ${f.href})` : ''}`)
    .join('\n\n');
}

/**
 * Answer without a model: return the best-matching curated entries verbatim.
 * This is the default path, and the fallback whenever the LLM call fails.
 */
const HELP_HREF: Record<string, string> = {
  student: '/student/help',
  alumni: '/alumni/help',
  admin: '/admin/help',
};

function offlineAnswer(question: string, role: string) {
  const hits = searchFacts(question, role, 2);

  if (hits.length === 0) {
    return {
      answer:
        `I do not have a documented answer for that. I can cover claiming records, match scores, requests and availability, messaging, video sessions, privacy, and what each role can do.\n\n` +
        `For anything about your own account — a wrong record, a claim invitation that never arrived, or being locked out — the placement cell is the right place to ask. The Help page has the full guides.`,
      sources: [{ id: 'help', question: 'Help', href: HELP_HREF[role], hrefLabel: 'Open the Help page' }],
      mode: 'offline' as const,
    };
  }

  // Lead with the strongest match. A second entry is only appended when the
  // scorer judged it genuinely close, and it is labelled rather than merged.
  const [best, ...rest] = hits;
  const answer =
    rest.length > 0
      ? `${best.answer}\n\nRelated — ${rest[0].question.toLowerCase().replace(/\?$/, '')}: ${rest[0].answer}`
      : best.answer;

  return { answer, sources: hits, mode: 'offline' as const };
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth.ok) return auth.response;

  let body: z.infer<typeof askSchema>;
  try {
    body = askSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: 'Ask a question between 2 and 500 characters.' }, { status: 400 });
  }

  const role = auth.user.role;
  const context = searchFacts(body.question, role, 4);
  const apiKey = process.env.OPENROUTER_API_KEY;

  // No key configured — serve the curated answer directly.
  if (!apiKey) {
    return NextResponse.json(offlineAnswer(body.question, role));
  }

  try {
    // Two modes in one prompt. Questions about the platform must stay pinned to
    // the reference material so the bot cannot invent a feature; everything else
    // is answered like a normal assistant, because a career-help chatbot that
    // refuses to discuss careers is useless.
    const system = [
      'You are the assistant inside the SJCEM Alumni Network, a mentorship platform for students and alumni of St John College of Engineering and Management.',
      `The person you are talking to is signed in as a ${role}.`,
      '',
      'You handle two kinds of question, and the rules differ:',
      '',
      '1. QUESTIONS ABOUT THIS PLATFORM (how matching works, requests, claiming, video sessions, messaging, privacy, where a page is).',
      '   Answer strictly from the REFERENCE MATERIAL below. Never invent a feature, a page, a button, a setting or a policy.',
      '   If the reference material does not cover it, say plainly that you do not know and point them at the Help page or the placement cell.',
      '',
      '2. EVERYTHING ELSE (interview preparation, choosing a career path, explaining a technology, how to write a good outreach message, general study or job-search advice).',
      '   Answer normally and helpfully, as a knowledgeable careers-minded assistant would. You are not restricted to the reference material here.',
      '   Where it is genuinely relevant, connect the advice back to something the platform can actually do — but only using features described in the reference material.',
      '',
      'Style: plain British English, conversational, and concise — two or three short paragraphs at most. Use a short list only when the answer is genuinely a list. Do not open with filler like "Great question".',
      'Never claim to see the user\'s own data: you cannot read their profile, requests, messages or sessions. If asked about their specific account, tell them which page shows it.',
      '',
      '--- REFERENCE MATERIAL (about this platform) ---',
      grounded(context.length ? context : FACTS.slice(0, 8)),
    ].join('\n');

    const messages = [
      { role: 'system', content: system },
      ...(body.history ?? []),
      { role: 'user', content: body.question },
    ];

    const deadline = Date.now() + TOTAL_BUDGET_MS;

    for (const model of MODELS) {
      // Do not start an attempt we cannot finish inside the budget.
      const remaining = deadline - Date.now();
      if (remaining < 4_000) {
        console.warn('assistant: out of time budget, using the knowledge base');
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
            'X-Title': 'SJCEM Alumni Network',
          },
          body: JSON.stringify({ model, max_tokens: 700, temperature: 0.4, messages }),
          signal: AbortSignal.timeout(Math.min(MODEL_TIMEOUT_MS, remaining)),
        });

        if (!res.ok) {
          // 429 is routine on the free tier; 404 means the slug stopped being
          // free. Either way the next model may still answer.
          console.warn(`assistant: ${model} returned ${res.status}, trying the next model`);
          continue;
        }

        const data = await res.json();
        const answer: string | undefined = data?.choices?.[0]?.message?.content?.trim();
        if (!answer) {
          console.warn(`assistant: ${model} returned an empty answer, trying the next model`);
          continue;
        }

        return NextResponse.json({ answer, sources: context, mode: 'llm' as const, model });
      } catch (err) {
        console.warn(`assistant: ${model} failed (${(err as Error).message}), trying the next model`);
      }
    }

    // Every model was rate-limited or down — the curated answer still stands.
    console.warn('assistant: all models unavailable, using the knowledge base');
    return NextResponse.json(offlineAnswer(body.question, role));
  } catch (err) {
    // A model outage must never take the help panel down.
    console.warn('assistant: LLM call failed, falling back to the knowledge base', err);
    return NextResponse.json(offlineAnswer(body.question, role));
  }
}
