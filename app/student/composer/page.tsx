import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getDirectory, getStudentProfile } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { OutreachComposer } from '@/components/composer/outreach-composer';
import { EmptyState } from '@/components/patterns';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Outreach composer' };
export const dynamic = 'force-dynamic';

export default async function StudentComposerPage() {
  const user = await requireUser(['student']);
  const [badges, profile] = await Promise.all([getNavBadges(user), getStudentProfile(user.id)]);

  if (!profile) {
    return (
      <DashboardShell
        user={user}
        badges={badges}
        title="Outreach composer"
        description="Assemble a request message from your own profile."
      >
        <EmptyState
          icon={Sparkles}
          title="Add your profile first"
          description="The composer fills in your branch, year, target role and skills. Without a profile there is nothing to assemble."
          action={
            <Button size="sm" render={<Link href="/student/settings" />}>
              Set up my profile
            </Button>
          }
        />
      </DashboardShell>
    );
  }

  // A short list of strong matches to address the draft to.
  const { items } = await getDirectory(
    { status: 'claimed', sort: 'match', page: 1, pageSize: 24 },
    profile
  );

  const targets = items
    .filter((i) => i.match.matchable && i.record.alumni_profiles)
    .slice(0, 12)
    .map((i) => ({
      recordId: i.record.id,
      userId: i.record.alumni_profiles!.user_id,
      name: i.record.full_name,
      designation: i.record.alumni_profiles!.designation,
      company: i.record.alumni_profiles!.current_company?.name ?? null,
      batch: i.record.batch_year,
      branch: i.record.branch,
      score: i.match.score,
      offers: {
        mentorship: i.record.alumni_profiles!.mentorship_available,
        mock_interview: i.record.alumni_profiles!.mock_interview_available,
        referral: i.record.alumni_profiles!.referral_available,
        internship: i.record.alumni_profiles!.internship_available,
      },
    }));

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Outreach composer"
      description="Builds a first-contact message out of your profile and theirs. Edit it before you send — a message that reads as assembled will be treated as one."
    >
      <OutreachComposer
        student={{
          name: user.full_name,
          branch: profile.branch,
          batchYear: profile.batch_year,
          targetRole: profile.target_role,
          targetCompany: profile.target_company,
          targetIndustry: profile.target_industry,
          skills: profile.skills ?? [],
        }}
        targets={targets}
      />
    </DashboardShell>
  );
}
