import Link from 'next/link';
import { Compass, Sparkles, Target } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getStudentDashboard } from '@/lib/dashboard';
import { DashboardShell } from '@/components/dashboard/shell';
import {
  StatsCards,
  ActivityChart,
  PeopleCard,
  UpcomingSessionCard,
  ProgressRing,
  ItemListCard,
  HighlightCard,
  CountdownCard,
  type PersonRow,
} from '@/components/dashboard/cards';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDayMonth, formatNumber } from '@/lib/format';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';


export default async function StudentDashboardPage() {
  const user = await requireUser(['student']);
  const [badges, data] = await Promise.all([getNavBadges(user), getStudentDashboard(user)]);

  const people: PersonRow[] = data.requests.slice(0, 5).map((r: any) => ({
    id: r.id,
    name: r.alumni?.full_name ?? 'Alumnus',
    detail: `${r.type.replace('_', ' ')} · sent ${formatDayMonth(r.created_at)}`,
    status: r.status,
    tone:
      r.status === 'accepted'
        ? 'success'
        : r.status === 'pending'
          ? 'warning'
          : r.status === 'declined'
            ? 'danger'
            : 'muted',
    href: '/student/requests',
  }));

  const nextSession = data.upcoming[0] ?? null;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title={`Welcome back, ${user.full_name.split(' ')[0]}`}
      description="Find alumni who can actually help you, track what you have asked for, and meet them on video."
      actions={
        <>
          <Button className="h-9 w-full px-4 sm:w-auto" render={<Link href="/student/directory" />}>
            <Compass className="size-4" />
            Browse the directory
          </Button>
          <Button
            variant="outline"
            className="h-9 w-full px-4 sm:w-auto"
            render={<Link href="/student/suggestions" />}
          >
            <Sparkles className="size-4" />
            Smart matches
          </Button>
        </>
      }
    >
      <StatsCards
        stats={[
          {
            title: 'Alumni you can reach',
            value: formatNumber(data.stats.reachable),
            subtitle: `${data.stats.mentorsAvailable} open to mentoring`,
            href: '/student/directory',
          },
          {
            title: 'Requests sent',
            value: data.stats.sent,
            subtitle: `${data.stats.pending} still awaiting a reply`,
            href: '/student/requests',
          },
          {
            title: 'Accepted',
            value: data.stats.accepted,
            subtitle:
              data.stats.sent > 0 ? `${data.stats.responseRate}% response rate` : 'Send your first request',
            href: '/student/requests',
          },
          {
            title: 'Upcoming sessions',
            value: data.upcoming.length,
            subtitle: nextSession
              ? `Next: ${formatDayMonth(nextSession.scheduled_at)}`
              : 'Nothing scheduled',
            href: '/student/calendar',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ActivityChart
            title="Your outreach"
            legend="Requests sent per week"
            data={data.activity}
            emptyText="You have not sent any requests yet. Start from the directory."
          />
          <PeopleCard
            title="Recent requests"
            people={people}
            action={{ label: 'New', href: '/student/directory' }}
            emptyText="No requests yet. Find an alumnus in the directory and introduce yourself."
          />
        </div>

        <div className="space-y-4">
          <UpcomingSessionCard
            sessions={data.upcoming.map((s) => ({
              room_id: s.room_id,
              title: s.title,
              scheduled_at: s.scheduled_at,
              duration_min: s.duration_min,
              peer_name: s.host_id === user.id ? s.guest_name : s.host_name,
            }))}
            scheduleHref="/student/calendar"
          />
          <ProgressRing
            title="Profile strength"
            value={data.strength}
            caption="Complete"
            legend={[
              { label: 'Filled in', className: 'bg-primary' },
              { label: 'Missing', className: 'bg-muted' },
            ]}
            footer={
              data.strength < 100 ? (
                <Button size="sm" variant="outline" className="mt-4" render={<Link href="/student/settings" />}>
                  Finish your profile
                </Button>
              ) : null
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ItemListCard
          title="Open opportunities"
          items={data.opportunities.slice(0, 5).map((o: any) => ({
            id: o.id,
            title: o.title,
            subtitle: `${o.company?.name ?? 'Unknown company'} · ${o.location ?? 'Location not stated'}`,
            emoji: o.type === 'internship' ? '🎓' : '💼',
            tone: o.type === 'internship' ? 'bg-chart-2/15' : 'bg-primary/10',
            href: '/student/opportunities',
          }))}
          action={{ label: 'All', href: '/student/opportunities' }}
          emptyText="No open roles have been posted yet."
        />

        <HighlightCard
          icon={<Target />}
          title="Skills worth adding"
          subtitle="Asked for by open roles, missing from your profile"
        >
          {data.skillGaps.length === 0 ? (
            <p className="text-sm opacity-80">
              Your listed skills already cover every open posting. Keep the profile current.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.skillGaps.map(([skill, count]) => (
                <Badge key={skill} variant="secondary" className="font-normal">
                  {skill} · {count}
                </Badge>
              ))}
            </div>
          )}
        </HighlightCard>

        <CountdownCard
          title="Next session starts in"
          target={nextSession?.scheduled_at ?? null}
          caption={
            nextSession
              ? `${nextSession.title} with ${nextSession.host_id === user.id ? nextSession.guest_name : nextSession.host_name}`
              : ''
          }
          fallback={
            <div className="space-y-3">
              <p>
                Nothing on the calendar. Once an alumnus accepts a request you can book a video room
                with them.
              </p>
              <Button size="sm" variant="secondary" render={<Link href="/student/requests" />}>
                Review my requests
              </Button>
            </div>
          }
        />
      </div>
    </DashboardShell>
  );
}
