import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function postTestOpportunity() {
  // Get an alumni and a company
  const { data: alumni } = await supabase.from('users').select('id').eq('role', 'alumni').limit(1).single();
  const { data: company } = await supabase.from('companies').select('id').limit(1).single();

  if (!alumni || !company) return console.error('Missing data for test opportunity');

  const { error } = await supabase.from('opportunities').insert({
    posted_by: alumni.id,
    type: 'job',
    title: 'Frontend Engineer (React)',
    description: 'We are looking for a passionate Frontend Engineer to join our core team. You will be building scalable user interfaces using React and Next.js.',
    company_id: company.id,
    location: 'Bangalore, India (Hybrid)',
    target_skills: ['React', 'TypeScript', 'Next.js'],
    application_link: 'https://example.com/apply',
    is_open: true
  });

  if (error) {
    console.error('Failed to insert test opportunity', error);
  } else {
    console.log('Test opportunity inserted successfully');
  }
}

postTestOpportunity();
