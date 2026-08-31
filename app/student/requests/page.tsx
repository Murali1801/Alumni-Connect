import Link from 'next/link';
import { Compass } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getRequestsFor } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { RequestList, type RequestView } from '@/components/requests/request-list';
import { StatsCards } from '@/components/dashboard/cards';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'My requests' };
export const dynamic = 'force-dynamic';

export default async function StudentRequestsPage() {
  const user = await requireUser(['student']);
  const [badges, rows] = await Promise.all([getNavBadges(user), getRequestsFor(user.id, 'student')]);

  const requests: RequestView[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    message: r.message,
    match_score: r.match_score,
    response_note: r.response_note,
    created_at: r.created_at,
    responded_at: r.responded_at,
    counterpart: r.alumni ? { id: r.alumni.id, name: r.alumni.full_name } : null,
  }));

  const accepted = requests.filter((r) => r.status === 'accepted').length;
  const pending = requests.filter((r) => r.status === 'pending').length;
  const answered = requests.filter((r) => r.responded_at).length;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="My requests"
      description="Everything you have asked for, and where each one stands."
      actions={
        <Button className="h-9 w-full px-4 sm:w-auto" render={<Link href="/student/directory" />}>
          <Compass className="size-4" />
          Find another alumnus
        </Button>
      }
    >
      <StatsCards
        stats={[
          { title: 'Total sent', value: requests.length, subtitle: 'All time' },
          { title: 'Awaiting a reply', value: pending, subtitle: pending ? 'Give it a few days' : 'Nothing outstanding' },
          { title: 'Accepted', value: accepted, subtitle: 'Ready to schedule a session' },
          {
            title: 'Answered',
            value: requests.length ? `${Math.round((answered / requests.length) * 100)}%` : '—',
            subtitle: `${answered} of ${requests.length} got a response`,
          },
        ]}
      />

      <RequestList
        requests={requests}
        viewerRole="student"
        emptyTitle="You have not sent any requests"
        emptyBody="Find an alumnus whose path matches where you want to go, and tell them what you need."
        emptyAction={
          <Button size="sm" render={<Link href="/student/directory" />}>
            Open the directory
          </Button>
        }
      />
    </DashboardShell>
  );
}
