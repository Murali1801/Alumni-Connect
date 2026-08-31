'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export type FilterSelectSpec = {
  key: string;
  value: string;
  label: string;
  options: { value: string; label: string }[];
};

/**
 * Generic search-plus-selects bar for the admin tables. State lives in the URL
 * so every filtered view is linkable and server-rendered.
 */
export function TableFilters({
  basePath,
  q,
  placeholder,
  selects = [],
}: {
  basePath: string;
  q: string;
  placeholder: string;
  selects?: FilterSelectSpec[];
}) {
  const router = useRouter();
  const [term, setTerm] = React.useState(q);

  React.useEffect(() => setTerm(q), [q]);

  function apply(patch: Record<string, string>) {
    const params = new URLSearchParams();
    const nextQ = 'q' in patch ? patch.q : term;
    if (nextQ) params.set('q', nextQ);
    for (const s of selects) {
      const v = patch[s.key] ?? s.value;
      // The first option is always the "all" default and stays out of the URL.
      if (v && v !== s.options[0].value) params.set(s.key, v);
    }
    const qs = params.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  }

  const dirty = Boolean(q) || selects.some((s) => s.value !== s.options[0].value);

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
            placeholder={placeholder}
            aria-label={placeholder}
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

        <div className="flex flex-wrap items-center gap-2">
          {selects.map((s) => (
            <Select key={s.key} value={s.value} onValueChange={(v) => apply({ [s.key]: String(v) })}>
              <SelectTrigger className="h-9 min-w-[9.5rem]" aria-label={s.label}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {s.options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}

          {dirty && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => router.push(basePath)}>
              <X className="size-4" />
              Reset
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
