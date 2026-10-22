'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Clock, Loader2, UserCheck, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ButtonState =
  | { state: 'none' }
  | { state: 'self' }
  | { state: 'pending_out'; id: string }
  | { state: 'pending_in'; id: string }
  | { state: 'connected'; id: string };

async function call(url: string, init: RequestInit) {
  const res = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Something went wrong');
  return body;
}

/**
 * Connect / Pending / Accept / Connected, the way LinkedIn shows it.
 * `size="sm"` suits cards; the default suits a profile header.
 */
export function ConnectButton({
  userId,
  name,
  initial,
  size = 'default',
  className,
  onChange,
}: {
  userId: string;
  name: string;
  initial: ButtonState;
  size?: 'sm' | 'default';
  className?: string;
  onChange?: (state: ButtonState['state']) => void;
}) {
  const router = useRouter();
  const [s, setS] = React.useState<ButtonState>(initial);
  const [busy, setBusy] = React.useState(false);
  const first = name.split(' ')[name.split(' ').length > 2 ? 1 : 0];

  async function run(fn: () => Promise<ButtonState>, done?: string) {
    setBusy(true);
    try {
      const next = await fn();
      setS(next);
      onChange?.(next.state);
      if (done) toast.success(done);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  const connect = () =>
    run(async () => {
      const r = await call('/api/connections', { method: 'POST', body: JSON.stringify({ user_id: userId }) });
      return { state: r.state, id: r.id };
    }, `Invitation sent to ${first}.`);
  const answer = (action: 'accept' | 'ignore') =>
    run(async () => {
      if (s.state !== 'pending_in') return s;
      const r = await call(`/api/connections/${s.id}`, { method: 'PATCH', body: JSON.stringify({ action }) });
      return r.state === 'connected' ? { state: 'connected', id: s.id } : { state: 'none' };
    }, action === 'accept' ? `You and ${first} are now connected.` : undefined);
  const withdraw = () =>
    run(async () => {
      if (s.state !== 'pending_out' && s.state !== 'connected') return s;
      await call(`/api/connections/${s.id}`, { method: 'DELETE' });
      return { state: 'none' };
    }, s.state === 'connected' ? `Removed ${first} from your connections.` : 'Invitation withdrawn.');

  const sm = size === 'sm';
  const icon = busy ? <Loader2 className="animate-spin" /> : null;

  if (s.state === 'self') return null;

  if (s.state === 'pending_in') {
    return (
      <div className={cn('flex gap-2', className)}>
        <Button size={sm ? 'sm' : 'default'} onClick={() => answer('accept')} disabled={busy}>
          {icon ?? <Check />}
          Accept
        </Button>
        <Button size={sm ? 'sm' : 'default'} variant="ghost" onClick={() => answer('ignore')} disabled={busy} aria-label="Ignore invitation">
          <X />
          {!sm && 'Ignore'}
        </Button>
      </div>
    );
  }

  if (s.state === 'pending_out') {
    return (
      <Button
        size={sm ? 'sm' : 'default'}
        variant="outline"
        className={cn('text-muted-foreground', className)}
        onClick={() => {
          if (window.confirm(`Withdraw your invitation to ${first}?`)) withdraw();
        }}
        disabled={busy}
        title="Click to withdraw"
      >
        {icon ?? <Clock />}
        Pending
      </Button>
    );
  }

  if (s.state === 'connected') {
    return (
      <Button
        size={sm ? 'sm' : 'default'}
        variant="outline"
        className={cn('group', className)}
        onClick={() => {
          if (window.confirm(`Remove ${first} from your connections?`)) withdraw();
        }}
        disabled={busy}
        title="Click to remove the connection"
      >
        {icon ?? <UserCheck />}
        Connected
      </Button>
    );
  }

  return (
    <Button size={sm ? 'sm' : 'default'} variant={sm ? 'outline' : 'default'} className={className} onClick={connect} disabled={busy}>
      {icon ?? <UserPlus />}
      Connect
    </Button>
  );
}
