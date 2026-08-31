'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { cn } from '@/lib/utils';

const MIN = 20;
const MAX = 500;

export type RequestType = { value: string; label: string; existing: string | null };

export function RequestDialog({
  alumniUserId,
  alumniName,
  matchScore,
  types,
}: {
  alumniUserId: string;
  alumniName: string;
  matchScore: number;
  types: RequestType[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState(types.find((t) => t.existing !== 'pending')?.value ?? types[0].value);
  const [message, setMessage] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const selected = types.find((t) => t.value === type);
  const blocked = selected?.existing === 'pending';
  const tooShort = message.trim().length < MIN;

  async function submit() {
    setSending(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alumni_id: alumniUserId,
          type,
          message: message.trim(),
          match_score: matchScore,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not send the request');

      toast.success(`Request sent to ${alumniName}.`);
      setOpen(false);
      setMessage('');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button className="w-full">
            <Send className="size-4" />
            Send a request
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request to {alumniName}</DialogTitle>
          <DialogDescription>
            Say what you need and why you are asking them specifically. Vague messages get ignored.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>What are you asking for?</Label>
            <div className="grid grid-cols-2 gap-2">
              {types.map((t) => {
                const isPending = t.existing === 'pending';
                return (
                  <button
                    key={t.value}
                    type="button"
                    disabled={isPending}
                    onClick={() => setType(t.value)}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-left text-sm transition-colors',
                      type === t.value
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-border hover:bg-muted',
                      isPending && 'cursor-not-allowed opacity-50'
                    )}
                  >
                    <span className="font-medium">{t.label}</span>
                    {t.existing && (
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {isPending ? 'Already pending' : `Previously ${t.existing}`}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="request-message">Your message</Label>
              <span
                className={cn(
                  'tnum text-xs',
                  tooShort || message.length > MAX ? 'text-destructive' : 'text-muted-foreground'
                )}
              >
                {message.trim().length} / {MAX}
              </span>
            </div>
            <Textarea
              id="request-message"
              rows={6}
              maxLength={MAX}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Hello ${alumniName.split(' ')[0]}, I am a final-year student targeting…`}
            />
            <p className="text-xs text-muted-foreground">
              Between {MIN} and {MAX} characters. Mention your year, what you are aiming for, and the
              specific help you want.
            </p>
          </div>

          {blocked && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
              You already have a pending {selected?.label.toLowerCase()} request with {alumniName}.
              Wait for a reply before sending another.
            </p>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline">Cancel</Button>} />
          <Button onClick={submit} disabled={sending || tooShort || blocked}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            {sending ? 'Sending…' : 'Send request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
