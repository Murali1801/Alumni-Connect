import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  MapPin,
  GraduationCap,
  Briefcase,
  ExternalLink,
  Clock,
  Info,
} from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAlumniRecord, getStudentProfile } from '@/lib/queries';
import { scoreMatch } from '@/lib/matching';
import { createAdminClient } from '@/lib/supabase/admin';
import { DashboardShell } from '@/components/dashboard/shell';
import { RequestDialog } from '@/components/directory/request-dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { InitialsAvatar, MatchScore, Field, SkillTags, StatusPill } from '@/components/patterns';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const record = await getAlumniRecord((await params).id);
  return { title: record?.full_name ?? 'Alumnus' };
}

const REQUEST_TYPES = [
  { value: 'mentorship', label: 'Mentorship', field: 'mentorship_available' },
  { value: 'mock_interview', label: 'Mock interview', field: 'mock_interview_available' },
  { value: 'referral', label: 'Referral', field: 'referral_available' },
  { value: 'internship', label: 'Internship', field: 'internship_available' },
] as const;

export default async function AlumnusDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(['student']);
  const [badges, record, profile] = await Promise.all([
    getNavBadges(user),
    getAlumniRecord(id),
    getStudentProfile(user.id),
  ]);
  if (!record) notFound();

  const alumniProfile = record.alumni_profiles;
  const match = profile
    ? scoreMatch(profile, record, 'mentorship')
    : {
        score: 0,
        signals: [],
        matchable: Boolean(alumniProfile),
        fallbackReason: 'Add your profile to see how well you match.',
      };

  // Requests this student already has open with this alumnus, so the dialog can
  // disable types that would be rejected by the unique index.
  let existing: { type: string; status: string }[] = [];
  if (alumniProfile?.user_id) {
    const db = createAdminClient();
    const { data } = await db
      .from('requests')
      .select('type, status')
      .eq('student_id', user.id)
      .eq('alumni_id', alumniProfile.user_id);
    existing = data ?? [];
  }

  const available = REQUEST_TYPES.filter((t) => alumniProfile?.[t.field]);
  const company = alumniProfile?.current_company?.name ?? record.first_company?.name ?? null;

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title={record.full_name}
      description={`${record.branch} · Class of ${record.batch_year}${company ? ` · ${company}` : ''}`}
      actions={
        <Button variant="outline" className="h-9 w-full px-4 sm:w-auto" render={<Link href="/student/directory" />}>
          <ArrowLeft className="size-4" />
          Back to directory
        </Button>
      }
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Profile */}
        <div className="space-y-4 lg:col-span-2">
          <Card className="gap-0 p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <InitialsAvatar name={record.full_name} size="xl" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-xl text-foreground">{record.full_name}</h2>
                  <StatusPill status={record.claim_status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {alumniProfile?.designation ?? record.first_role ?? 'Role not shared'}
                  {company ? ` at ${company}` : ''}
                </p>
                {alumniProfile?.bio && (
                  <p className="mt-3 text-sm leading-relaxed text-foreground">{alumniProfile.bio}</p>
                )}
                {alumniProfile?.linkedin_url && (
                  <a
                    href={alumniProfile.linkedin_url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    LinkedIn profile
                  </a>
                )}
              </div>
            </div>

            <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-5 sm:grid-cols-3">
              <Field label="Branch">
                <span className="inline-flex items-center gap-1.5">
                  <GraduationCap className="size-3.5 text-muted-foreground" />
                  {record.branch}
                </span>
              </Field>
              <Field label="Batch">{record.batch_year}</Field>
              <Field label="Location">
                <span className="inline-flex items-center gap-1.5">
                  <MapPin className="size-3.5 text-muted-foreground" />
                  {alumniProfile?.location ?? record.city ?? '—'}
                </span>
              </Field>
              <Field label="Current employer">
                <span className="inline-flex items-center gap-1.5">
                  <Building2 className="size-3.5 text-muted-foreground" />
                  {alumniProfile?.current_company?.name ?? '—'}
                </span>
              </Field>
              <Field label="First employer">
                <span className="inline-flex items-center gap-1.5">
                  <Briefcase className="size-3.5 text-muted-foreground" />
                  {record.first_company?.name ?? '—'}
                </span>
              </Field>
              <Field label="Experience">
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="size-3.5 text-muted-foreground" />
                  {alumniProfile?.experience_years ? `${alumniProfile.experience_years} years` : '—'}
                </span>
              </Field>
            </dl>

            <div className="mt-5 space-y-2 border-t border-border pt-5">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Skills</h3>
              <SkillTags skills={alumniProfile?.skills} max={16} />
            </div>
          </Card>

          {/* Match breakdown */}
          <Card className="gap-0 p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-foreground">Why this match</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Every signal below is weighted and shown — the score is not a black box.
                </p>
              </div>
              <MatchScore score={match.score} matchable={match.matchable} size={56} />
            </div>

            {!match.matchable || match.signals.length === 0 ? (
              <div className="flex items-start gap-2.5 rounded-lg bg-muted px-3 py-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" />
                <p className="leading-relaxed">
                  {match.fallbackReason ??
                    'This alumnus has not claimed their profile, so only branch and batch proximity can be scored.'}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {match.signals.map((s) => (
                  <li key={s.key}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium text-foreground">{s.label}</span>
                      <span className="tnum text-xs text-muted-foreground">
                        {s.contribution} / {Math.round(s.weight * 100)} pts
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.round(s.raw * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Action rail */}
        <div className="space-y-4">
          <Card className="gap-0 p-5">
            <h2 className="mb-1 text-base font-semibold text-foreground">Reach out</h2>
            <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
              {alumniProfile
                ? available.length > 0
                  ? 'Pick what you need. Your message goes straight to their inbox.'
                  : 'This alumnus has not marked themselves available for anything yet.'
                : 'This record has not been claimed, so there is no account to contact.'}
            </p>

            {alumniProfile && available.length > 0 ? (
              <RequestDialog
                alumniUserId={alumniProfile.user_id}
                alumniName={record.full_name}
                matchScore={match.score}
                types={available.map((t) => ({
                  value: t.value,
                  label: t.label,
                  existing: existing.find((e) => e.type === t.value)?.status ?? null,
                }))}
              />
            ) : (
              <Button className="w-full" disabled>
                Not available for requests
              </Button>
            )}

            {existing.length > 0 && (
              <div className="mt-4 space-y-2 border-t border-border pt-4">
                <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  Your history
                </h3>
                {existing.map((e) => (
                  <div key={e.type} className="flex items-center justify-between gap-2 text-xs">
                    <span className="capitalize text-muted-foreground">{e.type.replace('_', ' ')}</span>
                    <StatusPill status={e.status} />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="gap-0 p-5">
            <h2 className="mb-3 text-base font-semibold text-foreground">Available for</h2>
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing marked yet.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {available.map((t) => (
                  <Badge key={t.value} variant="secondary" className="font-normal">
                    {t.label}
                  </Badge>
                ))}
              </div>
            )}
          </Card>

          <Card className="gap-0 p-5">
            <h2 className="mb-3 text-base font-semibold text-foreground">Institutional record</h2>
            <dl className="space-y-3">
              <Field label="First role">{record.first_role ?? '—'}</Field>
              <Field label="First CTC">
                {record.first_ctc_lpa ? `${record.first_ctc_lpa} LPA` : '—'}
              </Field>
              <Field label="Higher education">{record.higher_ed_raw ?? '—'}</Field>
            </dl>
            <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
              Taken from the college record and never edited by the alumnus. Contact details are held
              for claim invitations only and are never shown here.
            </p>
          </Card>
        </div>
      </div>
    </DashboardShell>
  );
}
