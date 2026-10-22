'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, Loader2, LogOut } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { errorMessage, learningApi } from '@/components/learning/api';

/** Enrol in a course, then open its first lesson. */
export function EnrolButton({ courseId, className }: { courseId: string; className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      className={className}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await learningApi(`/api/learning/courses/${courseId}/enrol`, 'POST');
          toast.success('Enrolled. Your progress saves as you go.');
          router.refresh();
        } catch (err) {
          toast.error(errorMessage(err));
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <GraduationCap />}
      Enrol for free
    </Button>
  );
}

/** Leave a course; progress and any completion record go with it. */
export function LeaveCourseButton({ courseId, title }: { courseId: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      className="text-muted-foreground"
      disabled={busy}
      onClick={async () => {
        if (!window.confirm(`Leave “${title}”? Your progress in this course will be deleted.`)) return;
        setBusy(true);
        try {
          await learningApi(`/api/learning/courses/${courseId}/enrol`, 'DELETE');
          toast.success('You left the course.');
          router.push('/student/learning?tab=mine');
          router.refresh();
        } catch (err) {
          toast.error(errorMessage(err));
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : <LogOut />}
      Leave course
    </Button>
  );
}
