'use client';

import * as React from 'react';
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Circle, ExternalLink, Loader2, RotateCcw, Trophy, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { LearnerLesson, LearnerModule } from '@/lib/learning';
import { KIND_LABEL, formatMinutes, progressPercent, videoEmbed, type QuizResult } from '@/lib/learning-shared';
import { formatDate } from '@/lib/format';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { KIND_ICON, LessonText, ProgressBar } from '@/components/learning/bits';
import { errorMessage, learningApi } from '@/components/learning/api';
import { cn } from '@/lib/utils';

type Progress = { done: number; total: number; percent: number; completed_at: string | null; score: number | null };
type LessonState = { completed: boolean; quiz_score: number | null; review: QuizResult | null };

/**
 * The lesson player: the syllabus with ticks on one side, the open lesson on
 * the other. Opening a lesson records it as the resume point; reading lessons
 * are marked complete by hand, quizzes by submitting them (scored on the
 * server). The URL keeps `?lesson=` so a refresh or a shared link reopens it.
 */
export function CoursePlayer({
  courseTitle,
  modules,
  initialLessonId,
  initialCompletedAt,
  initialScore,
}: {
  courseTitle: string;
  modules: LearnerModule[];
  initialLessonId: string;
  initialCompletedAt: string | null;
  initialScore: number | null;
}) {
  const lessons = React.useMemo(() => modules.flatMap((m) => m.lessons), [modules]);
  const [current, setCurrent] = React.useState(initialLessonId);
  const [state, setState] = React.useState<Record<string, LessonState>>(() =>
    Object.fromEntries(
      lessons.map((l) => [l.id, { completed: Boolean(l.progress?.completed_at), quiz_score: l.progress?.quiz_score ?? null, review: l.review }])
    )
  );
  const [course, setCourse] = React.useState({ completed_at: initialCompletedAt, score: initialScore });
  const done = lessons.filter((l) => state[l.id]?.completed).length;
  const percent = course.completed_at ? 100 : progressPercent(lessons.length, done);
  const index = Math.max(0, lessons.findIndex((l) => l.id === current));
  const lesson = lessons[index];
  const mainRef = React.useRef<HTMLDivElement>(null);
  const first = React.useRef(true);

  // Record the open lesson as the resume point, and keep it in the URL.
  React.useEffect(() => {
    if (!lesson) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('lesson') !== lesson.id) {
      url.searchParams.set('lesson', lesson.id);
      window.history.replaceState(null, '', url);
    }
    learningApi(`/api/learning/lessons/${lesson.id}/progress`, 'POST', { action: 'view' }).catch(() => {});
    if (first.current) first.current = false;
    else mainRef.current?.focus();
  }, [lesson]);

  function applyProgress(p: Progress) {
    if (p.completed_at && !course.completed_at) {
      toast.success(`Course complete: ${courseTitle}`, { description: p.score !== null ? `Score ${p.score}%` : undefined });
    }
    setCourse({ completed_at: p.completed_at, score: p.score });
  }

  if (!lesson) return null;
  const go = (i: number) => setCurrent(lessons[Math.max(0, Math.min(lessons.length - 1, i))].id);

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="space-y-3 lg:sticky lg:top-4">
        <Card className="gap-2 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {done} of {lessons.length} lessons
            </span>
            <span className="tnum font-semibold text-foreground">{percent}%</span>
          </div>
          <ProgressBar value={percent} label="Course progress" />
          {course.completed_at && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-[var(--success)]">
              <Trophy className="size-3.5" aria-hidden />
              Completed {formatDate(course.completed_at)}
              {course.score !== null && <span className="tnum">· score {course.score}%</span>}
            </p>
          )}
        </Card>
        <Card className="gap-0 py-2">
          <nav aria-label="Course contents" className="max-h-[60vh] overflow-y-auto">
            {modules.map((m, mi) => (
              <div key={m.id} className={cn(mi > 0 && 'border-t border-border')}>
                <h2 className="px-4 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {mi + 1}. {m.title}
                </h2>
                <ul className="pb-2">
                  {m.lessons.map((l) => {
                    const s = state[l.id];
                    const active = l.id === lesson.id;
                    return (
                      <li key={l.id}>
                        <button
                          type="button"
                          onClick={() => setCurrent(l.id)}
                          aria-current={active ? 'step' : undefined}
                          className={cn(
                            'flex w-full items-start gap-2 px-4 py-1.5 text-left text-sm transition-colors hover:bg-muted',
                            active && 'bg-muted font-medium text-foreground'
                          )}
                        >
                          {s?.completed ? (
                            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-label="Completed" />
                          ) : (
                            <Circle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Not completed" />
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="line-clamp-2">{l.title}</span>
                            <span className="block text-[11px] font-normal text-muted-foreground">
                              {KIND_LABEL[l.kind]} · {formatMinutes(l.duration_min)}
                              {l.kind === 'quiz' && s?.quiz_score !== null && s?.quiz_score !== undefined && ` · best ${s.quiz_score}%`}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </Card>
      </aside>

      <div ref={mainRef} tabIndex={-1} className="min-w-0 outline-none" aria-label={`Lesson: ${lesson.title}`} role="region">
        <Card className="gap-0 py-0">
          <LessonHeader lesson={lesson} index={index} total={lessons.length} />
          <div className="px-5 py-5">
            <LessonBody
              key={lesson.id}
              lesson={lesson}
              review={state[lesson.id]?.review ?? null}
              onQuizResult={(quiz, progress) => {
                setState((prev) => ({
                  ...prev,
                  [lesson.id]: { completed: true, quiz_score: Math.max(prev[lesson.id]?.quiz_score ?? 0, quiz.score), review: quiz },
                }));
                applyProgress(progress);
              }}
            />
          </div>
          <LessonFooter
            lesson={lesson}
            completed={Boolean(state[lesson.id]?.completed)}
            hasPrev={index > 0}
            hasNext={index < lessons.length - 1}
            onPrev={() => go(index - 1)}
            onNext={() => go(index + 1)}
            onComplete={(completed, progress) => {
              setState((prev) => ({ ...prev, [lesson.id]: { ...prev[lesson.id], completed } }));
              applyProgress(progress);
              if (completed && index < lessons.length - 1) go(index + 1);
            }}
          />
        </Card>
      </div>
    </div>
  );
}

function LessonHeader({ lesson, index, total }: { lesson: LearnerLesson; index: number; total: number }) {
  const Icon = KIND_ICON[lesson.kind];
  return (
    <div className="border-b border-border px-5 py-4">
      <p className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="size-3.5" aria-hidden />
        {KIND_LABEL[lesson.kind]} · {formatMinutes(lesson.duration_min)} · Lesson {index + 1} of {total}
      </p>
      <h2 className="mt-1 text-lg font-semibold leading-snug text-foreground">{lesson.title}</h2>
    </div>
  );
}

function LessonBody({
  lesson,
  review,
  onQuizResult,
}: {
  lesson: LearnerLesson;
  review: QuizResult | null;
  onQuizResult: (quiz: QuizResult, progress: Progress) => void;
}) {
  if (lesson.kind === 'video') {
    const embed = lesson.url ? videoEmbed(lesson.url) : null;
    return (
      <div className="space-y-4">
        {embed ? (
          <div className="aspect-video overflow-hidden rounded-lg bg-muted">
            <iframe
              src={embed.src}
              title={lesson.title}
              className="size-full"
              loading="lazy"
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              referrerPolicy="strict-origin-when-cross-origin"
              allowFullScreen
            />
          </div>
        ) : lesson.url ? (
          <Button variant="outline" render={<a href={lesson.url} target="_blank" rel="noopener noreferrer" />}>
            <ExternalLink /> Watch the video
          </Button>
        ) : null}
        {lesson.body && <LessonText text={lesson.body} />}
      </div>
    );
  }
  if (lesson.kind === 'link') {
    let host = '';
    try {
      host = lesson.url ? new URL(lesson.url).hostname.replace(/^www\./, '') : '';
    } catch {
      /* shown without a host */
    }
    return (
      <div className="space-y-4">
        {lesson.body && <LessonText text={lesson.body} />}
        {lesson.url && (
          <a
            href={lesson.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm transition-colors hover:bg-muted"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium text-foreground">Open the resource</span>
              <span className="block truncate text-xs text-muted-foreground">{host}</span>
            </span>
            <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    );
  }
  if (lesson.kind === 'quiz') return <QuizRunner lesson={lesson} review={review} onResult={onQuizResult} />;
  return <LessonText text={lesson.body} />;
}

function LessonFooter({
  lesson,
  completed,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onComplete,
}: {
  lesson: LearnerLesson;
  completed: boolean;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onComplete: (completed: boolean, progress: Progress) => void;
}) {
  const [busy, setBusy] = React.useState(false);
  async function mark(done: boolean) {
    setBusy(true);
    try {
      const r = await learningApi<{ progress: Progress }>(`/api/learning/lessons/${lesson.id}/progress`, 'POST', { action: 'complete', done });
      onComplete(done, r.progress);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-3">
      <Button variant="ghost" size="sm" onClick={onPrev} disabled={!hasPrev}>
        <ArrowLeft /> Previous
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        {lesson.kind !== 'quiz' &&
          (completed ? (
            <Button variant="outline" size="sm" onClick={() => mark(false)} disabled={busy} title="Mark as not done">
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              Completed
            </Button>
          ) : (
            <Button size="sm" onClick={() => mark(true)} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Check />}
              Mark complete{hasNext ? ' and continue' : ''}
            </Button>
          ))}
        <Button variant={lesson.kind === 'quiz' && completed ? 'default' : 'ghost'} size="sm" onClick={onNext} disabled={!hasNext}>
          Next <ArrowRight />
        </Button>
      </div>
    </div>
  );
}

function QuizRunner({
  lesson,
  review,
  onResult,
}: {
  lesson: LearnerLesson;
  review: QuizResult | null;
  onResult: (quiz: QuizResult, progress: Progress) => void;
}) {
  const [answers, setAnswers] = React.useState<(number | null)[]>(() => lesson.quiz.map(() => null));
  const [result, setResult] = React.useState<QuizResult | null>(review);
  const [busy, setBusy] = React.useState(false);
  const unanswered = answers.filter((a) => a === null).length;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await learningApi<{ quiz: QuizResult; progress: Progress }>(`/api/learning/lessons/${lesson.id}/progress`, 'POST', {
        action: 'quiz',
        answers,
      });
      setResult(r.quiz);
      onResult(r.quiz, r.progress);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-5">
        {lesson.body && <LessonText text={lesson.body} />}
        <div
          className={cn(
            'flex flex-wrap items-center justify-between gap-3 rounded-lg px-4 py-3',
            result.score >= 60 ? 'bg-[color-mix(in_oklch,var(--success),transparent_88%)]' : 'bg-[color-mix(in_oklch,var(--warning),transparent_88%)]'
          )}
        >
          <p className="text-sm text-foreground">
            You scored <span className="tnum font-semibold">{result.score}%</span> ({result.correct} of {result.total} correct).
            {result.score < 60 && ' Review the explanations and try again.'}
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setAnswers(lesson.quiz.map(() => null));
              setResult(null);
            }}
          >
            <RotateCcw /> Retake
          </Button>
        </div>
        <ol className="space-y-4">
          {lesson.quiz.map((q, i) => {
            const a = result.answers[i];
            return (
              <li key={i} className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  {i + 1}. {q.prompt}
                </p>
                <ul className="space-y-1">
                  {q.options.map((o, j) => {
                    const isAnswer = a?.answer === j;
                    const isChosen = a?.chosen === j;
                    return (
                      <li
                        key={j}
                        className={cn(
                          'flex items-start gap-2 rounded-md border px-3 py-2 text-sm',
                          isAnswer
                            ? 'border-[var(--success)] text-foreground'
                            : isChosen
                              ? 'border-destructive text-foreground'
                              : 'border-border text-muted-foreground'
                        )}
                      >
                        {isAnswer ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success)]" aria-hidden />
                        ) : isChosen ? (
                          <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                        ) : (
                          <Circle className="mt-0.5 size-4 shrink-0" aria-hidden />
                        )}
                        <span>
                          {o}
                          {isAnswer && <span className="sr-only"> (correct answer)</span>}
                          {isChosen && <span className="sr-only"> (your answer)</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {a?.chosen === null && <p className="text-xs text-muted-foreground">Not answered.</p>}
                {a?.explanation && <p className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-foreground/90">{a.explanation}</p>}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {lesson.body && <LessonText text={lesson.body} />}
      {lesson.quiz.map((q, i) => (
        <fieldset key={i} className="space-y-2">
          <legend className="text-sm font-medium text-foreground">
            {i + 1}. {q.prompt}
          </legend>
          <div className="space-y-1.5">
            {q.options.map((o, j) => (
              <label
                key={j}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted',
                  answers[i] === j ? 'border-primary bg-primary/5' : 'border-border'
                )}
              >
                <input
                  type="radio"
                  name={`q-${lesson.id}-${i}`}
                  value={j}
                  checked={answers[i] === j}
                  onChange={() => setAnswers((prev) => prev.map((v, k) => (k === i ? j : v)))}
                  className="mt-0.5 accent-[var(--primary)]"
                />
                <span>{o}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || unanswered > 0}>
          {busy && <Loader2 className="animate-spin" />}
          Submit answers
        </Button>
        {unanswered > 0 && (
          <span className="text-xs text-muted-foreground">
            {unanswered} {unanswered === 1 ? 'question' : 'questions'} left
          </span>
        )}
      </div>
    </form>
  );
}
