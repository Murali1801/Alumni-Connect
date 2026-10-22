import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAlumniProfile, getAlumniRecordForUser } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { AlumniProfileForm } from '@/components/profile/alumni-profile-form';
import { InstitutionalRecordCard } from '@/components/profile/institutional-record-card';

export const metadata = { title: 'My profile' };
export const dynamic = 'force-dynamic';

export default async function AlumniProfilePage() {
  const user = await requireUser(['alumni']);
  const [badges, profile, record] = await Promise.all([
    getNavBadges(user),
    getAlumniProfile(user.id),
    getAlumniRecordForUser(user.id),
  ]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="My profile"
      description="What students see when they find you in the directory."
    >
      <InstitutionalRecordCard record={record} />
      <AlumniProfileForm
        initial={{
          current_company: profile?.current_company ?? null,
          designation: profile?.designation ?? '',
          industry: profile?.industry ?? '',
          location: profile?.location ?? '',
          experience_years: profile?.experience_years ?? null,
          skills: profile?.skills ?? [],
          linkedin_url: profile?.linkedin_url ?? '',
          bio: profile?.bio ?? '',
          mentorship_available: profile?.mentorship_available ?? false,
          mock_interview_available: profile?.mock_interview_available ?? false,
          referral_available: profile?.referral_available ?? false,
          internship_available: profile?.internship_available ?? false,
        }}
      />
    </DashboardShell>
  );
}
