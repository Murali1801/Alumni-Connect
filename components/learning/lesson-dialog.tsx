'use client';

import * as React from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { KIND_LABEL, LESSON_KINDS, quizProblem, videoEmbed, type LessonKind, type QuizQuestion } from '@/lib/learning-shared';
import type { EditorLesson } from '@/lib/learning';
import { errorMessage, learningApi } from '@/components/learning/api';
import { KIND_ICON } from '@/components/learning/bits';
import { cn } from '@/lib/utils';

const blankQuestion = (): QuizQuestion => ({ prompt: '', options: ['', ''], correct: 0, explanation: '' });

/** Add a lesson to a module, or edit one. */
export function LessonDialog({
  moduleId,
  lesson,
  trigger,
  onSaved,
}: {
  moduleId: string;
  lesson?: EditorLesson;
  trigger: React.ReactElement;
  onSaved: (lesson: EditorLesson) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{lesson ? 'Edit lesson' : 'New lesson'}</DialogTitle>
          <DialogDescription>Short lessons work best: one idea, five to fifteen minutes.</DialogDescription>
        </DialogHeader>
        <LessonForm
          moduleId={moduleId}
          lesson={lesson}
          onDone={(saved) => {
            onSaved(saved);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function LessonForm({ moduleId, lesson, onDone }: { moduleId: string; lesson?: EditorLesson; onDone: (l: EditorLesson) => void }) {
  const [kind, setKind] = React.useState<LessonKind>(lesson?.kind ?? 'text');
  const [title, setTitle] = React.useState(lesson?.title ?? '');
  const [body, setBody] = React.useState(lesson?.body ?? '');
  const [url, setUrl] = React.useState(lesson?.url ?? '');
  const [minutes, setMinutes] = React.useState(String(lesson?.duration_min ?? 10));
  const [quiz, setQuiz] = React.useState<QuizQuestion[]>(() =>
    lesson?.quiz?.length ? lesson.quiz.map((q) => ({ ...q, options: [...q.options], explanation: q.explanation ?? '' })) : [blankQuestion()]
  );
  const [busy, setBusy] = React.useState(false);

  const updateQ = (i: number, patch: Partial<QuizQuestion>) => setQuiz((qs) => qs.map((q, k) => (k === i ? { ...q, ...patch } : q)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === 'quiz') {
      const problem = quizProblem(quiz);
      if (problem) return toast.error(problem);
    }
    setBusy(true);
    const payload = {
      title,
      kind,
      body,
      url: kind === 'video' || kind === 'link' ? url.trim() || null : null,
      quiz: kind === 'quiz' ? quiz.map((q) => ({ ...q, options: q.options.map((o) => o.trim()) })) : [],
      duration_min: Number(minutes),
    };
    try {
      const r = lesson
        ? await learningApi<{ lesson: EditorLesson }>(`/api/learning/lessons/${lesson.id}`, 'PATCH', payload)
        : await learningApi<{ lesson: EditorLesson }>(`/api/learning/modules/${moduleId}/lessons`, 'POST', payload);
      toast.success(lesson ? 'Lesson saved.' : 'Lesson added.');
      onDone(r.lesson);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const embeddable = kind === 'video' && url ? videoEmbed(url.trim()) : null;

  return (
    <form onSubmit={submit} className="space-y-4">
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Kind</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LESSON_KINDS.map((k) => {
            const Icon = KIND_ICON[k];
            return (
              <label
                key={k}
                className={cn(
                  'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring',
                  kind === k ? 'border-primary bg-primary/10 text-foreground' : 'border-border hover:bg-muted'
                )}
              >
                <input type="radio" name="lesson-kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                <Icon className="size-4" aria-hidden />
                {KIND_LABEL[k]}
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_8rem]">
        <div className="space-y-1.5">
          <Label htmlFor="lesson-title">Title</Label>
          <Input id="lesson-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lesson-minutes">Minutes</Label>
          <Input id="lesson-minutes" type="number" min={1} max={600} value={minutes} onChange={(e) => setMinutes(e.target.value)} required />
        </div>
      </div>

      {(kind === 'video' || kind === 'link') && (
        <div className="space-y-1.5">
          <Label htmlFor="lesson-url">{kind === 'video' ? 'Video link' : 'Resource link'}</Label>
          <Input
            id="lesson-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={kind === 'video' ? 'https://www.youtube.com/watch?v=…' : 'https://…'}
            required
            aria-describedby="lesson-url-hint"
          />
          <p id="lesson-url-hint" className="text-[11px] text-muted-foreground">
            {kind === 'video'
              ? url && !embeddable
                ? 'Not a YouTube or Vimeo link, so students get a link instead of a player.'
                : 'YouTube and Vimeo links play inside the lesson, in privacy-enhanced mode.'
              : 'Opens in a new tab.'}
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="lesson-body">{kind === 'text' ? 'Lesson text' : kind === 'quiz' ? 'Intro (optional)' : 'Notes (optional)'}</Label>
        <Textarea
          id="lesson-body"
          rows={kind === 'text' ? 12 : 3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={20000}
          required={kind === 'text'}
          className="font-mono text-[13px]"
          aria-describedby="lesson-body-hint"
        />
        <p id="lesson-body-hint" className="text-[11px] text-muted-foreground">
          Plain text. Blank lines split paragraphs; “## ” starts a heading, “- ” a bullet, “1. ” a numbered step; **bold**, `code`, and ``` fences for code blocks.
        </p>
      </div>

      {kind === 'quiz' && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Questions</p>
          {quiz.map((q, i) => (
            <fieldset key={i} aria-label={`Question ${i + 1}`} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-center justify-between">
                <p aria-hidden className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Question {i + 1}</p>
                {quiz.length > 1 && (
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove question ${i + 1}`} onClick={() => setQuiz((qs) => qs.filter((_, k) => k !== i))}>
                    <Trash2 />
                  </Button>
                )}
              </div>
              <Label htmlFor={`q-${i}-prompt`} className="sr-only">
                Question {i + 1} prompt
              </Label>
              <Textarea id={`q-${i}-prompt`} rows={2} value={q.prompt} onChange={(e) => updateQ(i, { prompt: e.target.value })} placeholder="Ask one clear question" maxLength={500} />
              <div className="space-y-1.5" role="radiogroup" aria-label={`Question ${i + 1} options; choose the correct one`}>
                {q.options.map((o, j) => (
                  <div key={j} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`q-${i}-correct`}
                      checked={q.correct === j}
                      onChange={() => updateQ(i, { correct: j })}
                      aria-label={`Option ${j + 1} is correct`}
                      className="accent-[var(--success)]"
                    />
                    <Input
                      value={o}
                      onChange={(e) => updateQ(i, { options: q.options.map((x, k) => (k === j ? e.target.value : x)) })}
                      placeholder={`Option ${j + 1}`}
                      aria-label={`Question ${i + 1}, option ${j + 1}`}
                      maxLength={300}
                    />
                    {q.options.length > 2 && (
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove option ${j + 1}`}
                        onClick={() =>
                          updateQ(i, {
                            options: q.options.filter((_, k) => k !== j),
                            correct: q.correct === j ? 0 : q.correct > j ? q.correct - 1 : q.correct,
                          })
                        }
                      >
                        <X />
                      </Button>
                    )}
                  </div>
                ))}
                {q.options.length < 6 && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => updateQ(i, { options: [...q.options, ''] })}>
                    <Plus /> Option
                  </Button>
                )}
              </div>
              <Label htmlFor={`q-${i}-why`} className="text-xs text-muted-foreground">
                Explanation, shown after answering
              </Label>
              <Textarea id={`q-${i}-why`} rows={2} value={q.explanation ?? ''} onChange={(e) => updateQ(i, { explanation: e.target.value })} maxLength={1000} />
            </fieldset>
          ))}
          {quiz.length < 30 && (
            <Button type="button" size="sm" variant="outline" onClick={() => setQuiz((qs) => [...qs, blankQuestion()])}>
              <Plus /> Add question
            </Button>
          )}
        </div>
      )}

      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {lesson ? 'Save lesson' : 'Add lesson'}
        </Button>
      </DialogFooter>
    </form>
  );
}
