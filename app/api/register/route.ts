import { NextResponse } from 'next/server';
import { z } from 'zod';
import { registerStudent } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

const currentYear = new Date().getFullYear();

const registerSchema = z.object({
  full_name: z.string().trim().min(2, 'Enter your full name.').max(120),
  email: z.string().email('Enter a valid email address.'),
  password: z.string().min(1, 'Choose a password.'),
  branch: z.enum(['COMP', 'IT', 'EXTC', 'CIVIL', 'MECH']),
  batch_year: z
    .number()
    .int()
    .min(currentYear - 4, 'That graduating year is too far in the past.')
    .max(currentYear + 6, 'That graduating year is too far ahead.'),
});

/**
 * Student self-registration.
 *
 * Alumni cannot register here — they enter by claiming a record from the
 * college register, which is what makes the directory trustworthy. Students are
 * not in that register, so there is nothing to verify them against; the role is
 * therefore fixed to 'student' and can never be set by the caller.
 */
export async function POST(request: Request) {
  let body: z.infer<typeof registerSchema>;
  try {
    body = registerSchema.parse(await request.json());
  } catch (error: any) {
    const message =
      error instanceof z.ZodError ? error.issues[0]?.message : 'Check the details you entered.';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const result = await registerStudent({
    fullName: body.full_name.trim(),
    email: body.email.trim().toLowerCase(),
    password: body.password,
    branch: body.branch,
    batchYear: body.batch_year,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ success: true, email: result.email }, { status: 201 });
}
