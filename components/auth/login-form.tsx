'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, GraduationCap, Users, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const DEMO_ACCOUNTS = [
  { label: 'Student', email: 'student1@v3.demo.com', icon: GraduationCap },
  { label: 'Alumnus', email: 'alumni1@v3.demo.com', icon: Users },
  { label: 'Admin', email: 'admin@v3.demo.com', icon: ShieldCheck },
];

const DEMO_PASSWORD = 'password123';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

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

    // The server decides where each role lands; /auth/route reads the role and
    // redirects, so the client does not need to know the mapping.
    router.push('/auth/route');
    router.refresh();
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

      <div className="grid grid-cols-3 gap-2">
        {DEMO_ACCOUNTS.map((a) => (
          <Button
            key={a.email}
            type="button"
            variant="outline"
            disabled={loading}
            onClick={() => {
              setEmail(a.email);
              setPassword(DEMO_PASSWORD);
              void signIn(a.email, DEMO_PASSWORD);
            }}
            className="h-auto flex-col gap-1.5 px-2 py-3"
          >
            <a.icon className="size-4" />
            <span className="text-[11px] font-medium">{a.label}</span>
          </Button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Alumni: use the claim link sent to your registered email to create an account.
      </p>
    </div>
  );
}
