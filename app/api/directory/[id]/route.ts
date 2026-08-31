import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { scoreMatch } from '@/lib/matching';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const recordId = (await params).id;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // 1. Get the current student's profile for matching
  const { data: student } = await supabase
    .from('student_profiles')
    .select('*')
    .eq('user_id', user.id)
    .single();

  // 2. Fetch specific alumnus
  const { data: record, error } = await supabase
    .from('alumni_records')
    .select(`
      id, full_name, branch, batch_year, city, first_company_id, first_role, first_ctc_lpa, claim_status,
      alumni_profiles (
        user_id, current_company_id, designation, industry, location, experience_years,
        skills, linkedin_url, bio, mentorship_available, mock_interview_available, referral_available, internship_available,
        current_company:companies(id, name, name_canonical)
      )
    `)
    .eq('id', recordId)
    .single();

  if (error || !record) {
    return NextResponse.json({ error: 'Alumnus not found' }, { status: 404 });
  }

  // 3. Process matching
  const matchRes = student 
    ? scoreMatch(student, { ...record }, 'mentorship')
    : { score: 0, signals: [], matchable: record.claim_status === 'claimed', fallbackReason: 'No student profile.' };

  return NextResponse.json({
    record,
    match: matchRes
  });
}
