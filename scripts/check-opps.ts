import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function check() {
  console.log('Querying opportunities...');
  const { data, error } = await supabase.from('opportunities').select('id, type, title, companies(name), users!posted_by(full_name)');
  console.log('Data:', data);
  console.log('Error:', error);
}
check();
