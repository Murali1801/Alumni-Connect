'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, X, Loader2, Video, MessageSquare, Inbox } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { InitialsAvatar, StatusPill, MatchScore, EmptyState } from '@/components/patterns';
import { ScheduleDialog } from '@/components/calendar/schedule-dialog';
import { formatDate, formatDayMonth } from '@/lib/format';

export type RequestView = {
  id: string;
  type: string;
  status: 'pending' | 'accepted' | 'declined' | 'closed';
  message: string;
  match_score: number | null;
  response_note: string | null;
  created_at: string;
  responded_at: string | null;
  counterpart: { id: string; name: string } | null;
};

const TABS = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'closed', label: 'Closed' },
] as const;

export function RequestList({
  requests,
  viewerRole,
  emptyTitle,
  emptyBody,
  emptyAction,
}: {
  requests: RequestView[];
  viewerRole: 'student' | 'alumni';
  emptyTitle: string;
  emptyBody: string;
  emptyAction?: React.ReactNode;
}) {
  const [tab, setTab] = React.useState<string>('all');
  const visible = tab === 'all' ? requests : requests.filter((r) => r.status === tab);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = { all: requests.length };
    for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [requests]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            aria-pressed={tab === t.value}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              tab === t.value
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {t.label}
            <span className="tnum ml-1.5 text-xs opacity-70">{counts[t.value] ?? 0}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={tab === 'all' ? emptyTitle : `No ${tab} requests`}
          description={tab === 'all' ? emptyBody : 'Switch tabs to see the rest.'}
          action={tab === 'all' ? emptyAction : undefined}
        />
      ) : (
        <div className="space-y-3">
          {visible.map((r) => (
            <RequestCard key={r.id} request={r} viewerRole={viewerRole} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequestCard({ request, viewerRole }: { request: RequestView; viewerRole: 'student' | 'alumni' }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const [note, setNote] = React.useState('');

  async function respond(status: 'accepted' | 'declined' | 'closed', responseNote?: string) {
    setBusy(status);
    try {
      const res = await fetch(`/api/requests/${request.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, response_note: responseNote }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not update the request');
      toast.success(
        status === 'accepted'
          ? 'Accepted. You can now schedule a video session.'
          : status === 'declined'
            ? 'Request declined.'
            : 'Request closed.'
      );
      setDeclineOpen(false);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(null);
    }
  }

  const name = request.counterpart?.name ?? (viewerRole === 'student' ? 'Alumnus' : 'Student');

  return (
    <Card className="gap-0 p-5">
      <div className="flex flex-wrap items-start gap-3">
        <InitialsAvatar name={name} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{name}</h3>
            <StatusPill status={request.status} />
            <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium capitalize text-muted-foreground">
              {request.type.replace('_', ' ')}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sent{' '}
            {formatDate(request.created_at)}
            {request.responded_at
              ? ` · answered ${formatDayMonth(request.responded_at)}`
              : ''}
          </p>
        </div>
        {request.match_score !== null && (
          <div className="flex flex-col items-center gap-1">
            <MatchScore score={request.match_score} size={40} />
            <span className="text-[10px] text-muted-foreground">match</span>
          </div>
        )}
      </div>

      <blockquote className="mt-4 rounded-lg border-l-2 border-primary/40 bg-muted/60 px-3.5 py-3 text-sm leading-relaxed text-foreground">
        {request.message}
      </blockquote>

      {request.response_note && (
        <div className="mt-3 flex gap-2.5 rounded-lg bg-card px-3.5 py-3 ring-1 ring-border">
          <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {viewerRole === 'student' ? 'Their reply' : 'Your reply'}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-foreground">{request.response_note}</p>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {viewerRole === 'alumni' && request.status === 'pending' && (
          <>
            <Button size="sm" onClick={() => respond('accepted')} disabled={busy !== null}>
              {busy === 'accepted' ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeclineOpen(true)} disabled={busy !== null}>
              <X className="size-3.5" />
              Decline
            </Button>
          </>
        )}

        {request.status === 'accepted' && request.counterpart && (
          <>
            <ScheduleDialog
              peerId={request.counterpart.id}
              peerName={request.counterpart.name}
              requestId={request.id}
              defaultTitle={`${request.type.replace('_', ' ')} with ${request.counterpart.name}`}
              trigger={
                <Button size="sm">
                  <Video className="size-3.5" />
                  Schedule a video session
                </Button>
              }
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => respond('closed')}
              disabled={busy !== null}
            >
              {busy === 'closed' ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Mark as done
            </Button>
          </>
        )}

        {viewerRole === 'student' && request.status === 'declined' && (
          <Button size="sm" variant="outline" render={<Link href="/student/directory" />}>
            Find another alumnus
          </Button>
        )}
      </div>

      {/* Decline with a reason — a bare rejection helps nobody */}
      <Dialog open={declineOpen} onOpenChange={setDeclineOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Decline this request</DialogTitle>
            <DialogDescription>
              A one-line reason helps the student aim their next request better. Optional, but kind.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="decline-note">Reason (optional)</Label>
            <Textarea
              id="decline-note"
              rows={3}
              maxLength={300}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="I am stretched thin this quarter — try again after March."
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Cancel</Button>} />
            <Button
              variant="destructive"
              onClick={() => respond('declined', note.trim() || undefined)}
              disabled={busy !== null}
            >
              {busy === 'declined' ? <Loader2 className="size-4 animate-spin" /> : null}
              Decline request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
