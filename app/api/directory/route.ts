import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { scoreMatch } from '@/lib/matching';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 1. Get the current student's profile for matching (if student)
  const { data: student } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // 2. Fetch alumni.
  // We simulate the `alumni_directory` view by fetching records and joining profiles,
  // making sure NOT to expose contact_email or contact_mobile.
  // Create an admin client to bypass RLS so we can fetch both claimed and unclaimed records securely
  const supabaseAdmin = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  let query = supabaseAdmin
    .from('alumni_records')
    .select(`
      id, full_name, branch, batch_year, city, first_company_id, first_role, first_ctc_lpa, claim_status,
      alumni_profiles (
        user_id, current_company_id, designation, industry, location, experience_years,
        skills, linkedin_url, bio, mentorship_available, mock_interview_available, referral_available, internship_available,
        current_company:companies(id, name, name_canonical)
      )
    `)
    .limit(500); // Pagination in real world

  const { data: rawAlumni, error } = await query;

  if (error) {
    console.error('Directory fetch error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // 3. Process matching and sorting
  let results = (rawAlumni || []).map((record) => {
    // If we have a student profile, we score. Else just return raw
    const matchRes = student 
      ? scoreMatch(student, { ...record }, 'mentorship') // default context for directory is mentorship
      : { score: 0, signals: [], matchable: record.claim_status === 'claimed', fallbackReason: 'No student profile to match against.' };
    
    return {
      record,
      match: matchRes
    };
  });

  results.sort((a, b) => {
    const aClaimed = a.record.claim_status === 'claimed' || a.record.claim_status === 'verified';
    const bClaimed = b.record.claim_status === 'claimed' || b.record.claim_status === 'verified';
    if (aClaimed && !bClaimed) return -1;
    if (!aClaimed && bClaimed) return 1;
    return b.match.score - a.match.score;
  });

  return NextResponse.json(results);
}
