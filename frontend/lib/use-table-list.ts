import { useMemo, useState, useCallback, useEffect } from 'react';

export type SortDir = 'asc' | 'desc';

/** Every paginated table starts here. 10 made even a small staff list span 7 pages. */
export const DEFAULT_TABLE_PAGE_SIZE = 25;

export const TABLE_PAGE_SIZES = [10, 25, 50, 100] as const;

export function useTableSort(initialKey: string | null = null) {
  const [sortKey, setSortKey] = useState<string | null>(initialKey);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const toggleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDir('asc');
        return key;
      }
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return key;
    });
  }, []);
  return { sortKey, sortDir, toggleSort, setSortKey };
}

export function useTableList<T>(
  rows: T[],
  query: string,
  sortKey: string | null,
  sortDir: SortDir,
  page: number,
  pageSize: number,
  getSearchText: (row: T) => string,
  getSortValue: (row: T, key: string) => string | number | null | undefined
) {
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => getSearchText(r).toLowerCase().includes(q));
  }, [rows, query, getSearchText]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    const key = sortKey;
    return [...filtered].sort((a, b) => {
      const va = getSortValue(a, key);
      const vb = getSortValue(b, key);
      const na = typeof va === 'number' && !Number.isNaN(va);
      const nb = typeof vb === 'number' && !Number.isNaN(vb);
      if (na && nb) return ((va as number) - (vb as number)) * dir;
      const sa = String(va ?? '').toLowerCase();
      const sb = String(vb ?? '').toLowerCase();
      if (sa < sb) return -1 * dir;
      if (sa > sb) return 1 * dir;
      return 0;
    });
  }, [filtered, sortKey, sortDir, getSortValue]);

  const total = sorted.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize) || 1);
  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);
  const rangeStart = total === 0 ? 0 : start + 1;
  const rangeEnd = Math.min(start + pageSize, total);

  return { pageRows, total, pageCount, safePage, rangeStart, rangeEnd };
}

export function useResetPageOnQuery(query: string, extraDeps: unknown[] = []) {
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [query, ...extraDeps]);
  return [page, setPage] as const;
}
