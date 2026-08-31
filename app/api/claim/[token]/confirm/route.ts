import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized. Please sign in to confirm claim.' }, { status: 401 });
  }

  // 1. Get the record for this token
  const { data: record, error: recordError } = await supabase
    .from('alumni_records')
    .select('*')
    .eq('claim_token', token)
    .single();

  if (recordError || !record) {
    return NextResponse.json({ error: 'Invalid or expired claim token' }, { status: 400 });
  }

  if (record.claim_status !== 'unclaimed') {
    return NextResponse.json({ error: 'This record has already been claimed' }, { status: 400 });
  }

  // 2. Set user role to alumni in `users` table
  const { error: userUpdateError } = await supabase
    .from('users')
    .upsert({
      id: user.id,
      role: 'alumni',
      full_name: record.full_name,
      email: user.email,
    });

  if (userUpdateError) {
    console.error(userUpdateError);
    return NextResponse.json({ error: 'Failed to create user role' }, { status: 500 });
  }

  // 3. Mark record as claimed
  const { error: claimError } = await supabase
    .from('alumni_records')
    .update({
      claim_status: 'claimed',
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', record.id);

  if (claimError) {
    console.error(claimError);
    return NextResponse.json({ error: 'Failed to update record claim status' }, { status: 500 });
  }

  // 4. Create an empty alumni_profile linked to this record and user
  const { error: profileError } = await supabase
    .from('alumni_profiles')
    .insert({
      user_id: user.id,
      record_id: record.id,
      skills: [],
    });

  if (profileError) {
    console.error(profileError);
    return NextResponse.json({ error: 'Failed to create profile' }, { status: 500 });
  }

  // 5. Log engagement event
  await supabase.from('engagement_events').insert({
    user_id: user.id,
    event_type: 'claim_completed',
    metadata: { record_id: record.id }
  });

  return NextResponse.json({ success: true });
}
