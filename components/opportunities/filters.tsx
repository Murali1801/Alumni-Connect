'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const TYPES = [
  { value: 'all', label: 'Everything' },
  { value: 'job', label: 'Jobs' },
  { value: 'internship', label: 'Internships' },
];

export function OpportunityFilters({
  basePath,
  q,
  type,
  extra,
}: {
  basePath: string;
  q: string;
  type: string;
  extra?: React.ReactNode;
}) {
  const router = useRouter();
  const [term, setTerm] = React.useState(q);

  React.useEffect(() => setTerm(q), [q]);

  function apply(next: { q?: string; type?: string }) {
    const params = new URLSearchParams();
    const nq = next.q ?? term;
    const nt = next.type ?? type;
    if (nq) params.set('q', nq);
    if (nt !== 'all') params.set('type', nt);
    const s = params.toString();
    router.push(s ? `${basePath}?${s}` : basePath);
  }

  return (
    <Card className="gap-0 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply({});
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by title, company or location…"
            aria-label="Search opportunities"
            className="h-9 pl-9 pr-9"
          />
          {term && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setTerm('');
                apply({ q: '' });
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </form>

        <div className="flex items-center gap-1 rounded-lg bg-muted p-1">
          {TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => apply({ type: t.value })}
              aria-pressed={type === t.value}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                type === t.value ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {extra}

        {(q || type !== 'all') && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => router.push(basePath)}>
            <X className="size-4" />
            Reset
          </Button>
        )}
      </div>
    </Card>
  );
}
