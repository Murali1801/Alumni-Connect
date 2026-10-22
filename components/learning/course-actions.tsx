'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorMessage, learningApi } from '@/components/learning/api';
import { CourseFormDialog, type CourseDetails } from '@/components/learning/course-form';

/** Publish or unpublish, edit details, delete: the editor's header buttons. */
export function CourseActions({ course, published, lessons, learners }: { course: CourseDetails & { id: string }; published: boolean; lessons: number; learners: number }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<'publish' | 'delete' | null>(null);

  async function togglePublish() {
    if (published && !window.confirm('Unpublish this course? It leaves the catalogue; students already enrolled can still finish it.')) return;
    setBusy('publish');
    try {
      await learningApi(`/api/learning/courses/${course.id}`, 'PATCH', { published: !published });
      toast.success(published ? 'Course unpublished.' : 'Course published. Students can find it in the catalogue now.');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    const who = learners ? ` ${learners} ${learners === 1 ? 'learner loses' : 'learners lose'} their progress and completion records.` : '';
    if (!window.confirm(`Delete “${course.title}” with all its modules and lessons?${who} This cannot be undone.`)) return;
    setBusy('delete');
    try {
      await learningApi(`/api/learning/courses/${course.id}`, 'DELETE');
      toast.success('Course deleted.');
      router.push('/alumni/learning');
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <CourseFormDialog
        course={course}
        trigger={
          <Button variant="outline" size="sm">
            <Pencil /> Details
          </Button>
        }
      />
      <Button
        size="sm"
        variant={published ? 'outline' : 'default'}
        onClick={togglePublish}
        disabled={busy !== null || (!published && lessons === 0)}
        title={!published && lessons === 0 ? 'Add a lesson first' : undefined}
      >
        {busy === 'publish' ? <Loader2 className="animate-spin" /> : published ? <EyeOff /> : <Eye />}
        {published ? 'Unpublish' : 'Publish'}
      </Button>
      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove} disabled={busy !== null} aria-label="Delete course">
        {busy === 'delete' ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </div>
  );
}
