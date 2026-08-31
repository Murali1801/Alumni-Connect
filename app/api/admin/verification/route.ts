import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const decisionSchema = z.object({
  recordId: z.string().uuid(),
  action: z.enum(['verified', 'rejected']),
  note: z.string().max(300).optional(),
});

export async function GET() {
  const auth = await requireApiUser(['admin']);
  if (!auth.ok) return auth.response;

  const db = createAdminClient();
  const { data, error } = await db
    .from('alumni_records')
    .select(
      `id, student_id, full_name, branch, batch_year, city, first_role, first_ctc_lpa, claim_status, claimed_at,
       claimant:users!claimed_by ( id, full_name, email ),
       alumni_profiles ( designation, location, linkedin_url, experience_years, skills )`
    )
    .eq('claim_status', 'claimed')
    .order('claimed_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PUT(request: Request) {
  const auth = await requireApiUser(['admin']);
  if (!auth.ok) return auth.response;

  try {
    const body = decisionSchema.parse(await request.json());
    const db = createAdminClient();

    const { data: record } = await db
      .from('alumni_records')
      .select('id, claim_status, claimed_by')
      .eq('id', body.recordId)
      .maybeSingle();
    if (!record) return NextResponse.json({ error: 'Record not found' }, { status: 404 });
    if (record.claim_status !== 'claimed') {
      return NextResponse.json(
        { error: `This record is ${record.claim_status}, not awaiting review.` },
        { status: 409 }
      );
    }

    const { error } = await db
      .from('alumni_records')
      .update({
        claim_status: body.action,
        verified_by: auth.user.id,
        verified_at: new Date().toISOString(),
      })
      .eq('id', body.recordId);
    if (error) throw error;

    // Accountability: who decided what, when, and on which record.
    await db.from('audit_log').insert({
      actor_id: auth.user.id,
      action: `mark_${body.action}`,
      target_type: 'alumni_records',
      target_id: body.recordId,
      detail: { note: body.note ?? null, claimed_by: record.claimed_by },
    });

    return NextResponse.json({ success: true, status: body.action });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message ?? 'Could not record the decision' }, { status: 400 });
  }
}
