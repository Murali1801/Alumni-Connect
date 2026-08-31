'use client';

import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function ExportCard({
  dataset,
  label,
  body,
  icon,
}: {
  dataset: string;
  label: string;
  body: string;
  icon: React.ReactNode;
}) {
  const [busy, setBusy] = React.useState(false);

  async function download() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/export?dataset=${encodeURIComponent(dataset)}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? 'Export failed');
      }

      // Read the filename the server chose rather than inventing one here.
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `${dataset}.csv`;

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast.success(`${label} exported.`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="gap-0 p-5">
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-foreground">{label}</h3>
      <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">{body}</p>
      <Button size="sm" variant="outline" className="mt-4 w-full" onClick={download} disabled={busy}>
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
        {busy ? 'Preparing…' : 'Download CSV'}
      </Button>
    </Card>
  );
}
