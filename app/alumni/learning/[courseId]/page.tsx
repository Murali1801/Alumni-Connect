import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, BarChart3, GraduationCap, Target, Users } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getCourseForEditor, KIND_LABEL, LEVEL_LABEL, formatMinutes } from '@/lib/learning';
import { formatCompactDate, formatDate, formatNumber } from '@/lib/format';
import { DashboardShell } from '@/components/dashboard/shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState, MemberAvatar, SkillTags, StatCard } from '@/components/patterns';
import { CourseCover, KIND_ICON, ProgressBar } from '@/components/learning/bits';
import { CourseActions } from '@/components/learning/course-actions';
import { CourseEditor } from '@/components/learning/course-editor';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ courseId: string }>; searchParams: Promise<{ tab?: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Props) {
  const { courseId } = await params;
  const user = await requireUser(['alumni']);
  const data = UUID.test(courseId) ? await getCourseForEditor(courseId, user.id) : null;
  return { title: data ? `Edit · ${data.course.title}` : 'Course' };
}

/** A course's editor (modules and lessons) and its learner analytics. */
export default async function AlumniCoursePage({ params, searchParams }: Props) {
  const user = await requireUser(['alumni']);
  const { courseId } = await params;
  const { tab: rawTab } = await searchParams;
  if (!UUID.test(courseId)) notFound();
  const [badges, data] = await Promise.all([getNavBadges(user), getCourseForEditor(courseId, user.id)]);
  if (!data) notFound();
  const { course, modules, analytics: a } = data;
  const tab = rawTab === 'analytics' ? 'analytics' : 'content';
  const base = `/alumni/learning/${course.id}`;

  return (
    <DashboardShell user={user} badges={badges} bare title={course.title} description={course.summary}>
      <div className="space-y-4">
        <Link href="/alumni/learning" className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden /> Your courses
        </Link>

        <Card className="gap-0 py-0">
          <CourseCover cover={course.cover} className="h-3" icon={false} />
          <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant={course.published ? 'secondary' : 'outline'}>{course.published ? 'Published' : 'Draft'}</Badge>
                <Badge variant="secondary" className="font-normal">
                  {LEVEL_LABEL[course.level]}
                </Badge>
                {course.topics.map((t) => (
                  <Badge key={t} variant="outline" className="font-normal text-muted-foreground">
                    {t}
                  </Badge>
                ))}
              </div>
              <h1 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">{course.title}</h1>
              {course.summary && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{course.summary}</p>}
              <p className="text-xs text-muted-foreground">
                {course.modules} modules · {course.lessons} lessons · {formatMinutes(course.minutes || 0)} of content · estimated {course.est_hours} h
                {course.published_at && <> · published {formatDate(course.published_at)}</>}
              </p>
              <SkillTags skills={course.skills} max={10} />
            </div>
            <CourseActions
              course={{
                id: course.id,
                title: course.title,
                summary: course.summary,
                cover: course.cover,
                level: course.level,
                topics: course.topics,
                skills: course.skills,
                est_hours: course.est_hours,
              }}
              published={course.published}
              lessons={course.lessons}
              learners={a.learners}
            />
          </div>
          {!course.published && (
            <p className="border-t border-border bg-muted/50 px-5 py-2.5 text-xs text-muted-foreground">
              Drafts are visible only to you. Publish when the first module is ready; you can keep adding lessons afterwards.
            </p>
          )}
        </Card>

        <nav className="flex gap-1 overflow-x-auto border-b border-border" aria-label="Course sections">
          {[
            { key: 'content', label: 'Content', href: base },
            { key: 'analytics', label: `Learners${a.learners ? ` (${formatNumber(a.learners)})` : ''}`, href: `${base}?tab=analytics` },
          ].map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={tab === t.key ? 'page' : undefined}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors',
                tab === t.key ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>

        {tab === 'content' ? (
          <CourseEditor courseId={course.id} modules={modules} />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Learners" value={formatNumber(a.learners)} icon={Users} />
              <StatCard label="Completed" value={formatNumber(a.completed)} hint={a.learners ? `${a.completionRate}% completion rate` : undefined} icon={GraduationCap} />
              <StatCard label="Average progress" value={`${a.avgProgress}%`} icon={BarChart3} />
              <StatCard label="Average quiz score" value={a.avgQuizScore !== null ? `${a.avgQuizScore}%` : '—'} hint="Best attempt per learner" icon={Target} />
            </div>

            {a.learners === 0 ? (
              <EmptyState icon={Users} title="No learners yet" description={course.published ? 'Students who enrol show up here with their progress.' : 'Publish the course so students can enrol.'} />
            ) : (
              <>
                <Card className="gap-0 py-0">
                  <h2 className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">Lesson by lesson</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                          <th scope="col" className="px-5 py-2 font-medium">Lesson</th>
                          <th scope="col" className="px-3 py-2 font-medium">Completed</th>
                          <th scope="col" className="w-40 px-3 py-2 font-medium">Rate</th>
                          <th scope="col" className="px-5 py-2 text-right font-medium">Avg score</th>
                        </tr>
                      </thead>
                      <tbody>
                        {a.lessons.map((l) => {
                          const Icon = KIND_ICON[l.kind];
                          return (
                            <tr key={l.id} className="border-t border-border/60">
                              <td className="px-5 py-2">
                                <span className="flex items-center gap-2">
                                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-label={KIND_LABEL[l.kind]} />
                                  <span className="truncate">{l.title}</span>
                                </span>
                              </td>
                              <td className="tnum px-3 py-2 text-muted-foreground">{formatNumber(l.completed)}</td>
                              <td className="px-3 py-2">
                                <span className="flex items-center gap-2">
                                  <ProgressBar value={l.rate} label={`${l.title} completion`} />
                                  <span className="tnum w-9 text-right text-xs text-muted-foreground">{l.rate}%</span>
                                </span>
                              </td>
                              <td className="tnum px-5 py-2 text-right text-muted-foreground">{l.avgScore !== null ? `${l.avgScore}%` : '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <Card className="gap-0 py-0">
                  <h2 className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">
                    Learners <span className="font-normal text-muted-foreground">· most recently active first</span>
                  </h2>
                  <ul>
                    {a.people.map((p, i) => (
                      <li key={p.member.id} className={cn('flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center', i > 0 && 'border-t border-border/60')}>
                        <Link href={`/alumni/people/${p.member.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                          <MemberAvatar name={p.member.full_name} url={p.member.avatar_url} />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground hover:underline">{p.member.full_name}</span>
                            <span className="block truncate text-xs text-muted-foreground">{p.member.headline}</span>
                          </span>
                        </Link>
                        <div className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground sm:w-80">
                          <span className="flex flex-1 items-center gap-2">
                            <ProgressBar value={p.percent} label={`${p.member.full_name} progress`} />
                            <span className="tnum w-9 text-right">{p.percent}%</span>
                          </span>
                          <span className="w-24 text-right">
                            {p.completed_at ? (
                              <span className="inline-flex items-center gap-1 text-[var(--success)]">
                                Done{p.score !== null && <span className="tnum"> · {p.score}%</span>}
                              </span>
                            ) : (
                              <>Active {formatCompactDate(p.last_seen_at)}</>
                            )}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            )}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
