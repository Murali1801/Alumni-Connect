import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function ConfirmClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/claim/${token}`);
  }

  // 1. Get the record
  const { data: record, error: recordError } = await supabase
    .from('alumni_records')
    .select('*')
    .eq('claim_token', token)
    .single();

  if (recordError || !record || record.claim_status !== 'unclaimed') {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface p-8 rounded-lg shadow-card text-center text-danger">
          Invalid or expired claim token, or already claimed.
        </div>
      </div>
    );
  }

  // 2. Set user role to alumni
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
    return <div>Error updating user role.</div>;
  }

  // 3. Mark record as claimed
  await supabase
    .from('alumni_records')
    .update({
      claim_status: 'claimed',
      claimed_by: user.id,
      claimed_at: new Date().toISOString(),
    })
    .eq('id', record.id);

  // 4. Create empty profile
  await supabase
    .from('alumni_profiles')
    .insert({
      user_id: user.id,
      record_id: record.id,
      skills: [],
    });

  // 5. Log engagement event
  await supabase.from('engagement_events').insert({
    user_id: user.id,
    event_type: 'claim_completed',
    metadata: { record_id: record.id }
  });

  // 6. Redirect to alumni profile onboarding
  redirect('/alumni/profile');
}
