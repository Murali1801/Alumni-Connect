import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { listAllCalls } from '@/lib/calls';
import { toSessionViews } from '@/lib/session-views';
import { DashboardShell } from '@/components/dashboard/shell';
import { RoomsView } from '@/components/calendar/rooms-view';

export const metadata = { title: 'Video rooms' };
export const dynamic = 'force-dynamic';

export default async function AdminCallsPage() {
  const user = await requireUser(['admin']);
  const [badges, calls] = await Promise.all([getNavBadges(user), listAllCalls(400)]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Video rooms"
      description="Every room open across the network. Rooms are private to their two participants, so this is a monitoring view only."
    >
      <RoomsView
        sessions={toSessionViews(calls, user.id, true)}
        observerNote="Private to the two participants — administrators cannot join."
      />
    </DashboardShell>
  );
}
