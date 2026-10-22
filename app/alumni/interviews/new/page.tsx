import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAlumniProfile } from '@/lib/queries';
import { defaultRoundSlot, eligibleCandidates, panelCandidates } from '@/lib/interviews';
import { createAdminClient } from '@/lib/supabase/admin';
import { DashboardShell } from '@/components/dashboard/shell';
import { InterviewForm } from '@/components/interviews/interview-form';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'New interview' };
export const dynamic = 'force-dynamic';

/** `?candidate=`, `?request=` and `?opportunity=` preselect, e.g. from a request card. */
export default async function NewInterviewPage({
  searchParams,
}: {
  searchParams: Promise<{ candidate?: string; request?: string; opportunity?: string }>;
}) {
  const user = await requireUser(['alumni']);
  const params = await searchParams;
  const db = createAdminClient();
  const [badges, candidates, panel, profile, opps] = await Promise.all([
    getNavBadges(user),
    eligibleCandidates(user.id),
    panelCandidates(user.id),
    getAlumniProfile(user.id),
    db.from('opportunities').select('id, title').eq('posted_by', user.id).eq('is_open', true).order('created_at', { ascending: false }).limit(50),
  ]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="New interview"
      description="Set up the rounds for one candidate. They are notified straight away and can accept each round or ask for another time."
      actions={
        <Button variant="outline" className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/interviews" />}>
          <ArrowLeft className="size-4" />
          All interviews
        </Button>
      }
    >
      <InterviewForm
        self={{ id: user.id, full_name: user.full_name }}
        candidates={candidates.map((c) => ({ id: c.id, full_name: c.full_name, headline: c.headline, requests: c.requests }))}
        panel={panel.map((p) => ({ id: p.id, full_name: p.full_name, headline: p.headline }))}
        opportunities={(opps.data ?? []) as { id: string; title: string }[]}
        defaultSlot={defaultRoundSlot()}
        defaults={{
          candidate_id: params.candidate,
          request_id: params.request,
          opportunity_id: params.opportunity,
          company: (profile?.current_company as { name?: string } | null)?.name ?? undefined,
        }}
      />
    </DashboardShell>
  );
}
