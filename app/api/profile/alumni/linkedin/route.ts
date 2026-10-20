import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser } from '@/lib/api-auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { findOrCreateCompany } from '@/lib/companies';
import { linkedinImportSchema } from '@/lib/linkedin/schema';

export const dynamic = 'force-dynamic';

/**
 * Publish the parts of a LinkedIn export the alumnus approved on the review
 * screen. The archive itself never reaches the server: it is parsed in the
 * browser and only this validated JSON is sent.
 */

/** PostgREST reports a column it does not know as PGRST204; Postgres as 42703. */
function isMissingColumn(error: { code?: string } | null) {
  return error?.code === 'PGRST204' || error?.code === '42703';
}

const MIGRATION_HINT =
  'The database is missing the LinkedIn profile columns. Apply supabase/migrations/0002_linkedin_profile.sql.';

export async function POST(request: Request) {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;

  let payload;
  try {
    payload = linkedinImportSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof z.ZodError
        ? `${error.issues[0]?.path.join('.') || 'body'}: ${error.issues[0]?.message}`
        : 'Invalid request body';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { current_company_name, ...fields } = payload;
  const update: Record<string, unknown> = {
    ...fields,
    profile_source: 'linkedin_export',
    linkedin_imported_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  try {
    if (current_company_name !== undefined) {
      const company = current_company_name
        ? await findOrCreateCompany(createAdminClient(), current_company_name)
        : null;
      update.current_company_id = company?.id ?? null;
    }

    // The user's own client, so the "alumni can update own profile" policy applies.
    const supabase = await createClient();
    const { data, error } = await supabase
      .from('alumni_profiles')
      .update(update)
      .eq('user_id', auth.user.id)
      .select('id');

    if (isMissingColumn(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
    if (error) throw error;
    if (!data?.length) {
      return NextResponse.json(
        { error: 'No profile to update. Claim your alumni record first.' },
        { status: 404 },
      );
    }

    await supabase.from('engagement_events').insert({
      user_id: auth.user.id,
      event_type: 'linkedin_imported',
      metadata: {
        sections: Object.keys(payload),
        positions: payload.positions?.length ?? null,
        skills: payload.skills?.length ?? null,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : (error as { message?: string })?.message;
    return NextResponse.json({ error: message ?? 'Could not save the import' }, { status: 500 });
  }
}

/** Remove everything a LinkedIn import added beyond the basic profile fields. */
export async function DELETE() {
  const auth = await requireApiUser(['alumni']);
  if (!auth.ok) return auth.response;

  const supabase = await createClient();
  const { error } = await supabase
    .from('alumni_profiles')
    .update({
      headline: null,
      websites: [],
      positions: [],
      education: [],
      certifications: [],
      projects: [],
      profile_source: 'manual',
      linkedin_imported_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', auth.user.id);

  if (isMissingColumn(error)) return NextResponse.json({ error: MIGRATION_HINT }, { status: 503 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
