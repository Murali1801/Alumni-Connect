'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Users, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// The server signs in to these (app/api/auth/demo), so no password ships here.
const DEMO_ACCOUNTS = [
  { label: 'Alumnus', account: 'alumni', icon: Users },
  { label: 'Admin', account: 'admin', icon: ShieldCheck },
] as const;

/** `next`: an in-app link to return to after sign-in, already checked by safeNext. */
export function LoginForm({ next }: { next?: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // The server decides where each role lands; /auth/route reads the role and
  // redirects, so the client does not need to know the mapping.
  function goHome() {
    router.push(next ? `/auth/route?next=${encodeURIComponent(next)}` : '/auth/route');
    router.refresh();
  }

  async function signIn(withEmail: string, withPassword: string) {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: withEmail,
      password: withPassword,
    });

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    goHome();
  }

  async function signInDemo(account: (typeof DEMO_ACCOUNTS)[number]['account']) {
    setLoading(true);
    const res = await fetch('/api/auth/demo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account }),
    }).catch(() => null);
    if (!res?.ok) {
      const body = await res?.json().catch(() => null);
      toast.error(body?.error ?? 'Could not sign in to the demo account.');
      setLoading(false);
      return;
    }
    goHome();
  }

  return (
    <div className="w-full space-y-6">
      <div className="space-y-2 text-center md:text-left">
        <h1 className="font-display text-2xl tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Sign in to reach your workspace.</p>
      </div>

      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!email || !password) {
            toast.error('Enter both your email and password.');
            return;
          }
          void signIn(email, password);
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10"
            required
          />
        </div>

        <Button type="submit" className="h-10 w-full" disabled={loading}>
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">Or use a demo account</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {DEMO_ACCOUNTS.map((a) => (
          <Button
            key={a.account}
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => void signInDemo(a.account)}
            className="h-auto flex-col gap-1.5 px-2 py-3"
          >
            <a.icon className="size-4" />
            <span className="text-[11px] font-medium">{a.label}</span>
          </Button>
        ))}
      </div>

      <div className="space-y-2 border-t border-border pt-5 text-center">
        <p className="text-sm text-muted-foreground">
          New student?{' '}
          <Link href="/register" className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          Alumni do not register — use the claim link sent to your registered email. That is what
          links you to your record in the college register.
        </p>
      </div>
    </div>
  );
}
