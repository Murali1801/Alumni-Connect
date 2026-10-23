import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, Layers, Users } from 'lucide-react';
import { requireUser } from '@/lib/session';
import { getNavBadges } from '@/lib/badges';
import { getCourseForLearner, LEVEL_LABEL, KIND_LABEL, formatMinutes } from '@/lib/learning';
import { formatDate, formatNumber } from '@/lib/format';
import { DashboardShell } from '@/components/dashboard/shell';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MemberAvatar, SkillTags } from '@/components/patterns';
import { CourseCover, KIND_ICON } from '@/components/learning/bits';
import { EnrolButton, LeaveCourseButton } from '@/components/learning/enrol-button';
import { CoursePlayer } from '@/components/learning/course-player';
import { WorkshopCardView } from '@/components/learning/workshop-card';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ courseId: string }>; searchParams: Promise<{ lesson?: string }> };

const BASE = '/student/learning';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: Props) {
  const { courseId } = await params;
  const user = await requireUser(['student']);
  const data = UUID.test(courseId) ? await getCourseForLearner(courseId, user.id) : null;
  return { title: data ? data.course.title : 'Course' };
}

/** A course: its overview and syllabus, and the lesson player once enrolled. */
export default async function StudentCoursePage({ params, searchParams }: Props) {
  const user = await requireUser(['student']);
  const { courseId } = await params;
  const { lesson } = await searchParams;
  if (!UUID.test(courseId)) notFound();
  const [badges, data] = await Promise.all([getNavBadges(user), getCourseForLearner(courseId, user.id)]);
  if (!data) notFound();
  const { course, modules, enrolment, workshops } = data;
  const all = modules.flatMap((m) => m.lessons);
  const start = all.find((l) => l.id === lesson)?.id ?? data.resumeLessonId ?? all[0]?.id ?? null;

  return (
    <DashboardShell user={user} badges={badges} bare title={course.title} description={course.summary}>
      <div className="space-y-4">
        <Link href={enrolment ? `${BASE}?tab=mine` : BASE} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" aria-hidden /> {enrolment ? 'My learning' : 'All courses'}
        </Link>

        <Card className="gap-0 py-0">
          <CourseCover cover={course.cover} className={enrolment ? 'h-3' : 'h-24'} icon={!enrolment} />
          <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary" className="font-normal">
                  {LEVEL_LABEL[course.level]}
                </Badge>
                {course.topics.map((t) => (
                  <Badge key={t} variant="outline" className="font-normal text-muted-foreground" render={<Link href={`${BASE}?topic=${encodeURIComponent(t)}`} />}>
                    {t}
                  </Badge>
                ))}
                {!course.published && <Badge variant="outline">No longer listed</Badge>}
              </div>
              <h1 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">{course.title}</h1>
              {!enrolment && course.summary && <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{course.summary}</p>}
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Layers className="size-3.5" aria-hidden /> {course.modules} modules · {course.lessons} lessons
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3.5" aria-hidden /> About {course.est_hours} hours
                </span>
                <span className="inline-flex items-center gap-1">
                  <Users className="size-3.5" aria-hidden /> {formatNumber(course.learners)} learners
                </span>
                <span>Updated {formatDate(course.updated_at)}</span>
              </p>
              {course.author && (
                <Link href={`/student/people/${course.author.id}`} className="flex w-fit items-center gap-2 pt-1">
                  <MemberAvatar name={course.author.full_name} url={course.author.avatar_url} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-foreground hover:underline">{course.author.full_name}</span>
                    <span className="block text-[11px] text-muted-foreground">{course.author.headline}</span>
                  </span>
                </Link>
              )}
            </div>
            <div className="shrink-0">
              {enrolment ? <LeaveCourseButton courseId={course.id} title={course.title} /> : course.lessons > 0 && <EnrolButton courseId={course.id} className="w-full sm:w-auto" />}
            </div>
          </div>
        </Card>

        {enrolment && start ? (
          <CoursePlayer
            courseTitle={course.title}
            modules={modules}
            initialLessonId={start}
            initialCompletedAt={enrolment.completed_at}
            initialScore={enrolment.score}
          />
        ) : (
          <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
            <Card className="gap-0 py-0">
              <h2 className="border-b border-border px-5 py-4 text-sm font-semibold text-foreground">Course contents</h2>
              {modules.length === 0 ? (
                <p className="px-5 py-4 text-sm text-muted-foreground">The author has not added lessons yet.</p>
              ) : (
                <ol>
                  {modules.map((m, i) => (
                    <li key={m.id} className="border-b border-border px-5 py-4 last:border-b-0">
                      <h3 className="text-sm font-medium text-foreground">
                        {i + 1}. {m.title}
                      </h3>
                      <ul className="mt-2 space-y-1.5">
                        {m.lessons.map((l) => {
                          const Icon = KIND_ICON[l.kind];
                          return (
                            <li key={l.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Icon className="size-4 shrink-0" aria-hidden />
                              <span className="min-w-0 flex-1 truncate text-foreground/90">{l.title}</span>
                              <span className="shrink-0 text-[11px]">
                                {KIND_LABEL[l.kind]} · {formatMinutes(l.duration_min)}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
            <Card className="gap-3 p-5">
              <h2 className="text-sm font-semibold text-foreground">Skills you will practise</h2>
              <SkillTags skills={course.skills} max={12} />
              {course.lessons > 0 && <EnrolButton courseId={course.id} className="mt-2 w-full" />}
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Free for SJCEM students. Finish every lesson to get a completion record with your quiz score.
              </p>
            </Card>
          </div>
        )}

        {workshops.length > 0 && (
          <section aria-labelledby="course-workshops" className="space-y-3">
            <h2 id="course-workshops" className="text-sm font-semibold text-foreground">
              Live workshops for this course
            </h2>
            <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {workshops.map((w) => (
                <li key={w.id}>
                  <WorkshopCardView workshop={w} courseBase={BASE} />
                </li>
              ))}
            </ul>
          </section>
        )}

        {enrolment && course.skills.length > 0 && (
          <Card className="gap-2 p-5">
            <h2 className="text-sm font-semibold text-foreground">Skills in this course</h2>
            <SkillTags skills={course.skills} max={12} />
          </Card>
        )}
        {enrolment && !start && <Button render={<Link href={BASE} />}>Back to courses</Button>}
      </div>
    </DashboardShell>
  );
}
