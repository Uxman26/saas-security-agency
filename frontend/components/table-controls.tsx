'use client';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TableHead } from '@/components/ui/table';
import { TABLE_PAGE_SIZES } from '@/lib/use-table-list';
import type { SortDir } from '@/lib/use-table-list';

export function SortableHead({
  label,
  colKey,
  sortKey,
  sortDir,
  onSort,
  className,
}: {
  label: string;
  colKey: string;
  sortKey: string | null;
  sortDir: SortDir;
  onSort: (key: string) => void;
  className?: string;
}) {
  const active = sortKey === colKey;
  return (
    <TableHead className={className}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-medium text-left -ml-1 px-1 rounded-md hover:bg-accent/60 max-w-full"
        onClick={() => onSort(colKey)}
      >
        <span className="truncate">{label}</span>
        {active ? <span className="text-xs text-muted-foreground shrink-0">{sortDir === 'asc' ? '↑' : '↓'}</span> : null}
      </button>
    </TableHead>
  );
}

export function TablePaginationBar({
  safePage,
  pageCount,
  total,
  pageSize,
  rangeStart,
  rangeEnd,
  onPageChange,
  pageSizeOptions = [...TABLE_PAGE_SIZES],
  onPageSizeChange,
}: {
  safePage: number;
  pageCount: number;
  total: number;
  pageSize: number;
  rangeStart: number;
  rangeEnd: number;
  onPageChange: (p: number) => void;
  pageSizeOptions?: readonly number[];
  onPageSizeChange?: (n: number) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-border">
      <p className="text-sm text-muted-foreground tabular-nums self-center sm:self-auto">
        {total === 0 ? 'No rows' : `Showing ${rangeStart}–${rangeEnd} of ${total}`}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onPageSizeChange ? (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Rows</span>
            <Select value={String(pageSize)} onValueChange={(v) => onPageSizeChange(Number(v))}>
              <SelectTrigger className="w-[88px] h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}>
            Previous
          </Button>
          <span className="text-sm tabular-nums text-muted-foreground min-w-[4.5rem] text-center">
            {safePage} / {pageCount}
          </span>
          <Button variant="outline" size="sm" disabled={safePage >= pageCount} onClick={() => onPageChange(safePage + 1)}>
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}
