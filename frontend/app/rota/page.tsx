'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { ModuleGuard } from '@/components/module-guard';
import { InlineTableSkeleton } from '@/components/skeletons';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
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
  renamingId,
  selected,
  onToggleSelect,
  onDelete,
  onRename,
  bulkBusy,
  canEdit,
  canCreate,
  canDelete,
}: {
  r: RotaPlanListItem;
  deletingId: number | null;
  renamingId: number | null;
  selected: boolean;
  onToggleSelect: (id: number, checked: boolean) => void;
  onDelete: (id: number, name: string) => void;
  onRename: (id: number, currentName: string) => void;
  bulkBusy?: boolean;
  canEdit?: boolean;
  canCreate?: boolean;
  canDelete?: boolean;
}) {
  const published = r.status === 'published';
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-4 px-4 border-b last:border-b-0 hover:bg-muted/30">
      <div className="flex items-start gap-3 min-w-0 flex-1">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 rounded border-input"
          checked={selected}
          onChange={(e) => onToggleSelect(r.id, e.target.checked)}
          aria-label={`Select ${r.name}`}
          disabled={bulkBusy || !canDelete}
        />
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
      </div>
      <div className="flex items-center gap-1 shrink-0 sm:ml-auto pl-7 sm:pl-0">
        {canEdit ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2 text-xs"
            disabled={renamingId === r.id || bulkBusy}
            onClick={() => onRename(r.id, r.name)}
            title="Rename rota"
          >
            {renamingId === r.id ? <Loader2 className="size-3.5 animate-spin" /> : 'Rename'}
          </Button>
        ) : null}
        {canCreate ? (
          <Button variant="ghost" size="icon" className="size-8" asChild title="Copy to new rota">
            <Link href={`/rota/create?from=${r.id}`}>
              <Copy className="size-4" />
            </Link>
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" className="size-8" asChild title="Open planner">
          <Link href={`/rota/calendar?id=${r.id}`}>
            <Pencil className="size-4" />
          </Link>
        </Button>
        {canDelete ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:text-destructive"
            disabled={deletingId === r.id || bulkBusy}
            onClick={() => onDelete(r.id, r.name)}
            title="Delete"
          >
            <Trash2 className="size-4" />
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function BulkDeleteBar({
  selectedCount,
  allVisibleSelected,
  someVisibleSelected,
  selectableCount,
  bulkDeleting,
  onToggleAll,
  onBulkDelete,
}: {
  selectedCount: number;
  allVisibleSelected: boolean;
  someVisibleSelected: boolean;
  selectableCount: number;
  bulkDeleting: boolean;
  onToggleAll: (checked: boolean) => void;
  onBulkDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2">
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
        <input
          type="checkbox"
          className="size-4 rounded border-input"
          checked={allVisibleSelected}
          ref={(el) => {
            if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
          }}
          onChange={(e) => onToggleAll(e.target.checked)}
          disabled={bulkDeleting || selectableCount === 0}
          aria-label="Select all visible rotas"
        />
        <span className="text-muted-foreground">
          {selectedCount > 0 ? `${selectedCount} selected` : 'Select all'}
        </span>
      </label>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="h-8"
        disabled={selectedCount === 0 || bulkDeleting}
        onClick={onBulkDelete}
      >
        {bulkDeleting ? (
          <Loader2 className="size-3.5 animate-spin mr-1.5" />
        ) : (
          <Trash2 className="size-3.5 mr-1.5" />
        )}
        Delete selected
      </Button>
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
  renamingId,
  selectedIds,
  onToggleSelect,
  onDelete,
  onRename,
  empty,
  bulkBusy,
  canEdit,
  canCreate,
  canDelete,
}: {
  title: string;
  hint?: string;
  items: RotaPlanListItem[];
  expanded: boolean;
  onToggle: () => void;
  deletingId: number | null;
  renamingId: number | null;
  selectedIds: Set<number>;
  onToggleSelect: (id: number, checked: boolean) => void;
  onDelete: (id: number, name: string) => void;
  onRename: (id: number, currentName: string) => void;
  empty: string;
  bulkBusy?: boolean;
  canEdit?: boolean;
  canCreate?: boolean;
  canDelete?: boolean;
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
              <RotaRow
                key={r.id}
                r={r}
                deletingId={deletingId}
                renamingId={renamingId}
                selected={selectedIds.has(r.id)}
                onToggleSelect={onToggleSelect}
                onDelete={onDelete}
                onRename={onRename}
                bulkBusy={bulkBusy}
                canEdit={canEdit}
                canCreate={canCreate}
                canDelete={canDelete}
              />
            ))}
          </div>
        )
      ) : null}
    </div>
  );
}

