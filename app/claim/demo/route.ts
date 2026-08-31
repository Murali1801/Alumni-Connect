import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const supabase = await createClient();
  
  // Fetch an unclaimed record
  const { data, error } = await supabase
    .from('alumni_records')
    .select('claim_token')
    .eq('claim_status', 'unclaimed')
    .limit(1)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'No unclaimed records found to demo' }, { status: 404 });
  }

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(`${origin}/claim/${data.claim_token}`);
}
