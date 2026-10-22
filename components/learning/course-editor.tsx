'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDown, ArrowUp, Check, Layers, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import type { EditorLesson, EditorModule } from '@/lib/learning';
import { KIND_LABEL, formatMinutes, moveItem } from '@/lib/learning-shared';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/patterns';
import { KIND_ICON } from '@/components/learning/bits';
import { LessonDialog } from '@/components/learning/lesson-dialog';
import { errorMessage, learningApi } from '@/components/learning/api';
import { cn } from '@/lib/utils';

/**
 * Modules and lessons: add, rename, edit, reorder with up/down, delete. Each
 * change saves straight away; the page re-reads from the server afterwards so
 * counts and the publish state stay right.
 */
export function CourseEditor({ courseId, modules: initial }: { courseId: string; modules: EditorModule[] }) {
  const router = useRouter();
  const [modules, setModules] = React.useState(initial);
  const [newTitle, setNewTitle] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  // Take the server's copy whenever the page re-reads it after a change.
  const [synced, setSynced] = React.useState(initial);
  if (synced !== initial) {
    setSynced(initial);
    setModules(initial);
  }

  async function run(fn: () => Promise<void>, rollback?: EditorModule[]) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      if (rollback) setModules(rollback);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function moveModule(id: string, dir: -1 | 1) {
    const before = modules;
    const ids = moveItem(modules.map((m) => m.id), id, dir);
    setModules(ids.map((x) => modules.find((m) => m.id === x)!));
    run(() => learningApi(`/api/learning/courses/${courseId}/reorder`, 'POST', { scope: 'modules', ids }), before);
  }

  function moveLesson(moduleId: string, lessonId: string, dir: -1 | 1) {
    const before = modules;
    const mod = modules.find((m) => m.id === moduleId)!;
    const ids = moveItem(mod.lessons.map((l) => l.id), lessonId, dir);
    setModules(modules.map((m) => (m.id === moduleId ? { ...m, lessons: ids.map((x) => m.lessons.find((l) => l.id === x)!) } : m)));
    run(() => learningApi(`/api/learning/courses/${courseId}/reorder`, 'POST', { scope: 'lessons', module_id: moduleId, ids }), before);
  }

  function upsertLesson(moduleId: string, lesson: EditorLesson) {
    setModules((ms) =>
      ms.map((m) =>
        m.id !== moduleId
          ? m
          : { ...m, lessons: m.lessons.some((l) => l.id === lesson.id) ? m.lessons.map((l) => (l.id === lesson.id ? lesson : l)) : [...m.lessons, lesson] }
      )
    );
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {modules.length === 0 && (
        <EmptyState icon={Layers} title="No modules yet" description="Group lessons into modules, such as “Arrays and strings” or “Aptitude: percentages”. Add the first one below." />
      )}
      {modules.map((m, i) => (
        <ModuleCard
          key={m.id}
          index={i}
          module={m}
          isFirst={i === 0}
          isLast={i === modules.length - 1}
          busy={busy}
          onMove={(dir) => moveModule(m.id, dir)}
          onRename={(title) =>
            run(async () => {
              await learningApi(`/api/learning/modules/${m.id}`, 'PATCH', { title });
              setModules((ms) => ms.map((x) => (x.id === m.id ? { ...x, title } : x)));
            })
          }
          onDelete={() => {
            const n = m.lessons.length;
            if (!window.confirm(`Delete “${m.title}”${n ? ` and its ${n} ${n === 1 ? 'lesson' : 'lessons'}` : ''}? Learners lose their progress on them.`)) return;
            run(async () => {
              await learningApi(`/api/learning/modules/${m.id}`, 'DELETE');
              setModules((ms) => ms.filter((x) => x.id !== m.id));
            });
          }}
          onLessonSaved={(l) => upsertLesson(m.id, l)}
          onLessonMove={(lessonId, dir) => moveLesson(m.id, lessonId, dir)}
          onLessonDelete={(l) => {
            if (!window.confirm(`Delete the lesson “${l.title}”? Learners lose their progress on it.`)) return;
            run(async () => {
              await learningApi(`/api/learning/lessons/${l.id}`, 'DELETE');
              setModules((ms) => ms.map((x) => (x.id === m.id ? { ...x, lessons: x.lessons.filter((y) => y.id !== l.id) } : x)));
            });
          }}
        />
      ))}

      <Card className="gap-0 p-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            const title = newTitle.trim();
            if (!title) return;
            run(async () => {
              const r = await learningApi<{ module: EditorModule }>(`/api/learning/courses/${courseId}/modules`, 'POST', { title });
              setModules((ms) => [...ms, r.module]);
              setNewTitle('');
              toast.success('Module added. Now add its lessons.');
            });
          }}
        >
          <label htmlFor="new-module" className="sr-only">
            New module name
          </label>
          <Input id="new-module" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="New module name" maxLength={120} className="h-9" />
          <Button type="submit" disabled={busy || !newTitle.trim()} className="h-9">
            {busy ? <Loader2 className="animate-spin" /> : <Plus />}
            Add module
          </Button>
        </form>
      </Card>
    </div>
  );
}

