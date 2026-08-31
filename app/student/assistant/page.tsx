import Link from 'next/link';
import { ClipboardCheck, Check, AlertTriangle, X, Info } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getStudentDashboard } from '@/lib/dashboard';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards, ProgressRing } from '@/components/dashboard/cards';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Readiness check' };
export const dynamic = 'force-dynamic';

type Level = 'good' | 'warn' | 'bad';
type Check = { level: Level; title: string; body: string; href?: string; cta?: string };


export default async function StudentAssistantPage() {
  const user = await requireUser(['student']);
  const [badges, data] = await Promise.all([getNavBadges(user), getStudentDashboard(user)]);
  const p = data.profile;

  const checks: Check[] = [];

  /* ---- profile completeness ---- */
  if (!p) {
    checks.push({
      level: 'bad',
      title: 'You have no profile yet',
      body: 'Nothing can be matched, ranked or recommended until you fill this in. It is the single highest-value thing on this page.',
      href: '/student/settings',
      cta: 'Create my profile',
    });
  } else {
    checks.push(
      p.target_company
        ? {
            level: 'good',
            title: `Target company set — ${p.target_company}`,
            body: 'The company signal is 35% of every match score, the largest single term.',
          }
        : {
            level: 'bad',
            title: 'No target company',
            body: 'Company is 35% of the match score. With it blank, more than a third of every score you see is zero before anything is compared.',
            href: '/student/settings',
            cta: 'Set a target company',
          }
    );

    checks.push(
      p.target_role
        ? {
            level: 'good',
            title: `Target role set — ${p.target_role}`,
            body: 'Role token overlap contributes another 25%.',
          }
        : {
            level: 'bad',
            title: 'No target role',
            body: 'Role is 25% of the score. Without it the matcher cannot tell a site engineer from a data analyst on your behalf.',
            href: '/student/settings',
            cta: 'Set a target role',
          }
    );

    checks.push(
      (p.skills?.length ?? 0) >= 4
        ? {
            level: 'good',
            title: `${p.skills.length} skills listed`,
            body: 'Skill overlap is 20% of the score and also drives opportunity ranking.',
          }
        : {
            level: 'warn',
            title: `Only ${p.skills?.length ?? 0} skills listed`,
            body: 'Four or more gives the overlap calculation something to work with. Below that, the 20% skills term stays near zero.',
            href: '/student/settings',
            cta: 'Add skills',
          }
    );

    checks.push(
      p.location_pref
        ? { level: 'good', title: `Location preference set — ${p.location_pref}`, body: 'Worth the last 5% when it matches exactly.' }
        : {
            level: 'warn',
            title: 'No location preference',
            body: 'Only 5% of the score, but it is free to fill in.',
            href: '/student/settings',
            cta: 'Set a location',
          }
    );

    checks.push(
      p.resume_url
        ? { level: 'good', title: 'Resume link on file', body: 'Alumni ask for this first — having it ready shortens the loop.' }
        : {
            level: 'warn',
            title: 'No resume link',
            body: 'The most common first reply to a request is “send me your resume”. Add the link now and save a round trip.',
            href: '/student/settings',
            cta: 'Add a resume link',
          }
    );
  }

  /* ---- outreach behaviour ---- */
  const { sent, accepted, pending } = data.stats;
  const answered = data.requests.filter((r: any) => r.responded_at).length;

  if (sent === 0) {
    checks.push({
      level: 'warn',
      title: 'You have not sent a request yet',
      body: 'The directory is only useful once you actually ask someone. Start with a strong match and one specific question.',
      href: '/student/suggestions',
      cta: 'See my best matches',
    });
  } else {
    const rate = Math.round((answered / sent) * 100);
    checks.push(
      rate >= 50
        ? { level: 'good', title: `${rate}% of your requests got a reply`, body: 'That is a healthy rate — your messages are landing.' }
        : {
            level: 'warn',
            title: `Only ${rate}% of your requests got a reply`,
            body: 'A low reply rate almost always means the message was generic. Name your year, your target, and the one specific thing you want.',
            href: '/student/requests',
            cta: 'Review what I sent',
          }
    );
  }

  if (accepted > 0 && data.upcoming.length === 0) {
    checks.push({
      level: 'bad',
      title: `${accepted} accepted request${accepted === 1 ? '' : 's'} with no session booked`,
      body: 'This is where most outreach quietly dies. Book the video room while the reply is still fresh.',
      href: '/student/requests',
      cta: 'Schedule a session',
    });
  } else if (data.upcoming.length > 0) {
    checks.push({
      level: 'good',
      title: `${data.upcoming.length} session${data.upcoming.length === 1 ? '' : 's'} scheduled`,
      body: 'Turning a yes into a booked conversation is the step that actually matters.',
    });
  }

  if (pending > 3) {
    checks.push({
      level: 'warn',
      title: `${pending} requests still waiting`,
      body: 'Sending more in parallel rarely helps. Give the existing ones a week before widening.',
    });
  }

  /* ---- skill gaps ---- */
  if (data.skillGaps.length > 0) {
    checks.push({
      level: 'warn',
      title: 'Open roles want skills you have not listed',
      body: `Most requested and missing from your profile: ${data.skillGaps
        .slice(0, 4)
        .map(([s]) => s)
        .join(', ')}. If you have any of these, add them — if not, they are your study list.`,
      href: '/student/opportunities',
      cta: 'See the roles',
    });
  }

  const score = Math.round(
    (checks.filter((c) => c.level === 'good').length / Math.max(1, checks.length)) * 100
  );
  const blockers = checks.filter((c) => c.level === 'bad');

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Readiness check"
      description="A rules-based audit of your profile and your outreach so far. Every item below is derived from your own data — nothing here is generated or predicted."
    >
      <StatsCards
        stats={[
          { title: 'Checks passing', value: `${checks.filter((c) => c.level === 'good').length}/${checks.length}`, subtitle: 'Across profile and outreach' },
          { title: 'Blockers', value: blockers.length, subtitle: blockers.length ? 'Fix these first' : 'Nothing critical' },
          { title: 'Requests sent', value: sent, subtitle: `${accepted} accepted` },
          { title: 'Profile strength', value: `${data.strength}%`, subtitle: 'Fields filled in' },
        ]}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          {checks.map((c, i) => (
            <Card key={i} className="gap-0 p-4">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full',
                    c.level === 'good'
                      ? 'bg-[color-mix(in_oklch,var(--success),transparent_85%)] text-[var(--success)]'
                      : c.level === 'warn'
                        ? 'bg-[color-mix(in_oklch,var(--warning),transparent_85%)] text-[var(--warning)]'
                        : 'bg-destructive/10 text-destructive'
                  )}
                >
                  {c.level === 'good' ? (
                    <Check className="size-3.5" />
                  ) : c.level === 'warn' ? (
                    <AlertTriangle className="size-3.5" />
                  ) : (
                    <X className="size-3.5" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-medium text-foreground">{c.title}</h3>
                    {c.level === 'bad' && (
                      <Badge variant="destructive" className="font-normal">
                        Blocker
                      </Badge>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{c.body}</p>
                  {c.href && c.cta && (
                    <Button size="xs" variant="outline" className="mt-2.5" render={<Link href={c.href} />}>
                      {c.cta}
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <ProgressRing
            title="Readiness"
            value={score}
            caption="Checks passing"
            legend={[
              { label: 'Passing', className: 'bg-primary' },
              { label: 'Needs work', className: 'bg-muted' },
            ]}
          />
          <Card className="gap-0 p-5">
            <div className="mb-2 flex items-center gap-2">
              <ClipboardCheck className="size-4 text-muted-foreground" />
              <h2 className="text-base font-semibold text-foreground">How this is computed</h2>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Each check is a fixed rule against your profile fields and your request history — the
              same numbers on your dashboard. There is no model here and nothing is sent anywhere; the
              page would give the same answer offline.
            </p>
          </Card>
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Passing every check does not guarantee replies. It only means you have removed the reasons
        people ignore a request that are actually within your control.
      </p>
    </DashboardShell>
  );
}
