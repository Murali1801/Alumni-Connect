import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { DashboardShell } from '@/components/dashboard/shell';
import { HelpContent } from '@/components/help/help-content';

export const metadata = { title: 'Help' };
export const dynamic = 'force-dynamic';

export default async function StudentHelpPage() {
  const user = await requireUser(['student']);
  const badges = await getNavBadges(user);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Help and support"
      description="How this network works, what the numbers mean, and who to contact when a page cannot fix it."
    >
      <HelpContent role="student" />
    </DashboardShell>
  );
}
