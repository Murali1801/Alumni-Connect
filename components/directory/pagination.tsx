import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Page window around the current page — always 5 slots where possible. */
function windowed(page: number, pageCount: number) {
  const span = 5;
  let start = Math.max(1, page - Math.floor(span / 2));
  const end = Math.min(pageCount, start + span - 1);
  start = Math.max(1, end - span + 1);
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

export function Pagination({
  basePath,
  page,
  pageCount,
  total,
  params,
}: {
  basePath: string;
  page: number;
  pageCount: number;
  total: number;
  params: Record<string, string | string[] | undefined>;
}) {
  if (pageCount <= 1) {
    return total > 0 ? (
      <p className="text-center text-xs text-muted-foreground">
        Showing all {total.toLocaleString()} results
      </p>
    ) : null;
  }

  const href = (p: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (k === 'page') continue;
      const val = Array.isArray(v) ? v[0] : v;
      if (val) qs.set(k, val);
    }
    if (p > 1) qs.set('page', String(p));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  return (
    <nav className="flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label="Pagination">
      <p className="tnum text-xs text-muted-foreground">
        Page {page} of {pageCount} · {total.toLocaleString()} results
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          className="size-9"
          disabled={page <= 1}
          aria-label="Previous page"
          render={page > 1 ? <Link href={href(page - 1)} /> : undefined}
        >
          <ChevronLeft className="size-4" />
        </Button>

        {windowed(page, pageCount).map((p) => (
          <Button
            key={p}
            variant={p === page ? 'default' : 'outline'}
            size="icon"
            className="tnum size-9"
            aria-current={p === page ? 'page' : undefined}
            render={<Link href={href(p)} />}
          >
            {p}
          </Button>
        ))}

        <Button
          variant="outline"
          size="icon"
          className="size-9"
          disabled={page >= pageCount}
          aria-label="Next page"
          render={page < pageCount ? <Link href={href(page + 1)} /> : undefined}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
