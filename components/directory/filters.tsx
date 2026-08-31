'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, SlidersHorizontal, X } from 'lucide-react';
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

export type DirectoryFilterState = {
  q: string;
  branch: string;
  batch: string;
  availability: string;
  status: string;
  sort: string;
};

const AVAILABILITY = [
  { value: 'all', label: 'Any availability' },
  { value: 'mentorship', label: 'Mentorship' },
  { value: 'mock_interview', label: 'Mock interviews' },
  { value: 'referral', label: 'Referrals' },
  { value: 'internship', label: 'Internships' },
];

const STATUS = [
  { value: 'claimed', label: 'Claimed profiles' },
  { value: 'any', label: 'All records' },
  { value: 'unclaimed', label: 'Dormant records' },
];

const SORT = [
  { value: 'match', label: 'Best match' },
  { value: 'recent', label: 'Recently claimed' },
  { value: 'batch', label: 'Newest batch' },
  { value: 'name', label: 'Name A–Z' },
];

/**
 * Filters live in the URL rather than component state so a filtered directory
 * can be linked, refreshed and rendered on the server without a loading flash.
 */
export function DirectoryFilters({
  basePath,
  branches,
  batches,
  current,
}: {
  basePath: string;
  branches: string[];
  batches: number[];
  current: DirectoryFilterState;
}) {
  const router = useRouter();
  const [q, setQ] = React.useState(current.q);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => setQ(current.q), [current.q]);

  const apply = React.useCallback(
    (patch: Partial<DirectoryFilterState>) => {
      const next = { ...current, ...patch };
      const params = new URLSearchParams();
      if (next.q) params.set('q', next.q);
      if (next.branch !== 'all') params.set('branch', next.branch);
      if (next.batch !== 'all') params.set('batch', next.batch);
      if (next.availability !== 'all') params.set('availability', next.availability);
      if (next.status !== 'claimed') params.set('status', next.status);
      if (next.sort !== 'match') params.set('sort', next.sort);
      // Any filter change invalidates the current page number.
      const qs = params.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath);
    },
    [basePath, current, router]
  );

  const activeCount =
    (current.branch !== 'all' ? 1 : 0) +
    (current.batch !== 'all' ? 1 : 0) +
    (current.availability !== 'all' ? 1 : 0) +
    (current.status !== 'claimed' ? 1 : 0);

  return (
    <Card className="gap-0 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ q });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search alumni by name…"
            aria-label="Search alumni by name"
            className="h-9 pl-9 pr-9"
          />
          {q && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQ('');
                apply({ q: '' });
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 lg:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            <SlidersHorizontal className="size-4" />
            Filters
            {activeCount > 0 && (
              <span className="tnum ml-1 rounded bg-primary/15 px-1.5 text-[11px] text-primary">
                {activeCount}
              </span>
            )}
          </Button>

          <div className={`${open ? 'flex' : 'hidden'} w-full flex-wrap gap-2 lg:flex lg:w-auto`}>
            <FilterSelect
              label="Branch"
              value={current.branch}
              onChange={(v) => apply({ branch: v })}
              options={[{ value: 'all', label: 'All branches' }, ...branches.map((b) => ({ value: b, label: b }))]}
            />
            <FilterSelect
              label="Batch"
              value={current.batch}
              onChange={(v) => apply({ batch: v })}
              options={[
                { value: 'all', label: 'All batches' },
                ...batches.map((b) => ({ value: String(b), label: String(b) })),
              ]}
            />
            <FilterSelect
              label="Availability"
              value={current.availability}
              onChange={(v) => apply({ availability: v })}
              options={AVAILABILITY}
            />
            <FilterSelect
              label="Records"
              value={current.status}
              onChange={(v) => apply({ status: v })}
              options={STATUS}
            />
            <FilterSelect label="Sort" value={current.sort} onChange={(v) => apply({ sort: v })} options={SORT} />

            {(activeCount > 0 || current.q || current.sort !== 'match') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-9"
                onClick={() => router.push(basePath)}
              >
                <X className="size-4" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(String(v))}>
      <SelectTrigger className="h-9 min-w-[9.5rem]" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
