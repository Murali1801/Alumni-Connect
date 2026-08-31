import Link from 'next/link';
import { UserCircle } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getRequestsFor } from '@/lib/queries';
import { DashboardShell } from '@/components/dashboard/shell';
import { RequestList, type RequestView } from '@/components/requests/request-list';
import { StatsCards } from '@/components/dashboard/cards';
import { Button } from '@/components/ui/button';

export const metadata = { title: 'Request inbox' };
export const dynamic = 'force-dynamic';

export default async function AlumniRequestsPage() {
  const user = await requireUser(['alumni']);
  const [badges, rows] = await Promise.all([getNavBadges(user), getRequestsFor(user.id, 'alumni')]);

  const requests: RequestView[] = rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    message: r.message,
    match_score: r.match_score,
    response_note: r.response_note,
    created_at: r.created_at,
    responded_at: r.responded_at,
    counterpart: r.student ? { id: r.student.id, name: r.student.full_name } : null,
  }));

  const pending = requests.filter((r) => r.status === 'pending');
  const accepted = requests.filter((r) => r.status === 'accepted');
  const answered = requests.filter((r) => r.responded_at);

  const gaps = answered
    .map((r) => (new Date(r.responded_at!).getTime() - new Date(r.created_at).getTime()) / 3_600_000)
    .sort((a, b) => a - b);
  const median = gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : 0;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Request inbox"
      description="Students asking for your time. Accepting opens the door to scheduling a video session."
      actions={
        <Button variant="outline" className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/profile" />}>
          <UserCircle className="size-4" />
          Change what you are available for
        </Button>
      }
    >
      <StatsCards
        stats={[
          {
            title: 'Waiting on you',
            value: pending.length,
            subtitle: pending.length ? 'Students expecting a reply' : 'Inbox is clear',
          },
          { title: 'Accepted', value: accepted.length, subtitle: 'Students you agreed to help' },
          { title: 'Total received', value: requests.length, subtitle: 'All time' },
          {
            title: 'Median reply time',
            value: median ? `${median}h` : '—',
            subtitle: `${answered.length} of ${requests.length} answered`,
          },
        ]}
      />

      <RequestList
        requests={requests}
        viewerRole="alumni"
        emptyTitle="No requests yet"
        emptyBody="Students find you through the directory. Marking yourself available for mentorship or referrals makes you far easier to reach."
        emptyAction={
          <Button size="sm" render={<Link href="/alumni/profile" />}>
            Set your availability
          </Button>
        }
      />
    </DashboardShell>
  );
}
