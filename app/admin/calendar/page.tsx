import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { listAllCalls } from '@/lib/calls';
import { toSessionViews } from '@/lib/session-views';
import { DashboardShell } from '@/components/dashboard/shell';
import { CalendarView } from '@/components/calendar/calendar-view';
import { StatsCards } from '@/components/dashboard/cards';

export const metadata = { title: 'Sessions' };
export const dynamic = 'force-dynamic';

export default async function AdminCalendarPage() {
  const user = await requireUser(['admin']);
  const [badges, calls] = await Promise.all([getNavBadges(user), listAllCalls(400)]);

  const now = Date.now();
  const scheduled = calls.filter((c) => c.status === 'scheduled');
  const upcoming = scheduled.filter((c) => new Date(c.scheduled_at).getTime() > now);
  const cancelled = calls.filter((c) => c.status === 'cancelled');

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Sessions"
      description="Every mentorship session booked across the network. You can observe the schedule but you are not a participant, so rooms are not joinable from here."
    >
      <StatsCards
        stats={[
          { title: 'Sessions booked', value: calls.length, subtitle: 'All time' },
          { title: 'Upcoming', value: upcoming.length, subtitle: 'Still to happen' },
          { title: 'Completed or past', value: calls.length - upcoming.length - cancelled.length, subtitle: 'Already run' },
          { title: 'Cancelled', value: cancelled.length, subtitle: 'Called off after booking' },
        ]}
      />
      <CalendarView sessions={toSessionViews(calls, user.id, true)} />
    </DashboardShell>
  );
}
