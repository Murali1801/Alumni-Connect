'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Loader2, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorMessage, learningApi } from '@/components/learning/api';
import { WorkshopFormDialog, type WorkshopDetails } from '@/components/learning/workshop-form';

/** Edit, cancel or reinstate, and delete a workshop the viewer hosts. */
export function WorkshopHostActions({
  workshop,
  courses,
  ended,
  attendees,
}: {
  workshop: WorkshopDetails & { id: string; cancelled_at: string | null };
  courses: { id: string; title: string }[];
  ended: boolean;
  attendees: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function run(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const cancelled = Boolean(workshop.cancelled_at);
  return (
    <div className="flex flex-wrap items-center gap-1">
      {!ended && (
        <WorkshopFormDialog
          workshop={workshop}
          courses={courses}
          trigger={
            <Button size="sm" variant="ghost" aria-label={`Edit ${workshop.title}`}>
              <Pencil /> Edit
            </Button>
          }
        />
      )}
      {!ended && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (!cancelled && !window.confirm(`Cancel “${workshop.title}”? ${attendees} ${attendees === 1 ? 'person has' : 'people have'} a seat; they will see it as cancelled.`)) return;
            run(() => learningApi(`/api/learning/workshops/${workshop.id}`, 'PATCH', { cancelled: !cancelled }), cancelled ? 'Workshop reinstated.' : 'Workshop cancelled.');
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : cancelled ? <RotateCcw /> : <Ban />}
          {cancelled ? 'Reinstate' : 'Cancel'}
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive"
        disabled={busy}
        aria-label={`Delete ${workshop.title}`}
        onClick={() => {
          if (!window.confirm(`Delete “${workshop.title}” and its seat list? This cannot be undone.`)) return;
          run(() => learningApi(`/api/learning/workshops/${workshop.id}`, 'DELETE'), 'Workshop deleted.');
        }}
      >
        <Trash2 />
      </Button>
    </div>
  );
}
