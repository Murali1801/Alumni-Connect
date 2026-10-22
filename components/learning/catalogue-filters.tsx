'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LEVELS, LEVEL_LABEL } from '@/lib/learning-shared';

type Filters = { q: string; topic: string; level: string; skill: string };

const selectClass = 'h-9 w-full rounded-lg border border-input bg-background px-2 text-sm sm:w-auto sm:min-w-36';

/** Search by title plus topic, level and skill filters, kept in the URL. */
export function CatalogueFilters({ basePath, value, topics, skills }: { basePath: string; value: Filters; topics: string[]; skills: string[] }) {
  const router = useRouter();
  // The page keys this component on the search, so the box resets when the URL does.
  const [term, setTerm] = React.useState(value.q);

  function apply(next: Partial<Filters>) {
    const merged = { ...value, q: term, ...next };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
    const s = params.toString();
    router.push(s ? `${basePath}?${s}` : basePath);
  }

  const active = Boolean(value.q || value.topic || value.level || value.skill);

  return (
    <Card className="gap-0 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <form
          role="search"
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            apply({});
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search courses by title…"
            aria-label="Search courses by title"
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
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="sr-only" htmlFor="filter-topic">Topic</label>
          <select id="filter-topic" className={selectClass} value={value.topic} onChange={(e) => apply({ topic: e.target.value })}>
            <option value="">All topics</option>
            {topics.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filter-level">Level</label>
          <select id="filter-level" className={selectClass} value={value.level} onChange={(e) => apply({ level: e.target.value })}>
            <option value="">All levels</option>
            {LEVELS.map((l) => (
              <option key={l} value={l}>{LEVEL_LABEL[l]}</option>
            ))}
          </select>
          <label className="sr-only" htmlFor="filter-skill">Skill</label>
          <select id="filter-skill" className={selectClass} value={value.skill} onChange={(e) => apply({ skill: e.target.value })}>
            <option value="">All skills</option>
            {skills.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {active && (
            <Button
              variant="ghost"
              size="sm"
              className="h-9"
              onClick={() => {
                setTerm('');
                router.push(basePath);
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
