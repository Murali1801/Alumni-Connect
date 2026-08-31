'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function ToggleOpportunity({
  id,
  isOpen,
  link,
}: {
  id: string;
  isOpen: boolean;
  link: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch(`/api/opportunities/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_open: !isOpen }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not update the posting');
      toast.success(isOpen ? 'Posting closed.' : 'Posting reopened.');
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2">
      {link && (
        <Button
          size="sm"
          variant="outline"
          render={
            <a href={link} target="_blank" rel="noreferrer noopener">
              <ExternalLink className="size-3.5" />
              Link
            </a>
          }
        />
      )}
      <Button size="sm" variant={isOpen ? 'outline' : 'default'} onClick={toggle} disabled={busy}>
        {busy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : isOpen ? (
          <EyeOff className="size-3.5" />
        ) : (
          <Eye className="size-3.5" />
        )}
        {isOpen ? 'Close' : 'Reopen'}
      </Button>
    </div>
  );
}
