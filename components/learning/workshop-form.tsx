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
import { errorMessage, learningApi } from '@/components/learning/api';

export type WorkshopDetails = {
  id?: string;
  title: string;
  description: string;
  starts_at: string;
  duration_min: number;
  capacity: number;
  location: string;
  room_path: string | null;
  topics: string[];
  course_id: string | null;
};

/** ISO time to the `datetime-local` value in the browser's zone. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Schedule a workshop, or edit one. */
export function WorkshopFormDialog({
  workshop,
  courses,
  trigger,
}: {
  workshop?: WorkshopDetails;
  courses: { id: string; title: string }[];
  trigger: React.ReactElement;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{workshop?.id ? 'Edit workshop' : 'Schedule a workshop'}</DialogTitle>
          <DialogDescription>A live session students reserve a seat for. Times are in your local time.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the default time is computed in the browser. */}
        <WorkshopForm workshop={workshop} courses={courses} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function WorkshopForm({ workshop, courses, onDone }: { workshop?: WorkshopDetails; courses: { id: string; title: string }[]; onDone: () => void }) {
  const router = useRouter();
  const [v, setV] = React.useState(() => {
    const nextWeek = new Date(Date.now() + 7 * 86_400_000);
    nextWeek.setHours(18, 0, 0, 0);
    return {
      title: workshop?.title ?? '',
      description: workshop?.description ?? '',
      starts_at: toLocalInput(workshop?.starts_at ?? nextWeek.toISOString()),
      duration_min: String(workshop?.duration_min ?? 60),
      capacity: String(workshop?.capacity ?? 50),
      location: workshop?.location ?? 'Online',
      room_path: workshop?.room_path ?? '',
      topics: (workshop?.topics ?? []).join(', '),
      course_id: workshop?.course_id ?? '',
    };
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setV((p) => ({ ...p, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const when = new Date(v.starts_at);
    if (Number.isNaN(when.getTime())) return toast.error('Pick a date and time.');
    setBusy(true);
    const body = {
      ...v,
      starts_at: when.toISOString(),
      duration_min: Number(v.duration_min),
      capacity: Number(v.capacity),
      room_path: v.room_path.trim() || null,
      course_id: v.course_id || null,
    };
    try {
      if (workshop?.id) await learningApi(`/api/learning/workshops/${workshop.id}`, 'PATCH', body);
      else await learningApi('/api/learning/workshops', 'POST', body);
      toast.success(workshop?.id ? 'Workshop updated.' : 'Workshop scheduled.');
      onDone();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ws-title">Title</Label>
        <Input id="ws-title" value={v.title} onChange={set('title')} maxLength={120} required placeholder="Live mock interview: DSA round" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ws-desc">What happens in the session</Label>
        <Textarea id="ws-desc" rows={3} value={v.description} onChange={set('description')} maxLength={2000} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="space-y-1.5 sm:col-span-3">
          <Label htmlFor="ws-start">Starts</Label>
          <Input id="ws-start" type="datetime-local" value={v.starts_at} onChange={set('starts_at')} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-duration">Minutes</Label>
          <Input id="ws-duration" type="number" min={15} max={480} step={15} value={v.duration_min} onChange={set('duration_min')} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-capacity">Seats</Label>
          <Input id="ws-capacity" type="number" min={1} max={1000} value={v.capacity} onChange={set('capacity')} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-location">Where</Label>
          <Input id="ws-location" value={v.location} onChange={set('location')} maxLength={120} placeholder="Online" />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ws-room">Room link (optional)</Label>
        <Input id="ws-room" value={v.room_path} onChange={set('room_path')} placeholder="/call/room-id or https://…" aria-describedby="ws-room-hint" />
        <p id="ws-room-hint" className="text-[11px] text-muted-foreground">Shown only to students with a seat.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ws-topics">Topics</Label>
          <Input id="ws-topics" value={v.topics} onChange={set('topics')} placeholder="Placements, DSA" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-course">Linked course</Label>
          <select id="ws-course" value={v.course_id} onChange={set('course_id')} className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm">
            <option value="">None</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>
        </div>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={busy}>
          {busy && <Loader2 className="animate-spin" />}
          {workshop?.id ? 'Save workshop' : 'Schedule'}
        </Button>
      </DialogFooter>
    </form>
  );
}
