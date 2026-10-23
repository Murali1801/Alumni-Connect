import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * The sign-in page's demo buttons. The server signs in to the fixed demo
 * account and sets the session cookie, so the demo passwords stay Worker
 * secrets instead of shipping in the page's JavaScript; the alumnus one is the
 * common password that also opens real members' accounts.
 */
const DEMO = {
  alumni: { email: 'alumni1@v3.demo.com', secret: 'DEMO_ALUMNUS_PASSWORD' },
  admin: { email: 'admin@v3.demo.com', secret: 'DEMO_ADMIN_PASSWORD' },
} as const;

const schema = z.object({ account: z.enum(['alumni', 'admin']) });

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Unknown demo account.' }, { status: 400 });

  const { email, secret } = DEMO[parsed.data.account];
  const password = process.env[secret];
  if (!password) return NextResponse.json({ error: 'This demo account is not available right now.' }, { status: 503 });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return NextResponse.json({ error: 'The demo account could not sign in.' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
