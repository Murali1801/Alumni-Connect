import Link from 'next/link';
import { Wand2, Building2, MapPin, GraduationCap, Info } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getDirectory, getStudentProfile } from '@/lib/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InitialsAvatar, MatchScore, EmptyState } from '@/components/patterns';

export const metadata = { title: 'Smart matches' };
export const dynamic = 'force-dynamic';

const TYPES = [
  { key: 'mentorship', label: 'Mentorship', field: 'mentorship_available' },
  { key: 'mock_interview', label: 'Mock interviews', field: 'mock_interview_available' },
  { key: 'referral', label: 'Referrals', field: 'referral_available' },
  { key: 'internship', label: 'Internships', field: 'internship_available' },
] as const;

export default async function StudentSuggestionsPage() {
  const user = await requireUser(['student']);
  const [badges, profile] = await Promise.all([getNavBadges(user), getStudentProfile(user.id)]);

  if (!profile) {
    return (
      <DashboardShell
        user={user}
        badges={badges}
        title="Smart matches"
        description="Ranked suggestions computed from your profile against every claimed alumnus."
      >
        <EmptyState
          icon={Wand2}
          title="Add your profile first"
          description="Matching compares your target company, target role, skills and location against each alumnus. Without a profile there is nothing to compare."
          action={
            <Button size="sm" render={<Link href="/student/settings" />}>
              Set up my profile
            </Button>
          }
        />
      </DashboardShell>
    );
  }

  // Pull a wide slice of claimed profiles and rank them with the real engine,
  // rather than showing an arbitrary "recommended" list.
  const { items, total } = await getDirectory(
    { status: 'claimed', sort: 'match', page: 1, pageSize: 60 },
    profile
  );

  // Requests already sent, so a suggestion never points somewhere you have been.
  const db = createAdminClient();
  const { data: sent } = await db.from('requests').select('alumni_id').eq('student_id', user.id);
  const contacted = new Set((sent ?? []).map((r: any) => r.alumni_id));

  const ranked = items
    .filter((i) => i.match.matchable)
    .filter((i) => !contacted.has(i.record.alumni_profiles?.user_id ?? ''))
    .sort((a, b) => b.match.score - a.match.score);

  const strong = ranked.filter((r) => r.match.score >= 50).length;
  const top = ranked.slice(0, 12);

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Smart matches"
      description="Every claimed alumnus scored against your profile, strongest first, with the people you have already contacted removed."
      actions={
        <Button variant="outline" className="h-9 w-full px-4 sm:w-auto" render={<Link href="/student/settings" />}>
          Tune my profile
        </Button>
      }
    >
      <StatsCards
        stats={[
          { title: 'Claimed alumni', value: total.toLocaleString(), subtitle: 'Reachable on the network' },
          { title: 'Not yet contacted', value: ranked.length, subtitle: 'Available suggestions' },
          { title: 'Strong matches', value: strong, subtitle: 'Scoring 50 or above' },
          {
            title: 'Your target',
            value: profile.target_company ? '✓' : '—',
            subtitle: profile.target_company ?? 'No target company set — 35% of the score is idle',
          },
        ]}
      />

      {top.length === 0 ? (
        <EmptyState
          icon={Wand2}
          title="No new suggestions"
          description="You have already contacted everyone the matcher can rank for you. Widen your targets, or browse the directory directly."
          action={
            <Button size="sm" variant="outline" render={<Link href="/student/directory" />}>
              Browse the directory
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {top.map(({ record, match }) => {
            const p = record.alumni_profiles!;
            const reasons = match.signals.filter((s) => s.contribution > 0);
            const offers = TYPES.filter((t) => p[t.field]);

            return (
              <Card key={record.id} className="gap-0 p-5">
                <div className="flex items-start gap-3">
                  <InitialsAvatar name={record.full_name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-sm font-semibold text-foreground">{record.full_name}</h2>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.designation ?? 'Role not shared'}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <GraduationCap className="size-3" />
                        {record.branch} {record.batch_year}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="size-3" />
                        {p.current_company?.name ?? '—'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3" />
                        {p.location ?? '—'}
                      </span>
                    </p>
                  </div>
                  <MatchScore score={match.score} size={48} />
                </div>

                <div className="mt-4 space-y-1.5 rounded-lg bg-muted/60 p-3">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    Why they came up
                  </p>
                  {reasons.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Only cohort proximity — nothing in your profile overlaps with theirs yet.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {reasons.map((s) => (
                        <li key={s.key} className="flex items-baseline justify-between gap-3 text-xs">
                          <span className="text-foreground">{s.detail}</span>
                          <span className="tnum shrink-0 text-muted-foreground">+{s.contribution}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {offers.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {offers.map((t) => (
                      <Badge key={t.key} variant="secondary" className="font-normal">
                        {t.label}
                      </Badge>
                    ))}
                  </div>
                )}

                <Button
                  size="sm"
                  className="mt-4 w-full"
                  render={<Link href={`/student/directory/${record.id}`} />}
                >
                  View profile and send a request
                </Button>
              </Card>
            );
          })}
        </div>
      )}

      <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        These are computed, not generated: the same weighted signals shown on every profile, applied
        across the claimed directory. Nothing here is a prediction — it is arithmetic on the two
        profiles, and you can see every term.
      </p>
    </DashboardShell>
  );
}