function ModuleCard({
  index,
  module: m,
  isFirst,
  isLast,
  busy,
  onMove,
  onRename,
  onDelete,
  onLessonSaved,
  onLessonMove,
  onLessonDelete,
}: {
  index: number;
  module: EditorModule;
  isFirst: boolean;
  isLast: boolean;
  busy: boolean;
  onMove: (dir: -1 | 1) => void;
  onRename: (title: string) => void;
  onDelete: () => void;
  onLessonSaved: (l: EditorLesson) => void;
  onLessonMove: (lessonId: string, dir: -1 | 1) => void;
  onLessonDelete: (l: EditorLesson) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(m.title);
  const minutes = m.lessons.reduce((a, l) => a + l.duration_min, 0);

  return (
    <Card className="gap-0 py-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        {editing ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (title.trim() && title.trim() !== m.title) onRename(title.trim());
              setEditing(false);
            }}
          >
            <label htmlFor={`module-${m.id}`} className="sr-only">
              Module name
            </label>
            <Input id={`module-${m.id}`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus className="h-8" />
            <Button type="submit" size="icon-sm" variant="ghost" aria-label="Save module name">
              <Check />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Cancel rename"
              onClick={() => {
                setTitle(m.title);
                setEditing(false);
              }}
            >
              <X />
            </Button>
          </form>
        ) : (
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {index + 1}. {m.title}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {m.lessons.length} {m.lessons.length === 1 ? 'lesson' : 'lessons'} · {formatMinutes(minutes || 0)}
            </p>
          </div>
        )}
        {!editing && (
          <div className="flex items-center gap-0.5">
            <Button size="icon-sm" variant="ghost" aria-label={`Move ${m.title} up`} disabled={busy || isFirst} onClick={() => onMove(-1)}>
              <ArrowUp />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Move ${m.title} down`} disabled={busy || isLast} onClick={() => onMove(1)}>
              <ArrowDown />
            </Button>
            <Button size="icon-sm" variant="ghost" aria-label={`Rename ${m.title}`} onClick={() => {
                setTitle(m.title);
                setEditing(true);
              }}>
              <Pencil />
            </Button>
            <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Delete ${m.title}`} disabled={busy} onClick={onDelete}>
              <Trash2 />
            </Button>
          </div>
        )}
      </div>
      {m.lessons.length > 0 && (
        <ol>
          {m.lessons.map((l, j) => {
            const Icon = KIND_ICON[l.kind];
            return (
              <li key={l.id} className={cn('flex items-center gap-3 px-4 py-2', j > 0 && 'border-t border-border/60')}>
                <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-foreground">{l.title}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {KIND_LABEL[l.kind]} · {formatMinutes(l.duration_min)}
                    {l.kind === 'quiz' && ` · ${l.quiz.length} ${l.quiz.length === 1 ? 'question' : 'questions'}`}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <Button size="icon-sm" variant="ghost" aria-label={`Move ${l.title} up`} disabled={busy || j === 0} onClick={() => onLessonMove(l.id, -1)}>
                    <ArrowUp />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Move ${l.title} down`} disabled={busy || j === m.lessons.length - 1} onClick={() => onLessonMove(l.id, 1)}>
                    <ArrowDown />
                  </Button>
                  <LessonDialog
                    moduleId={m.id}
                    lesson={l}
                    onSaved={onLessonSaved}
                    trigger={
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${l.title}`}>
                        <Pencil />
                      </Button>
                    }
                  />
                  <Button size="icon-sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Delete ${l.title}`} disabled={busy} onClick={() => onLessonDelete(l)}>
                    <Trash2 />
                  </Button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div className={cn('px-4 py-2.5', m.lessons.length > 0 && 'border-t border-border')}>
        <LessonDialog
          moduleId={m.id}
          onSaved={onLessonSaved}
          trigger={
            <Button size="sm" variant="ghost">
              <Plus /> Add lesson
            </Button>
          }
        />
      </div>
    </Card>
  );
}
