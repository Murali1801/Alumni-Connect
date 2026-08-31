import Link from 'next/link';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { listCallsForUser } from '@/lib/calls';
import { toSessionViews } from '@/lib/session-views';
import { DashboardShell } from '@/components/dashboard/shell';
import { RoomsView } from '@/components/calendar/rooms-view';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Video rooms' };
export const dynamic = 'force-dynamic';

export default async function AlumniCallsPage() {
  const user = await requireUser(['alumni']);
  const [badges, calls] = await Promise.all([getNavBadges(user), listCallsForUser(user.id)]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Video rooms"
      description="Live and upcoming sessions you can join. Rooms open ten minutes before the scheduled start."
      actions={
        <Button variant="outline" className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/calendar" />}>
          Open the calendar
        </Button>
      }
    >
      <RoomsView
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
