import { NextResponse } from 'next/server';
import { z } from 'zod';
import { claimRecord, getClaimableRecord } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

const claimSchema = z.object({
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Choose a password.'),
});

/** Preview the record behind a claim token. Never exposes contact columns. */
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const record = await getClaimableRecord(token);
  if (!record) {
    return NextResponse.json({ error: 'Claim link not found or already used' }, { status: 404 });
  }
  return NextResponse.json(record);
}

/** Create the account and claim the record in one step. */
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let body: z.infer<typeof claimSchema>;
  try {
    body = claimSchema.parse(await request.json());
  } catch (error: any) {
    const message =
      error instanceof z.ZodError ? error.issues[0]?.message : 'Check the details you entered.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const result = await claimRecord(token, body.email.trim().toLowerCase(), body.password);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true, email: result.email }, { status: 201 });
}
