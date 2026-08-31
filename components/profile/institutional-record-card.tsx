import { Lock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Field, StatusPill, EmptyState } from '@/components/patterns';
import type { AlumniRow } from '@/lib/queries';

/**
 * The read-only half of an alumnus' identity. Kept visually distinct from the
 * editable profile so it is obvious which facts the college owns.
 */
export function InstitutionalRecordCard({ record }: { record: AlumniRow | null }) {
  if (!record) {
    return (
      <EmptyState
        icon={Lock}
        title="No institutional record linked"
        description="Your account is not yet linked to a college record. Use the claim link sent to your registered email, or contact the placement cell."
      />
    );
  }

  return (
    <Card className="gap-0 bg-muted/40 p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Lock className="size-3.5 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">Institutional record</h2>
        <StatusPill status={record.claim_status} />
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Field label="Name">{record.full_name}</Field>
        <Field label="Branch">{record.branch}</Field>
        <Field label="Batch">{record.batch_year}</Field>
        <Field label="Home city">{record.city ?? '—'}</Field>
        <Field label="First employer">{record.first_company?.name ?? '—'}</Field>
        <Field label="First CTC">{record.first_ctc_lpa ? `${record.first_ctc_lpa} LPA` : '—'}</Field>
      </dl>

      <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        Taken from the college record and not editable here — it is what makes the directory
        trustworthy. If something is wrong, raise it with the placement cell and an administrator will
        correct the source.
      </p>
    </Card>
  );
}
