import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { scoreMatch } from '../lib/matching';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  const { data: student } = await supabaseAdmin.from('student_profiles').select('*').limit(1).single();

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
    .limit(10); // Pagination in real world

  const { data: rawAlumni, error } = await query;
  if (error) {
    console.log('Error fetching rawAlumni:', error);
    return;
  }

  try {
    let results = (rawAlumni || []).map((record) => {
      const matchRes = student 
        ? scoreMatch(student, { ...record }, 'mentorship') 
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

    console.log('Success! Sorted ' + results.length + ' results.');
  } catch (err) {
    console.log('Error in mapping/sorting:', err);
  }
}
run();
