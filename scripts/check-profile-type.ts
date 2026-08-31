import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function run() {
  let query = supabaseAdmin
    .from('alumni_records')
    .select('id, alumni_profiles(designation)')
    .eq('claim_status', 'claimed')
    .limit(1)
    .single();
    
  const { data } = await query;
  console.log(Array.isArray(data?.alumni_profiles) ? 'array' : typeof data?.alumni_profiles);
}
run();
