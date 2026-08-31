'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

export default function ClaimClient({ token }: { token: string }) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=/claim/${token}/confirm`,
      },
    });

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Check your email! We sent a magic link to complete your claim.');
    }
    
    setLoading(false);
  };

  return (
    <form onSubmit={handleClaim} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="email" className="text-[var(--text-body-s)] font-medium text-ink-2">
          Enter your current email
        </label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <p className="text-[var(--text-meta)] text-ink-3">
          This will be your login email going forward.
        </p>
      </div>
      <Button type="submit" className="w-full bg-live hover:bg-live-tint hover:text-live text-white" disabled={loading}>
        {loading ? 'Sending link...' : 'Yes, this is me'}
      </Button>
    </form>
  );
}
