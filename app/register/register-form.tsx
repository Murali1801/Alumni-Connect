'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const MIN_PASSWORD = 8;

const BRANCHES = [
  { value: 'COMP', label: 'Computer Engineering (COMP)' },
  { value: 'IT', label: 'Information Technology (IT)' },
  { value: 'EXTC', label: 'Electronics & Telecommunication (EXTC)' },
  { value: 'CIVIL', label: 'Civil Engineering (CIVIL)' },
  { value: 'MECH', label: 'Mechanical Engineering (MECH)' },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 7 }, (_, i) => currentYear + i - 1);

export function RegisterForm() {
  const router = useRouter();
  const [fullName, setFullName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [branch, setBranch] = React.useState('COMP');
  const [batchYear, setBatchYear] = React.useState(String(currentYear + 1));
  const [busy, setBusy] = React.useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;
  const ready =
    fullName.trim().length >= 2 && email.includes('@') && password.length >= MIN_PASSWORD;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || busy) return;
    setBusy(true);

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          branch,
          batch_year: Number(batchYear),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not create your account');

      // The account is created already confirmed, so sign straight in.
      const { error } = await createClient().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) {
        toast.success('Account created. Please sign in.');
        router.push('/');
        return;
      }

      toast.success(`Welcome, ${fullName.trim().split(' ')[0]}.`);
      router.push('/student');
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
        <Label htmlFor="reg-name">Full name</Label>
        <Input
          id="reg-name"
          autoComplete="name"
          placeholder="Muralidhar Suresh Acharya"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="h-10"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="reg-email">Email</Label>
        <Input
          id="reg-email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-10"
          required
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="reg-branch">Branch</Label>
          <Select value={branch} onValueChange={(v) => setBranch(String(v))}>
            <SelectTrigger id="reg-branch" className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BRANCHES.map((b) => (
                <SelectItem key={b.value} value={b.value}>
                  {b.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="reg-year">Graduating year</Label>
          <Select value={batchYear} onValueChange={(v) => setBatchYear(String(v))}>
            <SelectTrigger id="reg-year" className="h-10">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="reg-password">Password</Label>
        <Input
          id="reg-password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-10"
          aria-invalid={tooShort}
          required
        />
        <p className={tooShort ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
          At least {MIN_PASSWORD} characters.
        </p>
      </div>

      <Button type="submit" className="h-10 w-full" disabled={!ready || busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
        {busy ? 'Creating your account…' : 'Create account'}
      </Button>
    </form>
  );
}
