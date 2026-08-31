import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { listCallsForUser } from '@/lib/calls';
import { toSessionViews } from '@/lib/session-views';
import { DashboardShell } from '@/components/dashboard/shell';
import { CalendarView } from '@/components/calendar/calendar-view';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Schedule' };
export const dynamic = 'force-dynamic';

export default async function AlumniCalendarPage() {
  const user = await requireUser(['alumni']);
  const [badges, calls] = await Promise.all([getNavBadges(user), listCallsForUser(user.id)]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Schedule"
      description="Every video session you have booked. Sessions can only be created against an accepted request."
      actions={
        <Button className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/requests" />}>
          Schedule from an accepted request
        </Button>
      }
    >
      <CalendarView
        sessions={toSessionViews(calls, user.id)}
        emptyAction={
          <Button size="sm" render={<Link href="/alumni/requests" />}>
            Go to requests
          </Button>
        }
      />
    </DashboardShell>
  );
}
