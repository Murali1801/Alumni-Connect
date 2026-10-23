'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, Check, DoorOpen, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { candidateCanJoin, type CandidateResponse, type RoundStatus } from '@/lib/interview-logic';

/**
 * Accept a round, ask for another time, or join once it opens. Whether it is
 * open is rechecked every half minute, so a page left open lights up on time.
 */
export function CandidateRoundActions({
  interviewId,
  round,
  initiallyOpen,
}: {
  interviewId: string;
  round: { id: string; status: RoundStatus; scheduled_at: string; duration_min: number; candidate_response: CandidateResponse; kind: string };
  initiallyOpen: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(initiallyOpen);
  const [busy, setBusy] = React.useState(false);
  const [asking, setAsking] = React.useState(false);
  const [note, setNote] = React.useState('');

  React.useEffect(() => {
    const check = () => setOpen(candidateCanJoin(round));
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [round]);

  async function respond(response: 'accepted' | 'reschedule_requested') {
    setBusy(true);
    try {
      const res = await fetch(`/api/interviews/${interviewId}/rounds/${round.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response, note: response === 'reschedule_requested' ? note.trim() : undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not save your answer.');
      toast.success(response === 'accepted' ? 'Accepted. See you then.' : 'Request sent. You will be told when it is rescheduled.');
      setAsking(false);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const live = round.status === 'scheduled' || round.status === 'in_progress';
  if (!live) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {open ? (
        <Button size="sm" render={<Link href={`/student/interviews/${interviewId}/rounds/${round.id}`} />}>
          <DoorOpen className="size-3.5" />
          {round.kind === 'video' ? 'Join the call' : 'Start the round'}
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">Opens ten minutes before the start.</span>
      )}
      {round.status === 'scheduled' && round.candidate_response !== 'accepted' && (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void respond('accepted')}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
          Accept
        </Button>
      )}
      {round.status === 'scheduled' && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setAsking(true)}>
          <CalendarClock className="size-3.5" />
          {round.candidate_response === 'reschedule_requested' ? 'Update reschedule request' : 'Ask for another time'}
        </Button>
      )}

      <Dialog open={asking} onOpenChange={setAsking}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ask for another time</DialogTitle>
            <DialogDescription>Say when you can make it. Your interviewer picks the new time.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${round.id}-note`}>Times that work for you</Label>
            <Textarea
              id={`${round.id}-note`}
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="I have an exam that morning. Any time after 2 pm on Thursday or Friday works."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAsking(false)}>
              Close
            </Button>
            <Button disabled={!note.trim() || busy} onClick={() => void respond('reschedule_requested')}>
              {busy && <Loader2 className="size-3.5 animate-spin" />}
              Send request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
