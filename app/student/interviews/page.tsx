import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { listInterviewsForUser } from '@/lib/interviews';
import { DashboardShell } from '@/components/dashboard/shell';
import { InterviewList } from '@/components/interviews/interview-list';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Interviews' };
export const dynamic = 'force-dynamic';

export default async function StudentInterviewsPage() {
  const user = await requireUser(['student']);
  const [badges, items] = await Promise.all([getNavBadges(user), listInterviewsForUser(user)]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Interviews"
      description="Interview rounds alumni have scheduled with you. Accept each round or ask for another time, and join from here when it opens."
    >
      <InterviewList
        items={items}
        side="interviewer"
        hrefFor={(id) => `/student/interviews/${id}`}
        emptyAction={
          <Button size="sm" variant="outline" render={<Link href="/student/opportunities" />}>
            Browse opportunities
          </Button>
        }
      />
    </DashboardShell>
  );
}
