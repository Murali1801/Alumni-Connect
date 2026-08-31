import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function createView() {
  const { error } = await supabase.rpc('execute_sql', {
    sql_string: `
      create or replace view alumni_directory as
      select 
        r.id as record_id,
        r.student_id,
        r.full_name,
        r.branch,
        r.batch_year,
        r.city,
        r.first_company_id,
        r.first_role,
        r.first_ctc_lpa,
        r.higher_ed_raw,
        r.claim_status,
        p.user_id,
        p.current_company_id,
        p.designation,
        p.industry,
        p.location,
        p.experience_years,
        p.skills,
        p.linkedin_url,
        p.bio,
        p.mentorship_available,
        p.mock_interview_available,
        p.referral_available,
        p.internship_available
      from alumni_records r
      left join alumni_profiles p on r.id = p.record_id;
    `
  });

  if (error) {
    // If execute_sql RPC doesn't exist, we might have to use raw psql or query. 
    // Wait, Supabase client doesn't support raw SQL without RPC.
    console.error('Error (might need RPC or raw psql):', error);
  } else {
    console.log('View created successfully via RPC');
  }
}

createView();
