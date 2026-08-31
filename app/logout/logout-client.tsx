'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export function LogoutClient() {
  const router = useRouter();

  useEffect(() => {
    let done = false;
    (async () => {
      await createClient().auth.signOut();
      if (done) return;
      router.replace('/login');
      router.refresh();
    })();
    return () => {
      done = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Signing you out…</p>
    </div>
  );
}
