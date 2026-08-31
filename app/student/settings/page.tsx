import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getStudentProfile } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { StudentProfileForm } from '@/components/profile/student-profile-form';
import { AccountCard } from '@/components/profile/account-card';

export const metadata = { title: 'Settings' };
export const dynamic = 'force-dynamic';

export default async function StudentSettingsPage() {
  const user = await requireUser(['student']);
  const [badges, profile] = await Promise.all([getNavBadges(user), getStudentProfile(user.id)]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Settings"
      description="Your profile drives every match score you see. Keep it current and the directory gets sharper."
    >
      <AccountCard user={user} />
      <StudentProfileForm profile={profile} />
    </DashboardShell>
  );
}
