import Link from 'next/link';
import { CheckCircle2, Clock, Layers, Users } from 'lucide-react';
import type { CourseCard } from '@/lib/learning';
import { LEVEL_LABEL } from '@/lib/learning-shared';
import { formatDate, formatNumber } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MemberAvatar } from '@/components/patterns';
import { CourseCover, ProgressBar } from '@/components/learning/bits';

/** A course in the catalogue or in My learning. */
export function CourseCardView({ course, href, resume }: { course: CourseCard; href: string; resume?: { title: string } | null }) {
  const mine = course.mine;
  return (
    <Card className="h-full gap-0 py-0 transition-shadow hover:shadow-card">
      <Link href={href} className="flex h-full flex-col focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CourseCover cover={course.cover} className="h-20" />
        <div className="flex flex-1 flex-col gap-2 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary" className="font-normal">
              {LEVEL_LABEL[course.level]}
            </Badge>
            {course.topics.slice(0, 2).map((t) => (
              <Badge key={t} variant="outline" className="font-normal text-muted-foreground">
                {t}
              </Badge>
            ))}
          </div>
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">{course.title}</h3>
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">{course.summary}</p>
          {course.author && (
            <div className="mt-1 flex items-center gap-2">
              <MemberAvatar name={course.author.full_name} url={course.author.avatar_url} size="sm" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{course.author.full_name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{course.author.headline}</p>
              </div>
            </div>
          )}
          <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Layers className="size-3.5" aria-hidden /> {course.modules} modules · {course.lessons} lessons
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden /> {course.est_hours} h
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" aria-hidden /> {formatNumber(course.learners)}
            </span>
          </div>
          {mine && (
            <div className="space-y-1.5 border-t border-border pt-3">
              {mine.completed_at ? (
                <p className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--success)]">
                  <CheckCircle2 className="size-3.5" aria-hidden />
                  Completed {formatDate(mine.completed_at)}
                  {mine.score !== null && <span className="tnum text-muted-foreground">· {mine.score}%</span>}
                </p>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{resume ? `Next: ${resume.title}` : 'In progress'}</span>
                    <span className="tnum font-medium text-foreground">{mine.percent}%</span>
                  </div>
                  <ProgressBar value={mine.percent} label={`${course.title} progress`} />
                </>
              )}
            </div>
          )}
        </div>
      </Link>
    </Card>
  );
}
