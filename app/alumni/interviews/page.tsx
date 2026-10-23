import Link from 'next/link';
import { CalendarClock, ClipboardList, Plus, Trophy } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { listInterviewsForUser, upcomingWithin } from '@/lib/interviews';
import { DashboardShell } from '@/components/dashboard/shell';
import { InterviewList } from '@/components/interviews/interview-list';
import { StatCard } from '@/components/patterns';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Interviews' };
export const dynamic = 'force-dynamic';

export default async function AlumniInterviewsPage() {
  const user = await requireUser(['alumni']);
  const [badges, items] = await Promise.all([getNavBadges(user), listInterviewsForUser(user)]);

  const upcoming = upcomingWithin(items.flatMap((i) => i.interview.rounds), 7);
  const active = items.filter((i) => i.interview.status === 'active').length;
  const selected = items.filter((i) => i.interview.decision === 'selected').length;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Interviews"
      description="Run candidates through video, coding and MCQ rounds, score them, and share results when you are ready."
      actions={
        <Button className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/interviews/new" />}>
          <Plus className="size-4" />
          New interview
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Active pipelines" value={active} icon={ClipboardList} />
          <StatCard label="Rounds in the next 7 days" value={upcoming} icon={CalendarClock} />
          <StatCard label="Candidates selected" value={selected} icon={Trophy} />
        </div>
        <InterviewList
          items={items}
          side="candidate"
          hrefFor={(id) => `/alumni/interviews/${id}`}
          emptyAction={
            <Button size="sm" render={<Link href="/alumni/interviews/new" />}>
              <Plus className="size-3.5" />
              New interview
            </Button>
          }
        />
      </div>
    </DashboardShell>
  );
}
