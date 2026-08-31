import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAlumniProfile } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { OpportunityForm } from '@/components/opportunities/opportunity-form';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Post an opportunity' };
export const dynamic = 'force-dynamic';

export default async function NewOpportunityPage() {
  const user = await requireUser(['alumni']);
  const [badges, profile] = await Promise.all([getNavBadges(user), getAlumniProfile(user.id)]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Post an opportunity"
      description="Share a role you can actually speak for. Students see it ranked against their own skills."
      actions={
        <Button variant="outline" className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/opportunities" />}>
          <ArrowLeft className="size-4" />
          Back to my postings
        </Button>
      }
    >
      <OpportunityForm
        defaultCompany={
          profile?.current_company ? { id: profile.current_company.id, name: profile.current_company.name } : null
        }
        defaultLocation={profile?.location ?? ''}
      />
    </DashboardShell>
  );
}
