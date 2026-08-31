import { ShieldCheck } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { createAdminClient } from '@/lib/supabase/admin';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { VerificationQueue, type ClaimRow } from '@/components/admin/verification-queue';

export const metadata = { title: 'Verification' };
export const dynamic = 'force-dynamic';

export default async function AdminVerificationPage() {
  const user = await requireUser(['admin']);
  const db = createAdminClient();

  const [badges, queueRes, verifiedCount, rejectedCount] = await Promise.all([
    getNavBadges(user),
    db
      .from('alumni_records')
      .select(
        `id, student_id, full_name, branch, batch_year, city, first_role, first_ctc_lpa, claimed_at,
         first_company:companies!first_company_id ( name ),
         claimant:users!claimed_by ( id, full_name, email ),
         alumni_profiles ( designation, location, linkedin_url, experience_years, skills,
           current_company:companies!current_company_id ( name ) )`
      )
      .eq('claim_status', 'claimed')
      .order('claimed_at', { ascending: true }),
    db.from('alumni_records').select('*', { count: 'exact', head: true }).eq('claim_status', 'verified'),
    db.from('alumni_records').select('*', { count: 'exact', head: true }).eq('claim_status', 'rejected'),
  ]);

  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

  const claims: ClaimRow[] = (queueRes.data ?? []).map((r: any) => {
    const profile = one<any>(r.alumni_profiles);
    return {
      id: r.id,
      student_id: r.student_id,
      full_name: r.full_name,
      branch: r.branch,
      batch_year: r.batch_year,
      city: r.city,
      first_role: r.first_role,
      first_ctc_lpa: r.first_ctc_lpa,
      first_company: one<any>(r.first_company)?.name ?? null,
      claimed_at: r.claimed_at,
      claimant: one<any>(r.claimant),
      profile: profile
        ? {
            designation: profile.designation,
            location: profile.location,
            linkedin_url: profile.linkedin_url,
            experience_years: profile.experience_years,
            skills: profile.skills ?? [],
            company: one<any>(profile.current_company)?.name ?? null,
          }
        : null,
    };
  });

  // Oldest unreviewed claim — the number that matters most for queue health.
  const oldest = claims[0]?.claimed_at
    ? Math.floor((Date.now() - new Date(claims[0].claimed_at).getTime()) / 86_400_000)
    : 0;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Verification queue"
      description="Each claim below links an account to an institutional record. Compare the self-reported details against the college record before deciding. Every decision is written to the audit log."
    >
      <StatsCards
        stats={[
          { title: 'Awaiting review', value: claims.length, subtitle: claims.length ? 'Oldest first' : 'Queue is clear' },
          {
            title: 'Oldest claim',
            value: claims.length ? `${oldest}d` : '—',
            subtitle: 'Time the first claim has waited',
          },
          { title: 'Verified', value: (verifiedCount.count ?? 0).toLocaleString(), subtitle: 'Approved to date' },
          { title: 'Rejected', value: (rejectedCount.count ?? 0).toLocaleString(), subtitle: 'Turned down to date' },
        ]}
      />

      <VerificationQueue claims={claims} />

      <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        Verifying does not change what the alumnus wrote about themselves — it records that you
        checked the claim is genuine. Rejecting removes the record from the claimed set and frees it to
        be claimed again.
      </p>
    </DashboardShell>
  );
}
