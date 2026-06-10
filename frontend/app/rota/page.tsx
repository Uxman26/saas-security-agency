'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, type SortDir } from '@/lib/use-table-list';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { RotaPlanListItem } from '@/lib/types';
import { Calendar, CalendarDays, ChevronDown, ChevronUp, Copy, Grid3x3, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'active' | 'old';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isActiveRota(r: RotaPlanListItem) {
  return r.end_date >= todayKey();
}

function fmtShort(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function fmtRange(start: string, end: string) {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  const a = s.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const b = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${e.getDate()} ${e.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}`;
  }
  return `${a} – ${b}`;
}

function overlapsRange(r: RotaPlanListItem, from: string, to: string) {
  if (!from && !to) return true;
  const start = from || '0001-01-01';
  const end = to || '9999-12-31';
  return r.start_date <= end && r.end_date >= start;
}

function RotaRow({
  r,
  deletingId,
  onDelete,
}: {
  r: RotaPlanListItem;
  deletingId: number | null;
  onDelete: (id: number, name: string) => void;
}) {
  const published = r.status === 'published';
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-4 px-4 border-b last:border-b-0 hover:bg-muted/30">
      <div className="sm:w-28 shrink-0">
        <div className="text-sm font-semibold">{fmtShort(r.start_date)}</div>
        <div className="text-[11px] text-muted-foreground capitalize">{published ? 'Published' : 'Draft'}</div>
      </div>
      <div className="min-w-0 flex-1">
        <Link href={`/rota/calendar?id=${r.id}`} className="text-sm font-medium text-sky-600 hover:underline">
          {fmtRange(r.start_date, r.end_date)}
        </Link>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{r.name}</p>
        <p className="text-xs text-muted-foreground mt-1">
          {r.day_count} days · {r.staff_count} staff · {r.shift_count} shifts
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0 sm:ml-auto">
        <Button variant="ghost" size="icon" className="size-8" asChild title="Copy to new rota">
          <Link href={`/rota/create?from=${r.id}`}>
            <Copy className="size-4" />
          </Link>
        </Button>
        <Button variant="ghost" size="icon" className="size-8" asChild title="Open planner">
          <Link href={`/rota/calendar?id=${r.id}`}>
            <Pencil className="size-4" />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:text-destructive"
          disabled={deletingId === r.id}
          onClick={() => onDelete(r.id, r.name)}
          title="Delete"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

function RotaSection({
  title,
  hint,
  items,
  expanded,
  onToggle,
  deletingId,
  onDelete,
  empty,
}: {
  title: string;
  hint?: string;
  items: RotaPlanListItem[];
  expanded: boolean;
  onToggle: () => void;
  deletingId: number | null;
  onDelete: (id: number, name: string) => void;
  empty: string;
}) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 px-4 py-3 bg-muted/40 hover:bg-muted/60 text-left"
        onClick={onToggle}
      >
        <span className="font-medium text-sm">
          {title} <span className="text-muted-foreground font-normal">({items.length})</span>
        </span>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {expanded ? 'Show less' : 'Show more'}
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </span>
      </button>
      {hint ? <p className="px-4 py-2 text-xs text-muted-foreground border-b bg-muted/20">{hint}</p> : null}
      {expanded ? (
        items.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground text-center">{empty}</p>
        ) : (
          <div>
            {items.map((r) => (
              <RotaRow key={r.id} r={r} deletingId={deletingId} onDelete={onDelete} />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

export default function RotaHubPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'old' ? 'old' : 'active';

  const [tab, setTab] = useState<Tab>(initialTab);
  const [rotas, setRotas] = useState<RotaPlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [nameFilter, setNameFilter] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [sortKey, setSortKey] = useState<string>('start_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [pubExpanded, setPubExpanded] = useState(true);
  const [unpubExpanded, setUnpubExpanded] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.rotaPlans
      .list()
      .then(setRotas)
      .catch(() => setRotas([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
  }, [tab, nameFilter, rangeFrom, rangeTo, sortKey, sortDir]);

  const tabRotas = useMemo(() => {
    const active = tab === 'active';
    return rotas.filter((r) => {
      if (active !== isActiveRota(r)) return false;
      if (nameFilter.trim() && !r.name.toLowerCase().includes(nameFilter.trim().toLowerCase())) return false;
      return overlapsRange(r, rangeFrom, rangeTo);
    });
  }, [rotas, tab, nameFilter, rangeFrom, rangeTo]);

  const getSortValue = useCallback((r: RotaPlanListItem, key: string) => {
    if (key === 'name') return r.name;
    if (key === 'start_date') return r.start_date;
    if (key === 'end_date') return r.end_date;
    if (key === 'day_count') return r.day_count;
    if (key === 'staff_count') return r.staff_count;
    if (key === 'shift_count') return r.shift_count;
    if (key === 'status') return r.status;
    return r.created_at;
  }, []);

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    tabRotas,
    '',
    sortKey,
    sortDir,
    page,
    pageSize,
    (r) => r.name,
    getSortValue
  );

  const sortedTabRotas = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const key = sortKey;
    return [...tabRotas].sort((a, b) => {
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
  }, [tabRotas, sortKey, sortDir, getSortValue]);

  const publishedOld = useMemo(
    () => sortedTabRotas.filter((r) => r.status === 'published'),
    [sortedTabRotas]
  );
  const unpublishedOld = useMemo(
    () => sortedTabRotas.filter((r) => r.status !== 'published'),
    [sortedTabRotas]
  );

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const clearFilters = () => {
    setNameFilter('');
    setRangeFrom('');
    setRangeTo('');
  };

  const onDelete = (id: number, name: string) => {
    toast.confirm(
      `Delete rota "${name}"?`,
      async () => {
        setDeletingId(id);
        try {
          await api.rotaPlans.delete(id);
          toast.success('Rota deleted');
          load();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Delete failed');
        } finally {
          setDeletingId(null);
        }
      },
      { label: 'Delete', description: 'Published shifts linked to it will also be removed.' }
    );
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'active', label: 'Active rotas' },
    { id: 'old', label: 'Old rotas' },
  ];

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
          <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Calendar className="size-7 text-primary" />
                  Rotas & Shifts
                </h1>
                <p className="text-muted-foreground text-sm mt-1">Manage current and past rotas. Publish drafts to save shifts as assignments.</p>
              </div>
              <Button className="bg-pink-600 hover:bg-pink-700" asChild>
                <Link href="/rota/create">
                  <Plus className="size-4 mr-1.5" />
                  Create rota
                </Link>
              </Button>
            </div>

            <div className="border-b flex flex-wrap gap-1">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                    tab === t.id
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{tab === 'active' ? 'Active rotas' : 'Old rotas'}</CardTitle>
                <CardDescription>
                  {tab === 'active'
                    ? 'Rotas that are current or upcoming (end date today or later).'
                    : 'Rotas which have ended are shown here.'}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1 min-w-[140px]">
                    <label className="text-xs text-muted-foreground">From</label>
                    <Input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
                  </div>
                  <div className="space-y-1 min-w-[140px]">
                    <label className="text-xs text-muted-foreground">To</label>
                    <Input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
                  </div>
                  <div className="space-y-1 flex-1 min-w-[160px]">
                    <label className="text-xs text-muted-foreground">Rota name</label>
                    <Input placeholder="Filter by name…" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
                  </div>
                  <div className="space-y-1 min-w-[180px]">
                    <label className="text-xs text-muted-foreground">Sort</label>
                    <Select
                      value={`${sortKey}:${sortDir}`}
                      onValueChange={(v) => {
                        const [k, d] = v.split(':');
                        setSortKey(k);
                        setSortDir(d as SortDir);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" className="z-[100]">
                        <SelectItem value="start_date:desc">Start date (newest first)</SelectItem>
                        <SelectItem value="start_date:asc">Start date (oldest first)</SelectItem>
                        <SelectItem value="name:asc">Name (A–Z)</SelectItem>
                        <SelectItem value="created_at:desc">Recently created</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(nameFilter || rangeFrom || rangeTo) && (
                    <Button type="button" variant="link" className="text-xs h-9 px-0" onClick={clearFilters}>
                      Clear all filters
                    </Button>
                  )}
                </div>

                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                    Loading rotas…
                  </div>
                ) : tab === 'active' ? (
                  tabRotas.length === 0 ? (
                    <div className="py-12 text-center text-sm text-muted-foreground">
                      No active rotas.{' '}
                      <Link href="/rota/create" className="text-primary underline hover:no-underline">
                        Create a rota
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-lg border bg-card overflow-hidden">
                        {pageRows.map((r) => (
                          <RotaRow key={r.id} r={r} deletingId={deletingId} onDelete={onDelete} />
                        ))}
                      </div>
                      <TablePaginationBar
                        safePage={safePage}
                        pageCount={pageCount}
                        total={total}
                        pageSize={pageSize}
                        rangeStart={rangeStart}
                        rangeEnd={rangeEnd}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                      />
                    </>
                  )
                ) : tabRotas.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    No old rotas match your filters.
                    {rotas.some((r) => !isActiveRota(r)) ? null : (
                      <>
                        {' '}
                        Ended rotas will appear here once their end date has passed.
                      </>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <RotaSection
                      title="Published rotas"
                      hint="Rotas that are no longer active but are still published will appear here."
                      items={publishedOld}
                      expanded={pubExpanded}
                      onToggle={() => setPubExpanded((v) => !v)}
                      deletingId={deletingId}
                      onDelete={onDelete}
                      empty="No published old rotas."
                    />
                    <RotaSection
                      title="Unpublished rotas"
                      hint="Draft rotas whose end date has passed."
                      items={unpublishedOld}
                      expanded={unpubExpanded}
                      onToggle={() => setUnpubExpanded((v) => !v)}
                      deletingId={deletingId}
                      onDelete={onDelete}
                      empty="No unpublished old rotas."
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="grid sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Grid3x3 className="size-4" />
                    Assignment grid
                  </CardTitle>
                  <CardDescription className="text-xs">Live assignments from your database (filters, export).</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/rota/legacy">Open legacy grid</Link>
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="size-4" />
                    Attendance report
                  </CardTitle>
                  <CardDescription className="text-xs">Summaries from the planner session.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/rota/attendance-report">Open report</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
