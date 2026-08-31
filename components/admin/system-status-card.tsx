import { Database, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';

export function SystemStatusCard({
  tables,
}: {
  tables: { name: string; rows: number; note: string }[];
}) {
  return (
    <Card className="gap-0 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Database className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">Data</h2>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Live row counts, read straight from the database on every page load.
      </p>

      <dl className="space-y-2.5">
        {tables.map((t) => (
          <div key={t.name} className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <dt className="truncate font-mono text-xs text-foreground">{t.name}</dt>
              <p className="truncate text-[11px] text-muted-foreground">{t.note}</p>
            </div>
            <dd className="tnum shrink-0 text-sm font-semibold text-foreground">
              {t.rows.toLocaleString()}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 flex items-start gap-2 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
        The <span className="font-mono">contact_email</span>, <span className="font-mono">contact_mobile</span> and{' '}
        <span className="font-mono">claim_token</span> columns on{' '}
        <span className="font-mono">alumni_records</span> are never selected into any page or export —
        they exist solely to send claim invitations.
      </p>
    </Card>
  );
}
