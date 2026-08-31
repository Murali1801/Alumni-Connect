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

/** Model used when an OpenRouter key is configured. Free tier on OpenRouter. */
const MODEL = process.env.OPENROUTER_MODEL ?? 'meta-llama/llama-3.3-70b-instruct:free';

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

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // OpenRouter asks for these for attribution; they are not secrets.
        'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
        'X-Title': 'SJCEM Alumni Network',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 700,
        temperature: 0.4,
        messages: [
          { role: 'system', content: system },
          ...(body.history ?? []),
          { role: 'user', content: body.question },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });

    if (!res.ok) {
      console.warn(`assistant: OpenRouter returned ${res.status}; falling back to the knowledge base`);
      return NextResponse.json(offlineAnswer(body.question, role));
    }

    const data = await res.json();
    const answer: string | undefined = data?.choices?.[0]?.message?.content?.trim();
    if (!answer) return NextResponse.json(offlineAnswer(body.question, role));

    return NextResponse.json({ answer, sources: context, mode: 'llm' as const });
  } catch (err) {
    // A model outage must never take the help panel down.
    console.warn('assistant: LLM call failed, falling back to the knowledge base', err);
    return NextResponse.json(offlineAnswer(body.question, role));
  }
}
