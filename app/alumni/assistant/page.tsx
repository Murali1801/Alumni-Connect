import Link from 'next/link';
import { ClipboardCheck, Clock, AlertTriangle, Check, Info, Inbox } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAlumniDashboard } from '@/lib/dashboard';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InitialsAvatar, MatchScore, EmptyState } from '@/components/patterns';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Inbox triage' };
export const dynamic = 'force-dynamic';

const HOUR = 3_600_000;

export default async function AlumniAssistantPage() {
  const user = await requireUser(['alumni']);
  const [badges, data] = await Promise.all([getNavBadges(user), getAlumniDashboard(user)]);

  const now = Date.now();

  /**
   * Order the pending queue by how long someone has been waiting, weighted by
   * how well they match you — the aim is to surface the person most likely to
   * benefit who has waited longest, not simply the newest message.
   */
  const queue = data.pending
    .map((r: any) => {
      const waitedHours = (now - new Date(r.created_at).getTime()) / HOUR;
      const waitedDays = Math.floor(waitedHours / 24);
      const urgency = waitedHours >= 168 ? 'overdue' : waitedHours >= 72 ? 'ageing' : 'fresh';
      // Waiting time dominates; match score breaks ties.
      const priority = waitedHours * 2 + (r.match_score ?? 0);
      return { ...r, waitedDays, waitedHours, urgency, priority };
    })
    .sort((a: any, b: any) => b.priority - a.priority);

  const overdue = queue.filter((r: any) => r.urgency === 'overdue');
  const ageing = queue.filter((r: any) => r.urgency === 'ageing');

  const availability = [
    { key: 'mentorship_available', label: 'Mentorship' },
    { key: 'mock_interview_available', label: 'Mock interviews' },
    { key: 'referral_available', label: 'Referrals' },
    { key: 'internship_available', label: 'Internships' },
  ];
  const off = availability.filter((a) => !(data.profile as any)?.[a.key]);

  const acceptedNoSession =
    data.accepted.length -
    new Set(
      data.calls
        .filter((c) => c.status !== 'cancelled')
        .map((c) => (c.host_id === user.id ? c.guest_id : c.host_id))
    ).size;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Inbox triage"
      description="Your pending requests ordered by how long each student has waited, weighted by how well they match you. Rules applied to your own data — nothing here is generated."
      actions={
        <Button className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/requests" />}>
          <Inbox className="size-4" />
          Open the inbox
        </Button>
      }
    >
      <StatsCards
        stats={[
          { title: 'Waiting on you', value: queue.length, subtitle: queue.length ? 'Pending requests' : 'Inbox is clear' },
          {
            title: 'Over a week old',
            value: overdue.length,
            subtitle: overdue.length ? 'Answer these first' : 'Nothing overdue',
          },
          {
            title: 'Median reply time',
            value: data.stats.medianHours ? `${data.stats.medianHours}h` : '—',
            subtitle: `${data.stats.responseRate}% answered overall`,
          },
          {
            title: 'Accepted, no session',
            value: Math.max(0, acceptedNoSession),
            subtitle: acceptedNoSession > 0 ? 'Yes given but never booked' : 'All followed through',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <h2 className="text-sm font-semibold text-foreground">Suggested order</h2>

          {queue.length === 0 ? (
            <EmptyState
              icon={Check}
              title="Nothing pending"
              description="Your inbox is clear. Students can reach you whenever your availability types are switched on."
            />
          ) : (
            queue.map((r: any) => (
              <Card key={r.id} className="gap-0 p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <InitialsAvatar name={r.student?.full_name ?? '?'} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold text-foreground">
                        {r.student?.full_name ?? 'Student'}
                      </h3>
                      <Badge variant="secondary" className="font-normal capitalize">
                        {r.type.replace('_', ' ')}
                      </Badge>
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[11px] font-medium',
                          r.urgency === 'overdue'
                            ? 'bg-destructive/10 text-destructive'
                            : r.urgency === 'ageing'
                              ? 'bg-[color-mix(in_oklch,var(--warning),transparent_88%)] text-[var(--warning)]'
                              : 'bg-muted text-muted-foreground'
                        )}
                      >
                        <Clock className="mr-1 inline size-3" />
                        waiting {r.waitedDays === 0 ? 'today' : `${r.waitedDays}d`}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                      {r.message}
                    </p>
                  </div>
                  {r.match_score !== null && <MatchScore score={r.match_score} size={40} />}
                </div>
                <Button size="xs" variant="outline" className="mt-3" render={<Link href="/alumni/requests" />}>
                  Answer this
                </Button>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-4">
          <Card className="gap-0 p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">Worth acting on</h2>
            </div>
            <ul className="space-y-3 text-sm">
              {overdue.length > 0 && (
                <li className="leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {overdue.length} request{overdue.length === 1 ? '' : 's'} over a week old.
                  </span>{' '}
                  A late decline still beats silence — students plan around your answer.
                </li>
              )}
              {ageing.length > 0 && (
                <li className="leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">{ageing.length} ageing past three days.</span>{' '}
                  These are the ones that quietly become overdue.
                </li>
              )}
              {off.length > 0 && (
                <li className="leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {off.length} availability type{off.length === 1 ? '' : 's'} switched off
                  </span>{' '}
                  ({off.map((o) => o.label).join(', ')}). Students cannot ask for those at all — which
                  is fine if it is deliberate.
                </li>
              )}
              {acceptedNoSession > 0 && (
                <li className="leading-relaxed text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {acceptedNoSession} student{acceptedNoSession === 1 ? '' : 's'} you accepted have no
                    session booked.
                  </span>{' '}
                  Sending a slot yourself is usually what unsticks it.
                </li>
              )}
              {overdue.length === 0 && ageing.length === 0 && acceptedNoSession <= 0 && off.length === 0 && (
                <li className="leading-relaxed text-muted-foreground">
                  Nothing needs attention. Your inbox is current and your availability is fully open.
                </li>
              )}
            </ul>
            <Button size="sm" variant="outline" className="mt-4 w-full" render={<Link href="/alumni/profile" />}>
              Adjust my availability
            </Button>
          </Card>

          <Card className="gap-0 p-5">
            <div className="mb-2 flex items-center gap-2">
              <ClipboardCheck className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">How the order is chosen</h2>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Priority is hours waited, doubled, plus the match score frozen on the request. Waiting
              time dominates deliberately — a strong match who is ignored for two weeks is a worse
              outcome than a weak match answered late.
            </p>
          </Card>
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        This page never answers anything for you. Accepting and declining stays a decision you make in
        the inbox, with the student’s own words in front of you.
      </p>
    </DashboardShell>
  );
}
