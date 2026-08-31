import Link from 'next/link';
import { Users, MessageSquare, Video, Target, Building2, MapPin } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getRequestsFor } from '@/lib/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import { listCallsForUser } from '@/lib/calls';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { ScheduleDialog } from '@/components/calendar/schedule-dialog';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { InitialsAvatar, StatusPill, SkillTags, EmptyState, Field } from '@/components/patterns';
import { formatDate } from '@/lib/format';

export const metadata = { title: 'My mentees' };
export const dynamic = 'force-dynamic';

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function AlumniMenteesPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser(['alumni']);
  const sp = await searchParams;
  const qParam = sp.q;
  const q = (Array.isArray(qParam) ? qParam[0] : qParam)?.toLowerCase() ?? '';

  const [badges, requests, calls] = await Promise.all([
    getNavBadges(user),
    getRequestsFor(user.id, 'alumni'),
    listCallsForUser(user.id),
  ]);

  // A mentee is a student whose request you accepted — that acceptance is what
  // opens messaging and scheduling between you.
  const accepted = requests.filter((r) => r.status === 'accepted' || r.status === 'closed');
  const byStudent = new Map<string, { name: string; types: string[]; since: string; status: string }>();
  for (const r of accepted) {
    if (!r.student) continue;
    const entry = byStudent.get(r.student.id) ?? {
      name: r.student.full_name,
      types: [],
      since: r.responded_at ?? r.created_at,
      status: r.status,
    };
    if (!entry.types.includes(r.type)) entry.types.push(r.type);
    if (new Date(r.created_at) < new Date(entry.since)) entry.since = r.created_at;
    byStudent.set(r.student.id, entry);
  }

  const studentIds = [...byStudent.keys()];

  // Their profiles, so you can see what they are actually aiming at.
  const db = createAdminClient();
  const { data: profiles } = studentIds.length
    ? await db
        .from('student_profiles')
        .select('user_id, branch, batch_year, skills, target_role, target_company, location_pref')
        .in('user_id', studentIds)
    : { data: [] };
  const profileByUser = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));

  const sessionsByPeer = new Map<string, number>();
  for (const c of calls) {
    if (c.status === 'cancelled') continue;
    const peer = c.host_id === user.id ? c.guest_id : c.host_id;
    sessionsByPeer.set(peer, (sessionsByPeer.get(peer) ?? 0) + 1);
  }

  const mentees = studentIds
    .map((id) => ({ id, ...byStudent.get(id)!, profile: profileByUser.get(id), sessions: sessionsByPeer.get(id) ?? 0 }))
    .filter((m) => (q ? m.name.toLowerCase().includes(q) : true))
    .sort((a, b) => +new Date(b.since) - +new Date(a.since));

  const withSession = mentees.filter((m) => m.sessions > 0).length;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="My mentees"
      description="Students whose requests you accepted. Accepting is what opens messaging and lets either of you book a video room."
      actions={
        <Button variant="outline" className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/requests" />}>
          Back to the inbox
        </Button>
      }
    >
      <StatsCards
        stats={[
          { title: 'Mentees', value: mentees.length, subtitle: 'Distinct students you said yes to' },
          { title: 'With a session', value: withSession, subtitle: 'Booked at least one call' },
          {
            title: 'No session yet',
            value: mentees.length - withSession,
            subtitle: mentees.length - withSession ? 'Worth a nudge' : 'All followed through',
          },
          { title: 'Requests accepted', value: accepted.length, subtitle: 'Including repeat asks' },
        ]}
      />

      {mentees.length === 0 ? (
        <EmptyState
          icon={Users}
          title={q ? 'No mentees match that search' : 'No mentees yet'}
          description={
            q
              ? 'Clear the search to see everyone.'
              : 'Accept a request from your inbox and the student will appear here, with messaging and scheduling open between you.'
          }
          action={
            <Button size="sm" render={<Link href="/alumni/requests" />}>
              Open my inbox
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {mentees.map((m) => (
            <Card key={m.id} className="gap-0 p-5">
              <div className="flex items-start gap-3">
                <InitialsAvatar name={m.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-foreground">{m.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.profile
                      ? `${m.profile.branch} · graduating ${m.profile.batch_year}`
                      : 'No profile filled in yet'}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.types.map((t) => (
                      <StatusPill key={t} status={t.replace('_', ' ')} />
                    ))}
                  </div>
                </div>
                {m.sessions > 0 && (
                  <span className="tnum shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {m.sessions} session{m.sessions === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {m.profile && (
                <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
                  <Field label="Target role">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <Target className="size-3 text-muted-foreground" />
                      {m.profile.target_role ?? '—'}
                    </span>
                  </Field>
                  <Field label="Target company">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <Building2 className="size-3 text-muted-foreground" />
                      {m.profile.target_company ?? '—'}
                    </span>
                  </Field>
                  <Field label="Preferred location">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <MapPin className="size-3 text-muted-foreground" />
                      {m.profile.location_pref ?? '—'}
                    </span>
                  </Field>
                  <Field label="Connected since">
                    <span className="text-xs">
                      {formatDate(m.since)}
                    </span>
                  </Field>
                  <div className="col-span-2">
                    <Field label="Skills">
                      <SkillTags skills={m.profile.skills} max={8} />
                    </Field>
                  </div>
                </dl>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                <Button size="sm" render={<Link href={`/alumni/messages?peer=${m.id}`} />}>
                  <MessageSquare className="size-3.5" />
                  Message
                </Button>
                <ScheduleDialog
                  peerId={m.id}
                  peerName={m.name}
                  defaultTitle={`Session with ${m.name}`}
                  trigger={
                    <Button size="sm" variant="outline">
                      <Video className="size-3.5" />
                      Schedule a session
                    </Button>
                  }
                />
              </div>
            </Card>
          ))}
        </div>
      )}
    </DashboardShell>
  );
}
