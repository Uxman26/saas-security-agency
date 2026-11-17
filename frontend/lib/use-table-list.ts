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

  /** All rows matching the search, in display order (every page). */
  const filteredRows = sorted;
  return { pageRows, filteredRows, total, pageCount, safePage, rangeStart, rangeEnd };
}

type RowId = string | number;

/** How long a just-created record is waited for before the scroll is abandoned. */
const FOCUS_WAIT_MS = 15_000;
/** How long the landed-on row stays highlighted. */
const FOCUS_HIGHLIGHT_MS = 3_000;

/**
 * Brings a just-created record into view. Call `focusRows(ids)` after a create; once
 * any of those ids shows up in `rows` (the sorted, filtered list — every page), the
 * table jumps to the page holding the first of them, scrolls that row to the middle of
 * the screen and briefly highlights it. Rows opt in with `data-row-id={id}`.
 *
 * Waiting on `rows` rather than scrolling straight away matters: the list refetches
 * after a create, so the new record is usually not there yet when the mutation resolves.
 */
export function useScrollToNewRow<T>(
  rows: T[],
  getId: (row: T) => RowId,
  pageSize: number,
  setPage: (page: number) => void
) {
  const [pending, setPending] = useState<Set<string> | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [highlighted, setHighlighted] = useState<Set<string>>(() => new Set());

  const focusRows = useCallback((ids: RowId | RowId[]) => {
    const list = (Array.isArray(ids) ? ids : [ids]).map(String);
    if (list.length) setPending(new Set(list));
  }, []);

  // Give up quietly if the record never appears (a search or filter is hiding it), so a
  // stale request cannot yank the page around later.
  useEffect(() => {
    if (!pending) return;
    const t = window.setTimeout(() => setPending(null), FOCUS_WAIT_MS);
    return () => window.clearTimeout(t);
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    const idx = rows.findIndex((r) => pending.has(String(getId(r))));
    if (idx < 0) return;
    setPage(Math.floor(idx / pageSize) + 1);
    setTarget(String(getId(rows[idx])));
    setHighlighted(pending);
    setPending(null);
  }, [rows, pending, getId, pageSize, setPage]);

  // Runs after the page change has rendered, so the row is in the DOM.
  useEffect(() => {
    if (!target) return;
    let tries = 0;
    let raf = 0;
    const scroll = () => {
      const el = document.querySelector(`[data-row-id="${CSS.escape(target)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTarget(null);
      } else if (tries++ < 20) {
        raf = requestAnimationFrame(scroll);
      } else {
        setTarget(null);
      }
    };
    raf = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  useEffect(() => {
    if (!highlighted.size) return;
    const t = window.setTimeout(() => setHighlighted(new Set()), FOCUS_HIGHLIGHT_MS);
    return () => window.clearTimeout(t);
  }, [highlighted]);

  const isHighlighted = useCallback((id: RowId) => highlighted.has(String(id)), [highlighted]);

  return { focusRows, isHighlighted };
}

/** Highlight for a row just brought into view by useScrollToNewRow. */
export const NEW_ROW_HIGHLIGHT_CLASS = 'bg-primary/10 ring-1 ring-inset ring-primary/40 transition-colors';

export function useResetPageOnQuery(query: string, extraDeps: unknown[] = []) {
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [query, ...extraDeps]);
  return [page, setPage] as const;
}
