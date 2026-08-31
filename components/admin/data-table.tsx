import * as React from 'react';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export type Column<T> = {
  key: string;
  header: string;
  /** Right-align and use tabular figures — for counts and money. */
  numeric?: boolean;
  className?: string;
  cell: (row: T) => React.ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  empty,
  caption,
}: {
  columns: Column<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  empty: React.ReactNode;
  caption?: string;
}) {
  if (rows.length === 0) {
    return <>{empty}</>;
  }

  return (
    <Card className="gap-0 overflow-hidden p-0">
      {/* Wide tables scroll inside the card rather than the page */}
      <div className="w-full overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c.key} className={cn(c.numeric && 'text-right', c.className)}>
                  {c.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={getRowKey(row)}>
                {columns.map((c) => (
                  <TableCell key={c.key} className={cn(c.numeric && 'tnum text-right', c.className)}>
                    {c.cell(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {caption && (
        <p className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{caption}</p>
      )}
    </Card>
  );
}