function RotaHubPage() {
  const { user } = useAuth();
  const canCreateRota = canModule(user, 'rota', 'create');
  const canEditRota = canModule(user, 'rota', 'edit');
  const canDeleteRota = canModule(user, 'rota', 'delete');
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'old' ? 'old' : 'active';

  const [tab, setTab] = useState<Tab>(initialTab);
  const [rotas, setRotas] = useState<RotaPlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
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
    setSelectedIds(new Set());
  }, [tab, nameFilter, rangeFrom, rangeTo, sortKey, sortDir]);

  const tabRotas = useMemo(() => {
    const active = tab === 'active';
    return rotas.filter((r) => {
      if (active !== isActiveRota(r)) return false;
      if (nameFilter.trim() && !r.name.toLowerCase().includes(nameFilter.trim().toLowerCase())) return false;
      return overlapsRange(r, rangeFrom, rangeTo);
    });
  }, [rotas, tab, nameFilter, rangeFrom, rangeTo]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(tabRotas.map((r) => r.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tabRotas]);

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
          setSelectedIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
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

  const toggleSelect = (id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const selectableIds = useMemo(() => {
    if (tab === 'active') return pageRows.map((r) => r.id);
    return sortedTabRotas.map((r) => r.id);
  }, [tab, pageRows, sortedTabRotas]);

  const allVisibleSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.has(id));
  const someVisibleSelected = selectableIds.some((id) => selectedIds.has(id));

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) selectableIds.forEach((id) => next.add(id));
      else selectableIds.forEach((id) => next.delete(id));
      return next;
    });
  };

  const onBulkDelete = () => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    toast.confirm(
      `Delete ${ids.length} selected rota${ids.length === 1 ? '' : 's'}?`,
      async () => {
        setBulkDeleting(true);
        let ok = 0;
        let failed = 0;
        for (const id of ids) {
          try {
            await api.rotaPlans.delete(id);
            ok += 1;
          } catch {
            failed += 1;
          }
        }
        setBulkDeleting(false);
        setSelectedIds(new Set());
        load();
        if (ok && !failed) toast.success(`Deleted ${ok} rota${ok === 1 ? '' : 's'}`);
        else if (ok && failed) toast.warning(`Deleted ${ok}, failed ${failed}`);
        else toast.error('Bulk delete failed');
      },
      {
        label: 'Delete all',
        description: 'Published shifts linked to these rotas will also be removed.',
      }
    );
  };

  const onRename = (id: number, currentName: string) => {
    const next = window.prompt('Enter a new name for this rota', currentName);
    if (next == null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      toast.warning('Please enter a rota name');
      return;
    }
    if (trimmed === currentName) return;
    void (async () => {
      setRenamingId(id);
      try {
        await api.rotaPlans.update(id, { name: trimmed });
        toast.success('Rota name updated');
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Rename failed');
      } finally {
        setRenamingId(null);
      }
    })();
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'active', label: 'Active rotas' },
    { id: 'old', label: 'Old rotas' },
  ];

  return (
    <ProtectedRoute>
      <ModuleGuard moduleKey="rota">
        <AppShell>
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
          <div className="container mx-auto px-4 py-8 space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Calendar className="size-7 text-primary" />
                  Rotas & Shifts
                </h1>
                <p className="text-muted-foreground text-sm mt-1">Manage current and past rotas. Publish drafts to save shifts as assignments.</p>
              </div>
              {canCreateRota ? (
                <Button className="bg-pink-600 hover:bg-pink-700" asChild>
                  <Link href="/rota/create">
                    <Plus className="size-4 mr-1.5" />
                    Create rota
                  </Link>
                </Button>
              ) : null}
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
                  <InlineTableSkeleton rows={5} />
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
                      {canDeleteRota ? (
                        <BulkDeleteBar
                          selectedCount={selectedIds.size}
                          allVisibleSelected={allVisibleSelected}
                          someVisibleSelected={someVisibleSelected}
                          selectableCount={selectableIds.length}
                          bulkDeleting={bulkDeleting}
                          onToggleAll={toggleSelectAllVisible}
                          onBulkDelete={onBulkDelete}
                        />
                      ) : null}
                      <div className="rounded-lg border bg-card overflow-hidden">
                        {pageRows.map((r) => (
                          <RotaRow
                            key={r.id}
                            r={r}
                            deletingId={deletingId}
                            renamingId={renamingId}
                            selected={selectedIds.has(r.id)}
                            onToggleSelect={toggleSelect}
                            onDelete={onDelete}
                            onRename={onRename}
                            bulkBusy={bulkDeleting}
                            canEdit={canEditRota}
                            canCreate={canCreateRota}
                            canDelete={canDeleteRota}
                          />
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
                    {canDeleteRota ? (
                      <BulkDeleteBar
                        selectedCount={selectedIds.size}
                        allVisibleSelected={allVisibleSelected}
                        someVisibleSelected={someVisibleSelected}
                        selectableCount={selectableIds.length}
                        bulkDeleting={bulkDeleting}
                        onToggleAll={toggleSelectAllVisible}
                        onBulkDelete={onBulkDelete}
                      />
                    ) : null}
                    <RotaSection
                      title="Published rotas"
                      hint="Rotas that are no longer active but are still published will appear here."
                      items={publishedOld}
                      expanded={pubExpanded}
                      onToggle={() => setPubExpanded((v) => !v)}
                      deletingId={deletingId}
                      renamingId={renamingId}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelect}
                      onDelete={onDelete}
                      onRename={onRename}
                      empty="No published old rotas."
                      bulkBusy={bulkDeleting}
                      canEdit={canEditRota}
                      canCreate={canCreateRota}
                      canDelete={canDeleteRota}
                    />
                    <RotaSection
                      title="Unpublished rotas"
                      hint="Draft rotas whose end date has passed."
                      items={unpublishedOld}
                      expanded={unpubExpanded}
                      onToggle={() => setUnpubExpanded((v) => !v)}
                      deletingId={deletingId}
                      renamingId={renamingId}
                      selectedIds={selectedIds}
                      onToggleSelect={toggleSelect}
                      onDelete={onDelete}
                      onRename={onRename}
                      empty="No unpublished old rotas."
                      bulkBusy={bulkDeleting}
                      canEdit={canEditRota}
                      canCreate={canCreateRota}
                      canDelete={canDeleteRota}
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
      </ModuleGuard>
    </ProtectedRoute>
  );
}

export default function RotaHubPageWrapper() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>}>
      <RotaHubPage />
    </Suspense>
  );
}
