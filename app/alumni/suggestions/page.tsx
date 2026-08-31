import Link from 'next/link';
import { Wand2, Target, Building2, MapPin, Info } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAlumniProfile } from '@/lib/queries';
import { createAdminClient } from '@/lib/supabase/admin';
import { skillOverlap, roleOverlap } from '@/lib/matching';
import { DashboardShell } from '@/components/dashboard/shell';
import { StatsCards } from '@/components/dashboard/cards';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InitialsAvatar, MatchScore, EmptyState, SkillTags } from '@/components/patterns';

export const metadata = { title: 'Students to help' };
export const dynamic = 'force-dynamic';

export default async function AlumniSuggestionsPage() {
  const user = await requireUser(['alumni']);
  const [badges, profile] = await Promise.all([getNavBadges(user), getAlumniProfile(user.id)]);

  if (!profile) {
    return (
      <DashboardShell
        user={user}
        badges={badges}
        title="Students to help"
        description="Students whose goals line up with your experience."
      >
        <EmptyState
          icon={Wand2}
          title="Claim your record first"
          description="Your company, role and skills are what students are matched against. Until your profile exists there is nothing to compare."
          action={
            <Button size="sm" render={<Link href="/alumni/profile" />}>
              Set up my profile
            </Button>
          }
        />
      </DashboardShell>
    );
  }

  const db = createAdminClient();
  const [{ data: students }, { data: myRequests }] = await Promise.all([
    db
      .from('student_profiles')
      .select('user_id, branch, batch_year, skills, target_role, target_company, target_industry, location_pref')
      .limit(500),
    db.from('requests').select('student_id').eq('alumni_id', user.id),
  ]);

  const alreadyAsked = new Set((myRequests ?? []).map((r: any) => r.student_id));
  const ids = (students ?? []).map((s: any) => s.user_id);
  const { data: people } = ids.length
    ? await db.from('users').select('id, full_name').in('id', ids)
    : { data: [] };
  const nameById = new Map((people ?? []).map((p: any) => [p.id, p.full_name]));

  const myCompany = profile.current_company?.name?.toLowerCase() ?? '';
  const mySkills: string[] = profile.skills ?? [];

  /**
   * Score a student the other way round from the student-facing matcher: how
   * much of what they want does this alumnus actually have to offer.
   */
  const ranked = (students ?? [])
    .filter((s: any) => !alreadyAsked.has(s.user_id))
    .map((s: any) => {
      const signals: string[] = [];
      let score = 0;

      if (s.target_company && myCompany && myCompany.includes(s.target_company.toLowerCase())) {
        score += 40;
        signals.push(`They are aiming for ${profile.current_company?.name}, where you work`);
      }

      const role = roleOverlap(s.target_role, profile.designation, profile.industry);
      if (role > 0) {
        score += Math.round(role * 25);
        signals.push(`Their target role overlaps with your work as ${profile.designation ?? 'an engineer'}`);
      }

      const skills = skillOverlap(s.skills ?? [], mySkills);
      if (skills > 0) {
        score += Math.round(skills * 25);
        const shared = (s.skills ?? []).filter((sk: string) =>
          mySkills.some((m) => m.toLowerCase() === sk.toLowerCase())
        );
        signals.push(`Shared skills: ${shared.slice(0, 4).join(', ')}`);
      }

      if (s.location_pref && profile.location && s.location_pref.toLowerCase() === profile.location.toLowerCase()) {
        score += 10;
        signals.push(`Both based around ${profile.location}`);
      }

      return {
        id: s.user_id,
        name: nameById.get(s.user_id) ?? 'Student',
        profile: s,
        score: Math.min(100, score),
        signals,
      };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);

  const totalStudents = students?.length ?? 0;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Students to help"
      description="Scored the other way round from the student directory: how much of what each student wants you are actually positioned to give."
      actions={
        <Button variant="outline" className="h-9 w-full px-4 sm:w-auto" render={<Link href="/alumni/profile" />}>
          Update my profile
        </Button>
      }
    >
      <StatsCards
        stats={[
          { title: 'Students on the network', value: totalStudents, subtitle: 'With a profile filled in' },
          { title: 'Relevant to you', value: ranked.length, subtitle: 'Some signal overlaps' },
          {
            title: 'Your company',
            value: profile.current_company?.name ? '✓' : '—',
            subtitle: profile.current_company?.name ?? 'Not set — the strongest signal is idle',
          },
          {
            title: 'Your skills',
            value: mySkills.length,
            subtitle: mySkills.length ? 'Used for overlap' : 'Add some to match better',
          },
        ]}
      />

      {ranked.length === 0 ? (
        <EmptyState
          icon={Wand2}
          title="No students to surface yet"
          description={
            totalStudents === 0
              ? 'No students have filled in a profile yet. Once they do, the ones you are positioned to help will appear here.'
              : 'No student profile currently overlaps with your company, role or skills. Filling in more of your own profile widens this considerably.'
          }
          action={
            <Button size="sm" variant="outline" render={<Link href="/alumni/profile" />}>
              Complete my profile
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {ranked.map((s) => (
            <Card key={s.id} className="gap-0 p-5">
              <div className="flex items-start gap-3">
                <InitialsAvatar name={s.name} size="lg" />
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold text-foreground">{s.name}</h2>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.profile.branch} · graduating {s.profile.batch_year}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Target className="size-3" />
                      {s.profile.target_role ?? 'No target role'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Building2 className="size-3" />
                      {s.profile.target_company ?? '—'}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="size-3" />
                      {s.profile.location_pref ?? '—'}
                    </span>
                  </p>
                </div>
                <MatchScore score={s.score} size={48} />
              </div>

              <div className="mt-4 space-y-1.5 rounded-lg bg-muted/60 p-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Why you could help
                </p>
                <ul className="space-y-1">
                  {s.signals.map((sig) => (
                    <li key={sig} className="text-xs text-foreground">
                      {sig}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-3">
                <SkillTags skills={s.profile.skills} max={8} />
              </div>

              <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted-foreground">
                Students start the conversation here — they have to send the request. What you can do
                is make sure the availability types they need are switched on.
              </p>
            </Card>
          ))}
        </div>
      )}

      <p className="flex items-start gap-2 rounded-lg bg-muted px-4 py-3 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Contact always flows student to alumnus, never the reverse — that is what stops the network
        turning into cold outreach at students. This page exists so you can see who you are useful to,
        and set your availability accordingly.
      </p>
    </DashboardShell>
  );
}
