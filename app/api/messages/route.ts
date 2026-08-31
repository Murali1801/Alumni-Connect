import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { listMessages, listThreads, markThreadRead, sendMessage } from '@/lib/messages';

export const dynamic = 'force-dynamic';

const sendSchema = z.object({
  to: z.string().uuid(),
  body: z.string().min(1).max(2000),
});

export async function GET(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;

  const peer = new URL(request.url).searchParams.get('peer');
  if (!peer) {
    return NextResponse.json(await listThreads(auth.user.id));
  }

  const messages = await listMessages(auth.user.id, peer);
  // Opening a thread is what marks it read.
  await markThreadRead(auth.user.id, peer);
  return NextResponse.json(messages);
}

export async function POST(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;

  try {
    const body = sendSchema.parse(await request.json());
    const message = await sendMessage(auth.user.id, body.to, body.body);
    return NextResponse.json(message, { status: 201 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid message' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message ?? 'Could not send' }, { status: 400 });
  }
}
