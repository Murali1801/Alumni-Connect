import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';
import ClaimClient from './ClaimClient';

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const supabase = await createClient();

  const { data: record, error } = await supabase
    .from('alumni_records')
    .select('id, full_name, branch, batch_year, claim_status')
    .eq('claim_token', token)
    .single();

  if (error || !record || record.claim_status !== 'unclaimed') {
    return (
      <div className="flex flex-col min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface p-8 rounded-lg shadow-card text-center">
          <h1 className="text-[var(--text-display-m)] font-display text-danger mb-4">Invalid Claim Link</h1>
          <p className="text-[var(--text-body)] text-ink-2">
            This claim link is invalid, expired, or the profile has already been claimed.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center p-4 bg-paper">
      <div className="w-full max-w-md bg-surface p-8 rounded-lg border border-line shadow-card">
        <div className="mb-6 text-center">
          <h1 className="text-[var(--text-display-m)] font-display text-ink mb-2">Claim Your Profile</h1>
          <p className="text-[var(--text-body-s)] text-ink-2">
            Please confirm your identity to activate your AlumniLink account.
          </p>
        </div>

        <div className="bg-surface-2 p-4 rounded-md mb-8 border border-line-2">
          <p className="text-[var(--text-meta)] text-ink-3 uppercase tracking-wider mb-1">Found Record</p>
          <p className="text-[var(--text-body-l)] font-semibold text-ink">{record.full_name}</p>
          <p className="text-[var(--text-body)] text-ink-2">
            {record.branch} • Class of {record.batch_year}
          </p>
        </div>

        <ClaimClient token={token} />
      </div>
    </div>
  );
}
