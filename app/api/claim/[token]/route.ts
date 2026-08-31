import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('alumni_records')
    .select('id, full_name, branch, batch_year, claim_status')
    .eq('claim_token', token)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'Claim token not found or invalid' }, { status: 404 });
  }

  return NextResponse.json(data);
}
