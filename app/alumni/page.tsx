import Link from 'next/link';
import { Inbox, Plus, HeartHandshake } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAlumniDashboard } from '@/lib/dashboard';
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
import { formatDayMonth } from '@/lib/format';

export const metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

export default async function AlumniDashboardPage() {
  const user = await requireUser(['alumni']);
  const [badges, data] = await Promise.all([getNavBadges(user), getAlumniDashboard(user)]);

  const inbox: PersonRow[] = data.requests.slice(0, 5).map((r: any) => ({
    id: r.id,
    name: r.student?.full_name ?? 'Student',
    detail: `${r.type.replace('_', ' ')} · ${formatDayMonth(r.created_at)}`,
    status: r.status,
    tone:
      r.status === 'pending'
        ? 'warning'
        : r.status === 'accepted'
          ? 'success'
          : r.status === 'declined'
            ? 'danger'
            : 'muted',
    href: '/alumni/requests',
  }));

  const nextSession = data.upcoming[0] ?? null;

  const availability = [
    { key: 'mentorship_available', label: 'Mentorship' },
    { key: 'mock_interview_available', label: 'Mock interviews' },
    { key: 'referral_available', label: 'Referrals' },
    { key: 'internship_available', label: 'Internships' },
  ].filter((a) => (data.profile as any)?.[a.key]);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title={`Welcome back, ${user.full_name.split(' ')[0]}`}
      description="Students are asking for your time. Here is what is waiting, and the impact you have had so far."
      actions={
        <>
          <Button className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/requests" />}>
            <Inbox className="size-4" />
            Open request inbox
            {data.stats.pending > 0 ? (
              <span className="tnum ml-1 rounded bg-primary-foreground/20 px-1.5 text-[11px]">
                {data.stats.pending}
              </span>
            ) : null}
          </Button>
          <Button
            variant="outline"
            className="h-9 w-full px-4 sm:w-auto"
            render={<Link href="/alumni/opportunities/new" />}
          >
            <Plus className="size-4" />
            Post an opportunity
          </Button>
        </>
      }
    >
      <StatsCards
        stats={[
          {
            title: 'Waiting on you',
            value: data.stats.pending,
            subtitle: data.stats.pending ? 'Students expecting a reply' : 'Inbox is clear',
            href: '/alumni/requests',
          },
          {
            title: 'Students helped',
            value: data.stats.accepted,
            subtitle: `${data.stats.total} requests received all-time`,
            href: '/alumni/mentees',
          },
          {
            title: 'Live postings',
            value: data.stats.openPostings,
            subtitle: `${data.postings.length} posted in total`,
            href: '/alumni/opportunities',
          },
          {
            title: 'Median reply time',
            value: data.stats.medianHours ? `${data.stats.medianHours}h` : '—',
            subtitle: `${data.stats.responseRate}% of requests answered`,
            href: '/alumni/analytics',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ActivityChart
            title="Requests received"
            legend="Per week"
            data={data.activity}
            emptyText="No requests have reached you yet. Turning on availability makes you far easier to find."
          />
          <PeopleCard
            title="Request inbox"
            people={inbox}
            action={{ label: 'View all', href: '/alumni/requests' }}
            emptyText="Nothing here yet. Students see you once your profile lists what you are available for."
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
            scheduleHref="/alumni/calendar"
          />
          <ProgressRing
            title="Profile completeness"
            value={data.strength}
            caption="Complete"
            legend={[
              { label: 'Filled in', className: 'bg-primary' },
              { label: 'Missing', className: 'bg-muted' },
            ]}
            footer={
              data.strength < 100 ? (
                <Button size="sm" variant="outline" className="mt-4" render={<Link href="/alumni/profile" />}>
                  Complete your profile
                </Button>
              ) : null
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ItemListCard
          title="Your postings"
          items={data.postings.slice(0, 5).map((o: any) => ({
            id: o.id,
            title: o.title,
            subtitle: `${o.company?.name ?? 'Unknown company'} · ${o.is_open ? 'Open' : 'Closed'}`,
            emoji: o.type === 'internship' ? '🎓' : '💼',
            tone: o.is_open ? 'bg-primary/10' : 'bg-muted',
            href: '/alumni/opportunities',
          }))}
          action={{ label: 'New', href: '/alumni/opportunities/new' }}
          emptyText="You have not posted a role yet. Even one referral-backed opening goes a long way."
        />

        <HighlightCard
          icon={<HeartHandshake />}
          title="What you are open to"
          subtitle="Shown on your directory card and used for matching"
        >
          {availability.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm opacity-80">
                You have not marked yourself available for anything, so students cannot match with you.
              </p>
              <Button size="sm" variant="secondary" render={<Link href="/alumni/profile" />}>
                Set availability
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {availability.map((a) => (
                <Badge key={a.key} variant="secondary" className="font-normal">
                  {a.label}
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
                No sessions booked. Accept a request and you can put a video room straight on the
                calendar.
              </p>
              <Button size="sm" variant="secondary" render={<Link href="/alumni/requests" />}>
                Review requests
              </Button>
            </div>
          }
        />
      </div>
    </DashboardShell>
  );
}
