'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MIN_PASSWORD = 8;

export function ClaimForm({ token, name }: { token: string; name: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const mismatch = confirm.length > 0 && confirm !== password;
  const ready = email.includes('@') && password.length >= MIN_PASSWORD && confirm === password;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);

    try {
      const res = await fetch(`/api/claim/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not complete the claim');

      // The account is created and confirmed server-side, so sign straight in
      // rather than sending them back to the login page.
      const { error } = await createClient().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        toast.success('Account created. Please sign in.');
        router.push('/');
        return;
      }

      toast.success(`Welcome, ${name.split(' ')[0]}. Your profile is live.`);
      router.push('/alumni/profile');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="claim-email">Your email</Label>
        <Input
          id="claim-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10"
          required
        />
        <p className="text-xs text-muted-foreground">This becomes your sign-in email from now on.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="claim-password">Choose a password</Label>
        <Input
          id="claim-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10"
          aria-invalid={tooShort}
          required
        />
        {tooShort && (
          <p className="text-xs text-destructive">Use at least {MIN_PASSWORD} characters.</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="claim-confirm">Confirm password</Label>
        <Input
          id="claim-confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="h-10"
          aria-invalid={mismatch}
          required
        />
        {mismatch && <p className="text-xs text-destructive">The two passwords do not match.</p>}
      </div>

      <Button type="submit" className="h-10 w-full" disabled={!ready || busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
        {busy ? 'Activating…' : 'Yes, this is me — activate my account'}
      </Button>
    </form>
  );
}
