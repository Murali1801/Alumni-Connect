'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Download, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/format';

/** Entry point on the alumni profile page: import, refresh or remove LinkedIn details. */
export function LinkedInImportCard({ importedAt }: { importedAt: string | null }) {
  const router = useRouter();
  const [removing, setRemoving] = React.useState(false);

  async function remove() {
    if (!window.confirm('Remove your imported experience, education, certifications, projects, links and headline?')) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/profile/alumni/linkedin', { method: 'DELETE' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'Could not remove the imported details');
      toast.success('Imported details removed.');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not remove the imported details');
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Card className="gap-0 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">
            {importedAt ? 'Imported from LinkedIn' : 'Fill this in from LinkedIn'}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {importedAt
              ? `Last imported ${formatDate(importedAt)}. Import again whenever you change roles or add skills.`
              : 'Upload your LinkedIn data export to add your experience, education, skills and links in one go. You choose what is published.'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          {importedAt && (
            <Button variant="ghost" onClick={remove} disabled={removing}>
              {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              Remove
            </Button>
          )}
          <Button render={<Link href="/alumni/profile/import" />}>
            <Download className="size-4" />
            {importedAt ? 'Import again' : 'Import from LinkedIn'}
          </Button>
        </div>
      </div>
    </Card>
  );
}
