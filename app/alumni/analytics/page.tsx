import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAlumniDashboard } from '@/lib/dashboard';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { TrendChart, MixChart, FunnelCard, RankingChart } from '@/components/analytics/charts';
import { Card } from '@/components/ui/card';

export const metadata = { title: 'My impact' };
export const dynamic = 'force-dynamic';

export default async function AlumniAnalyticsPage() {
  const user = await requireUser(['alumni']);
  const [badges, data] = await Promise.all([getNavBadges(user), getAlumniDashboard(user)]);

  const answered = data.requests.filter((r: any) => r.responded_at);
  const declined = data.requests.filter((r: any) => r.status === 'declined');
  const sessionsRun = data.calls.filter(
    (c) => c.status !== 'cancelled' && new Date(c.scheduled_at).getTime() < Date.now()
  ).length;

  // Distinct students reached, not request count — one student sending three
  // requests is still one student helped.
  const uniqueStudents = new Set(
    data.requests.filter((r: any) => r.status === 'accepted').map((r: any) => r.student?.id)
  ).size;

  const responseSpeed = [
    { label: 'Within a day', value: 0 },
    { label: '1–3 days', value: 0 },
    { label: '4–7 days', value: 0 },
    { label: 'Over a week', value: 0 },
  ];
  for (const r of answered) {
    const hours = (new Date(r.responded_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000;
    const idx = hours <= 24 ? 0 : hours <= 72 ? 1 : hours <= 168 ? 2 : 3;
    responseSpeed[idx].value++;
  }

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="My impact"
      description="What your time on the network has added up to — who asked, what you said yes to, and how fast you answered."
    >
      <StatsCards
        stats={[
          { title: 'Students helped', value: uniqueStudents, subtitle: 'Distinct people, not requests' },
          { title: 'Sessions held', value: sessionsRun, subtitle: 'Video calls that have happened' },
          {
            title: 'Response rate',
            value: data.stats.total ? `${data.stats.responseRate}%` : '—',
            subtitle: `${answered.length} of ${data.stats.total} answered`,
          },
          {
            title: 'Median reply time',
            value: data.stats.medianHours ? `${data.stats.medianHours}h` : '—',
            subtitle: data.stats.pending ? `${data.stats.pending} still waiting` : 'Inbox clear',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <TrendChart
            title="Requests reaching you"
            description="By week — a rising line usually follows a profile update"
            data={data.activity}
            seriesLabel="Requests"
            emptyText="No requests have reached you yet."
          />
        </div>
        <FunnelCard
          title="From request to session"
          description="Where the students who contact you end up"
          stages={[
            { label: 'Received', value: data.stats.total },
            { label: 'Answered', value: answered.length, hint: 'You replied either way' },
            { label: 'Accepted', value: data.stats.accepted, hint: 'You agreed to help' },
            { label: 'Sessions held', value: sessionsRun, hint: 'It became a real conversation' },
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <MixChart
          title="What students ask you for"
          description="Split by request type"
          data={data.byType.filter((t) => t.value > 0)}
          emptyText="No requests to break down yet."
        />
        <RankingChart
          title="How fast you answer"
          description="Time from a student sending to your reply"
          data={responseSpeed.filter((r) => r.value > 0)}
          emptyText="Answer a request to see this."
        />
        <Card className="gap-0 p-5">
          <h2 className="mb-1 text-base font-semibold text-foreground">Your postings</h2>
          <p className="mb-4 text-xs text-muted-foreground">Roles you have opened to the network.</p>
          <dl className="space-y-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Live now</dt>
              <dd className="tnum font-semibold text-foreground">{data.stats.openPostings}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Posted all-time</dt>
              <dd className="tnum font-semibold text-foreground">{data.postings.length}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-muted-foreground">Requests declined</dt>
              <dd className="tnum font-semibold text-foreground">{declined.length}</dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
            Declining with a reason is not a failure — it is far more useful to a student than silence,
            and it keeps your median reply time honest.
          </p>
        </Card>
      </div>
    </DashboardShell>
  );
}
