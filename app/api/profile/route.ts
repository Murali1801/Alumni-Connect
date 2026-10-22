import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const text = (max: number) => z.string().trim().max(max);
const skills = z
  .array(z.string().trim().min(1).max(40))
  .max(30)
  // Case-insensitive de-duplication that keeps the first spelling ("React", not a later "react").
  .transform((list) => list.filter((s, i) => list.findIndex((x) => x.toLowerCase() === s.toLowerCase()) === i));

/** Any subset of the fields a profile shows; unknown keys are rejected. */
const patchSchema = z
  .object({
    full_name: text(80).min(2, 'Your name needs at least 2 characters.'),
    location: text(80),
    bio: text(2000),
    skills,
    // Alumni
    designation: text(80),
    current_company_id: z.string().uuid().nullable(),
    industry: text(80),
    experience_years: z.number().int().min(0, 'Years cannot be negative.').max(60, 'That is more than 60 years.').nullable(),
    mentorship_available: z.boolean(),
    mock_interview_available: z.boolean(),
    referral_available: z.boolean(),
    internship_available: z.boolean(),
    // Students
    branch: text(20).min(1),
    batch_year: z.number().int().min(2000, 'Pick a year between 2000 and 2035.').max(2035, 'Pick a year between 2000 and 2035.'),
    target_role: text(80),
    target_company: text(80),
    target_industry: text(80),
  })
  .partial()
  .strict();

const ALUMNI_FIELDS = [
  'location', 'bio', 'skills', 'designation', 'current_company_id', 'industry', 'experience_years',
  'mentorship_available', 'mock_interview_available', 'referral_available', 'internship_available',
] as const;
const STUDENT_FIELDS = ['bio', 'skills', 'branch', 'batch_year', 'target_role', 'target_company', 'target_industry'] as const;

/**
 * Edit your own profile in place: send only the fields that changed. Alumni
 * cannot change branch or batch (those come from the college record).
 */
export async function PATCH(request: Request) {
  const auth = await requireApiUser(['student', 'alumni']);
  if (!auth.ok) return auth.response;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Check the profile details.' }, { status: 400 });
  }
  const body = parsed.data;
  const db = createAdminClient();
  const now = new Date().toISOString();

  if (body.full_name) {
    const { error } = await db.from('users').update({ full_name: body.full_name }).eq('id', auth.user.id);
    if (error) return NextResponse.json({ error: 'Could not update your name.' }, { status: 500 });
  }

  if (auth.user.role === 'alumni') {
    if (body.branch !== undefined || body.batch_year !== undefined) {
      return NextResponse.json({ error: 'Branch and batch come from the college record and cannot be edited.' }, { status: 400 });
    }
    const update = Object.fromEntries(ALUMNI_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k] === '' ? null : body[k]]));
    if (Object.keys(update).length) {
      const { data, error } = await db.from('alumni_profiles').update({ ...update, updated_at: now }).eq('user_id', auth.user.id).select('user_id');
      if (error) return NextResponse.json({ error: 'Could not update your profile.' }, { status: 500 });
      if (!data?.length) return NextResponse.json({ error: 'Claim your record first to edit your profile.' }, { status: 404 });
    }
  } else {
    const update: Record<string, unknown> = Object.fromEntries(
      STUDENT_FIELDS.filter((k) => body[k] !== undefined).map((k) => [k, body[k] === '' ? null : body[k]])
    );
    if (body.location !== undefined) update.location_pref = body.location || null;
    if (Object.keys(update).length) {
      const { data: existing } = await db.from('student_profiles').select('user_id').eq('user_id', auth.user.id).maybeSingle();
      if (!existing && (!update.branch || !update.batch_year)) {
        return NextResponse.json({ error: 'Add your branch and batch first.' }, { status: 400 });
      }
      const { error } = existing
        ? await db.from('student_profiles').update({ ...update, updated_at: now }).eq('user_id', auth.user.id)
        : await db.from('student_profiles').insert({ user_id: auth.user.id, skills: [], ...update });
      if (error) return NextResponse.json({ error: 'Could not update your profile.' }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}
