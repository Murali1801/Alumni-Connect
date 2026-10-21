import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAlumniProfile, getCareerHistory } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { Button } from '@/components/ui/button';
import { LinkedInImportFlow } from '@/components/profile/linkedin-import';

export const metadata = { title: 'Import from LinkedIn' };
export const dynamic = 'force-dynamic';

export default async function LinkedInImportPage() {
  const user = await requireUser(['alumni']);
  const [badges, profile, history] = await Promise.all([
    getNavBadges(user),
    getAlumniProfile(user.id),
    getCareerHistory(user.id),
  ]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Import from LinkedIn"
      description="Bring your experience, skills and links over from LinkedIn, then choose what students see."
      actions={
        <Button variant="outline" className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/profile" />}>
          <ArrowLeft className="size-4" />
          Back to profile
        </Button>
      }
    >
      <LinkedInImportFlow
        existing={{
          headline: history?.headline ?? null,
          bio: profile?.bio ?? null,
          designation: profile?.designation ?? null,
          company: profile?.current_company?.name ?? null,
          location: profile?.location ?? null,
          experience_years: profile?.experience_years ?? null,
          skills: profile?.skills ?? [],
        }}
      />
    </DashboardShell>
  );
}
