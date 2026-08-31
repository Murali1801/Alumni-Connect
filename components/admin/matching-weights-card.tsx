import { Scale } from 'lucide-react';
import { Card } from '@/components/ui/card';

/**
 * The weights are compile-time constants in `lib/matching.ts`, not settings.
 * Showing them here — rather than pretending they are editable — is the honest
 * design: an administrator can see exactly how every score is produced.
 */
const WEIGHTS = [
  { label: 'Company', weight: 35, detail: 'Student’s target company against the alumnus’ current or first employer.' },
  { label: 'Role', weight: 25, detail: 'Token overlap between the target role and the alumnus’ designation and industry.' },
  { label: 'Skills', weight: 20, detail: 'Jaccard overlap of the two skill lists, case-normalised.' },
  { label: 'Availability', weight: 15, detail: 'Whether the alumnus has switched on the request type being scored.' },
  { label: 'Location', weight: 5, detail: 'Exact match between the student’s preferred location and the alumnus’ location.' },
];

export function MatchingWeightsCard() {
  return (
    <Card className="gap-0 p-5">
      <div className="mb-1 flex items-center gap-2">
        <Scale className="size-4 text-muted-foreground" />
        <h2 className="text-base font-semibold text-foreground">Matching weights</h2>
      </div>
      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        How every match score on the network is composed. These are fixed in code so a score means the
        same thing today as it did last term — changing them silently would invalidate the frozen
        scores stored on past requests.
      </p>

      <ul className="space-y-3">
        {WEIGHTS.map((w) => (
          <li key={w.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium text-foreground">{w.label}</span>
              <span className="tnum text-sm text-muted-foreground">{w.weight}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${w.weight}%` }} />
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{w.detail}</p>
          </li>
        ))}
      </ul>

      <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        Records with no claimed profile cannot be scored on these signals. They fall back to branch and
        batch proximity and are capped at 40, so a dormant record can never outrank a live one.
      </p>
    </Card>
  );
}
