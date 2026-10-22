'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { COVERS, COVER_LABEL, LEVELS, LEVEL_LABEL, coverColor, type Cover, type Level } from '@/lib/learning-shared';
import { errorMessage, learningApi } from '@/components/learning/api';
import { cn } from '@/lib/utils';

export type CourseDetails = {
  id?: string;
  title: string;
  summary: string;
  cover: Cover;
  level: Level;
  topics: string[];
  skills: string[];
  est_hours: number;
};

const EMPTY: CourseDetails = { title: '', summary: '', cover: 'primary', level: 'beginner', topics: [], skills: [], est_hours: 4 };

/** Create a course, or edit an existing one's details. */
export function CourseFormDialog({ course, trigger }: { course?: CourseDetails; trigger: React.ReactElement }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{course?.id ? 'Course details' : 'New course'}</DialogTitle>
          <DialogDescription>
            {course?.id
              ? 'What students see in the catalogue.'
              : 'Start with the basics. You add modules and lessons next; the course stays a draft until you publish it.'}
          </DialogDescription>
        </DialogHeader>
        <CourseForm course={course} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CourseForm({ course, onDone }: { course?: CourseDetails; onDone: () => void }) {
  const router = useRouter();
  const start = course ?? EMPTY;
  const [v, setV] = React.useState({
    ...start,
    topics: start.topics.join(', '),
    skills: start.skills.join(', '),
    est_hours: String(start.est_hours),
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const body = { ...v, est_hours: Number(v.est_hours) };
    try {
      if (course?.id) {
        await learningApi(`/api/learning/courses/${course.id}`, 'PATCH', body);
        toast.success('Course details saved.');
        onDone();
        router.refresh();
      } else {
        const r = await learningApi<{ id: string }>('/api/learning/courses', 'POST', body);
        toast.success('Course created. Add your first module.');
        onDone();
        router.push(`/alumni/learning/${r.id}`);
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="course-title">Title</Label>
        <Input id="course-title" value={v.title} onChange={set('title')} maxLength={120} required placeholder="DSA for placements" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="course-summary">Summary</Label>
        <Textarea id="course-summary" rows={3} value={v.summary} onChange={set('summary')} maxLength={800} placeholder="Who it is for and what they will be able to do afterwards." />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="course-level">Level</Label>
          <select id="course-level" value={v.level} onChange={set('level')} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm">
            {LEVELS.map((l) => (
              <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="course-hours">Estimated hours</Label>
          <Input id="course-hours" type="number" min={0.5} max={500} step={0.5} value={v.est_hours} onChange={set('est_hours')} required />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="course-topics">Topics</Label>
        <Input id="course-topics" value={v.topics} onChange={set('topics')} placeholder="Placements, Programming" aria-describedby="course-topics-hint" />
        <p id="course-topics-hint" className="text-[11px] text-muted-foreground">Separate with commas. Students filter the catalogue by these.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="course-skills">Skills taught</Label>
        <Input id="course-skills" value={v.skills} onChange={set('skills')} placeholder="Data Structures, Java" />
      </div>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Cover colour</legend>
        <div className="flex flex-wrap gap-2">
          {COVERS.map((c) => (
            <label key={c} className="cursor-pointer" title={COVER_LABEL[c]}>
              <input
                type="radio"
                name="course-cover"
                value={c}
                checked={v.cover === c}
                onChange={() => setV((p) => ({ ...p, cover: c }))}
                className="peer sr-only"
              />
              <span
                className={cn(
                  'block size-8 rounded-full ring-2 ring-transparent ring-offset-2 ring-offset-background peer-checked:ring-foreground peer-focus-visible:ring-ring'
                )}
                style={{ backgroundColor: coverColor(c) }}
              />
              <span className="sr-only">{COVER_LABEL[c]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {course?.id ? 'Save details' : 'Create course'}
        </Button>
      </DialogFooter>
    </form>
  );
}
