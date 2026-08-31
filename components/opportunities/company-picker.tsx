'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export type CompanyOption = { id: string; name: string };

/**
 * Typeahead over the 690 canonicalised employers, with an escape hatch to
 * create one. Search runs on the server so the whole table is never shipped to
 * the browser.
 */
export function CompanyPicker({
  value,
  onChange,
}: {
  value: CompanyOption | null;
  onChange: (c: CompanyOption | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [options, setOptions] = React.useState<CompanyOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [creating, setCreating] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/companies?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (!cancelled) setOptions(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, open]);

  const exact = options.some((o) => o.name.toLowerCase() === query.trim().toLowerCase());

  async function create() {
    const name = query.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch('/api/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'Could not add the company');
      onChange({ id: body.id, name: body.name });
      setOpen(false);
      toast.success(`Added ${body.name}.`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" className="h-8 w-full justify-between font-normal" aria-label="Choose a company">
            <span className={cn('truncate', !value && 'text-muted-foreground')}>
              {value?.name ?? 'Select a company'}
            </span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent className="w-(--anchor-width) p-0" align="start">
        <div className="relative border-b border-border">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search companies…"
            className="h-9 border-0 pl-8 focus-visible:ring-0"
          />
        </div>

        <div className="scrollbar-thin max-h-60 overflow-y-auto p-1">
          {loading ? (
            <p className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              Searching…
            </p>
          ) : options.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No matches.</p>
          ) : (
            options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <Check className={cn('size-3.5 shrink-0', value?.id === o.id ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{o.name}</span>
              </button>
            ))
          )}
        </div>

        {query.trim() && !exact && (
          <div className="border-t border-border p-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full justify-start"
              onClick={create}
              disabled={creating}
            >
              {creating ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Add “{query.trim()}”
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
