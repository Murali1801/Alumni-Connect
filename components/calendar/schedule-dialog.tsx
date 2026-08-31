'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CalendarPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

/** `datetime-local` wants `YYYY-MM-DDTHH:mm` in local time. */
function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultSlot() {
  // Tomorrow at 18:00 local — outside class and work hours for both sides.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(18, 0, 0, 0);
  return toLocalInput(d);
}

export function ScheduleDialog({
  peerId,
  peerName,
  requestId,
  defaultTitle,
  trigger,
}: {
  peerId: string;
  peerName: string;
  requestId?: string | null;
  defaultTitle?: string;
  trigger?: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState(defaultTitle ?? `Session with ${peerName}`);
  const [when, setWhen] = React.useState(defaultSlot);
  const [duration, setDuration] = React.useState('30');
  const [agenda, setAgenda] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  async function submit() {
    setSaving(true);
    try {
      const res = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          peer_id: peerId,
          title: title.trim(),
          // The input is local time; send an absolute instant.
          scheduled_at: new Date(when).toISOString(),
          duration_min: Number(duration),
          request_id: requestId ?? null,
          agenda: agenda.trim() || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not schedule the session');

      toast.success(`Session with ${peerName} scheduled. The video room is ready.`);
      setOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  }

  const invalid = title.trim().length < 3 || !when;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          (trigger as React.ReactElement) ?? (
            <Button size="sm">
              <CalendarPlus className="size-3.5" />
              Schedule
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule a video session</DialogTitle>
          <DialogDescription>
            Both of you get a private browser-based room. No app or account needed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="session-title">Title</Label>
            <Input id="session-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="session-when">Date and time</Label>
              <Input
                id="session-when"
                type="datetime-local"
                value={when}
                min={toLocalInput(new Date())}
                onChange={(e) => setWhen(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="session-duration">Duration</Label>
              <Select value={duration} onValueChange={(v) => setDuration(String(v))}>
                <SelectTrigger id="session-duration">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['15', '30', '45', '60', '90'].map((d) => (
                    <SelectItem key={d} value={d}>
                      {d} minutes
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-agenda">Agenda (optional)</Label>
            <Textarea
              id="session-agenda"
              rows={3}
              maxLength={500}
              value={agenda}
              onChange={(e) => setAgenda(e.target.value)}
              placeholder="Resume review, then two system-design questions."
            />
            <p className="text-xs text-muted-foreground">Shown inside the room so both of you stay on track.</p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button onClick={submit} disabled={saving || invalid}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}
            {saving ? 'Scheduling…' : 'Schedule session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
