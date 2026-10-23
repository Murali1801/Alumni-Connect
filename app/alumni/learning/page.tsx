import Link from 'next/link';
import { BookOpen, CalendarDays, CalendarPlus, CheckCircle2, GraduationCap, Plus, Users } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getAuthorCourses, listWorkshops, LEVEL_LABEL, formatMinutes } from '@/lib/learning';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { DashboardShell } from '@/components/dashboard/shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState, MemberAvatar, StatCard } from '@/components/patterns';
import { CourseCover, ProgressBar } from '@/components/learning/bits';
import { CourseFormDialog } from '@/components/learning/course-form';
import { WorkshopFormDialog } from '@/components/learning/workshop-form';
import { WorkshopHostActions } from '@/components/learning/workshop-host-actions';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Learning' };
export const dynamic = 'force-dynamic';

/**
 * The Learning hub for alumni: the courses they teach with how learners are
 * doing, and the live workshops they host with who has a seat.
 */
export default async function AlumniLearningPage() {
  const user = await requireUser(['alumni']);
  const [badges, courses, workshops] = await Promise.all([
    getNavBadges(user),
    getAuthorCourses(user.id),
    listWorkshops({ viewerId: user.id, hostId: user.id }),
  ]);
  const upcoming = workshops.filter((w) => !w.ended).sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const past = workshops.filter((w) => w.ended);
  const learners = courses.reduce((a, c) => a + c.learners, 0);
  const completions = courses.reduce((a, c) => a + c.completed, 0);
  const courseOptions = courses.map((c) => ({ id: c.id, title: c.title }));

  return (
    <DashboardShell
      user={user}
      badges={badges}
      title="Learning"
      description="Teach what got you hired. Build self-paced courses for SJCEM students and host live workshops."
      actions={
        <>
          <WorkshopFormDialog
            courses={courseOptions}
            trigger={
              <Button variant="outline">
                <CalendarPlus /> Schedule workshop
              </Button>
            }
          />
          <CourseFormDialog
            trigger={
              <Button>
                <Plus /> New course
              </Button>
            }
          />
        </>
      }
    >
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label="Courses" value={formatNumber(courses.length)} hint={`${courses.filter((c) => c.published).length} published`} icon={BookOpen} />
          <StatCard label="Learners" value={formatNumber(learners)} hint="Enrolments across your courses" icon={Users} />
          <StatCard label="Completions" value={formatNumber(completions)} hint={learners ? `${Math.round((completions / learners) * 100)}% of enrolments` : 'None yet'} icon={GraduationCap} />
          <StatCard label="Upcoming workshops" value={formatNumber(upcoming.filter((w) => !w.cancelled_at).length)} hint={`${formatNumber(upcoming.reduce((a, w) => a + w.attendees, 0))} seats taken`} icon={CalendarDays} />
        </div>

        <section aria-labelledby="my-courses" className="space-y-3">
          <h2 id="my-courses" className="text-sm font-semibold text-foreground">
            Your courses
          </h2>
          {courses.length === 0 ? (
            <EmptyState
              icon={BookOpen}
              title="No courses yet"
              description="A course is a few modules of short lessons: readings, videos, resources and quizzes. Start with one topic you know well."
              action={
                <CourseFormDialog
                  trigger={
                    <Button size="sm">
                      <Plus /> New course
                    </Button>
                  }
                />
              }
            />
          ) : (
            <Card className="gap-0 py-0">
              <ul>
                {courses.map((c, i) => (
                  <li key={c.id} className={cn(i > 0 && 'border-t border-border')}>
                    <Link href={`/alumni/learning/${c.id}`} className="flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-muted/60 sm:flex-row sm:items-center">
                      <CourseCover cover={c.cover} className="hidden size-14 shrink-0 rounded-lg sm:flex" />
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-sm font-semibold text-foreground">{c.title}</p>
                          <Badge variant={c.published ? 'secondary' : 'outline'} className="font-normal">
                            {c.published ? 'Published' : 'Draft'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {LEVEL_LABEL[c.level]} · {c.modules} modules · {c.lessons} lessons · {formatMinutes(c.minutes)} of content · updated {formatDate(c.updated_at)}
                        </p>
                      </div>
                      <dl className="grid shrink-0 grid-cols-3 gap-4 text-center sm:w-80">
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Learners</dt>
                          <dd className="tnum text-sm font-semibold text-foreground">{formatNumber(c.learners)}</dd>
                        </div>
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Completion</dt>
                          <dd className="tnum text-sm font-semibold text-foreground">{c.learners ? `${c.completionRate}%` : '—'}</dd>
                          {c.learners > 0 && <ProgressBar value={c.completionRate} label={`${c.title} completion rate`} className="mt-1" />}
                        </div>
                        <div>
                          <dt className="text-[11px] text-muted-foreground">Avg quiz</dt>
                          <dd className="tnum text-sm font-semibold text-foreground">{c.avgQuizScore !== null ? `${c.avgQuizScore}%` : '—'}</dd>
                        </div>
                      </dl>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </section>

        <section aria-labelledby="my-workshops" className="space-y-3">
          <h2 id="my-workshops" className="text-sm font-semibold text-foreground">
            Your workshops
          </h2>
          {workshops.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No workshops yet"
              description="Run a live session such as a mock interview round or a doubt-clearing hour. Students reserve seats up to the capacity you set."
              action={
                <WorkshopFormDialog
                  courses={courseOptions}
                  trigger={
                    <Button size="sm" variant="outline">
                      <CalendarPlus /> Schedule workshop
                    </Button>
                  }
                />
              }
            />
          ) : (
            <Card className="gap-0 py-0">
              <ul>
                {[...upcoming, ...past].map((w, i) => {
                  const ended = w.ended;
                  return (
                    <li key={w.id} className={cn('space-y-2 px-5 py-4', i > 0 && 'border-t border-border', ended && 'opacity-75')}>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 space-y-0.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-sm font-semibold text-foreground">{w.title}</p>
                            {w.cancelled_at ? (
                              <Badge variant="destructive">Cancelled</Badge>
                            ) : ended ? (
                              <Badge variant="outline" className="font-normal">Ended</Badge>
                            ) : (
                              <Badge variant="secondary" className="font-normal">Upcoming</Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(w.starts_at)} · {formatMinutes(w.duration_min)} · {w.location}
                            {w.course && <> · {w.course.title}</>}
                          </p>
                          {w.room_path && <p className="truncate text-[11px] text-muted-foreground">Room: {w.room_path}</p>}
                        </div>
                        <WorkshopHostActions
                          workshop={{ ...w, course_id: w.course?.id ?? null }}
                          courses={courseOptions}
                          ended={ended}
                          attendees={w.attendees}
                        />
                      </div>
                      <details className="group">
                        <summary className="cursor-pointer text-xs font-medium text-primary marker:text-muted-foreground">
                          <span className="tnum">{w.attendees}</span> of <span className="tnum">{w.capacity}</span> seats taken
                        </summary>
                        {w.attendeeList.length === 0 ? (
                          <p className="mt-2 text-xs text-muted-foreground">Nobody has reserved a seat yet.</p>
                        ) : (
                          <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {w.attendeeList.map((m) => (
                              <li key={m.id}>
                                <Link href={`/alumni/people/${m.id}`} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted">
                                  <MemberAvatar name={m.full_name} url={m.avatar_url} size="sm" />
                                  <span className="min-w-0">
                                    <span className="block truncate text-xs font-medium text-foreground">{m.full_name}</span>
                                    <span className="block truncate text-[11px] text-muted-foreground">{m.headline}</span>
                                  </span>
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </details>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
          {past.length > 0 && (
            <p className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <CheckCircle2 className="size-3" aria-hidden /> {past.length} past {past.length === 1 ? 'workshop' : 'workshops'} shown last.
            </p>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
