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
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { ModulePage, ModuleTabs } from '@/components/module-layout';
import {
  DashboardHeader,
  FilterBar,
  FilterField,
  Pill,
  QuickLinks,
  ResultsCard,
  RowActionsMenu,
  ShowingCount,
  StatCards,
  type BadgeTone,
  type StatCardSpec,
} from '@/components/module-dashboard';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, type SortDir } from '@/lib/use-table-list';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { RotaPlanListItem } from '@/lib/types';
import {
  CalendarDays,
  CalendarRange,
  Clock,
  Copy,
  Grid3x3,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import {
  EMPTY_WORK_FILTERS,
  WorkFilterBar,
  hasWorkFilters,
  toWorkFilterParams,
  useWorkFilterOptions,
  type WorkFilterValues,
} from '@/components/work-filter-bar';

type Tab = 'active' | 'draft' | 'old';

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function isEnded(r: RotaPlanListItem) {
  return r.end_date < todayKey();
}

function isRunningNow(r: RotaPlanListItem) {
  const t = todayKey();
  return r.start_date <= t && r.end_date >= t;
}

function fmtRange(start: string, end: string) {
  const s = new Date(`${start}T12:00:00`);
  const e = new Date(`${end}T12:00:00`);
  const b = e.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${s.getDate()} – ${b}`;
  }
  return `${s.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })} – ${b}`;
}

function fmtStamp(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} ${d.toLocaleTimeString(
    'en-GB',
    { hour: '2-digit', minute: '2-digit' }
  )}`;
}

/** The shape of the rota, read off its length — there is no stored "type". */
function rotaType(r: RotaPlanListItem): { label: string; tone: BadgeTone } {
  const n = r.day_count;
  if (n <= 1) return { label: 'Single day', tone: 'muted' };
  if (n <= 7) return { label: 'Weekly', tone: 'info' };
  if (n <= 14) return { label: 'Fortnightly', tone: 'neutral' };
  if (n <= 31) return { label: 'Monthly', tone: 'positive' };
  return { label: `${n} days`, tone: 'muted' };
}

/** Draft, Published, or Active while a published rota is actually running. */
function rotaStatus(r: RotaPlanListItem): { label: string; tone: BadgeTone } {
  if (r.status !== 'published') return { label: 'Draft', tone: 'warning' };
  if (isRunningNow(r)) return { label: 'Active', tone: 'info' };
  return { label: 'Published', tone: 'positive' };
}

function summarise(names: string[], allLabel: string) {
  if (!names.length) return allLabel;
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

function overlapsRange(r: RotaPlanListItem, from: string, to: string) {
  if (!from && !to) return true;
  return r.start_date <= (to || '9999-12-31') && r.end_date >= (from || '0001-01-01');
}

function RotaHubPage() {
  const { user } = useAuth();
  const canCreateRota = canModule(user, 'rota', 'create');
  const canEditRota = canModule(user, 'rota', 'edit');
  const canDeleteRota = canModule(user, 'rota', 'delete');
  const canPublishRota = canModule(user, 'rota', 'publish') || canEditRota;
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab');
  const initialTab: Tab = urlTab === 'old' ? 'old' : urlTab === 'draft' ? 'draft' : 'active';

  const [tab, setTab] = useState<Tab>(initialTab);
  const [rotas, setRotas] = useState<RotaPlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [nameFilter, setNameFilter] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  // Client / Site / Contractor / Sub-contractor / Staff / Job title. Answered on the
  // server, which keeps a rota when any of its shifts match — and a client match covers
  // every site assigned to that client.
  const [workFilters, setWorkFilters] = useState<WorkFilterValues>(EMPTY_WORK_FILTERS);
  const filterOptions = useWorkFilterOptions();

  // Local rather than useTableSort: rotas want newest-first on arrival, and the shared
  // hook always starts a column ascending.
  const [sortKey, setSortKey] = useState<string>('start_date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const toggleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDir(key === 'start_date' || key === 'updated' ? 'desc' : 'asc');
        return key;
      }
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return key;
    });
  }, []);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.rotaPlans
      .list(toWorkFilterParams(workFilters))
      .then(setRotas)
      .catch(() => setRotas([]))
      .finally(() => setLoading(false));
  }, [workFilters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [tab, nameFilter, rangeFrom, rangeTo, statusFilter, workFilters]);

  const tabRotas = useMemo(
    () =>
      rotas.filter((r) => {
        const ended = isEnded(r);
        if (tab === 'active' && (ended || r.status !== 'published')) return false;
        if (tab === 'draft' && (ended || r.status === 'published')) return false;
        if (tab === 'old' && !ended) return false;
        if (statusFilter !== 'all' && (statusFilter === 'published') !== (r.status === 'published')) return false;
        if (nameFilter.trim() && !r.name.toLowerCase().includes(nameFilter.trim().toLowerCase())) return false;
        return overlapsRange(r, rangeFrom, rangeTo);
      }),
    [rotas, tab, statusFilter, nameFilter, rangeFrom, rangeTo]
  );

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(tabRotas.map((r) => r.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [tabRotas]);

  const getSortValue = useCallback((r: RotaPlanListItem, key: string) => {
    switch (key) {
      case 'name':
        return r.name;
      case 'start_date':
        return r.start_date;
      case 'type':
        return r.day_count;
      case 'where':
        return summarise(r.client_names, 'zzz').toLowerCase();
      case 'shifts':
        return r.shift_count;
      case 'staff':
        return r.staff_count;
      case 'status':
        return rotaStatus(r).label;
      case 'updated':
        return r.updated_at ?? r.created_at;
      default:
        return r.created_at;
    }
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

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const clearFilters = () => {
    setNameFilter('');
    setRangeFrom('');
    setRangeTo('');
    setStatusFilter('all');
    setWorkFilters(EMPTY_WORK_FILTERS);
  };

  const pageIds = useMemo(() => pageRows.map((r) => r.id), [pageRows]);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  const toggleSelectAll = (checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });
  const toggleSelect = (id: number, checked: boolean) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });

  const onDelete = (id: number, name: string) => {
    toast.confirm(
      `Delete rota "${name}"?`,
      async () => {
        setBusyId(id);
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
          setBusyId(null);
        }
      },
      { label: 'Delete', description: 'Published shifts linked to it will also be removed.' }
    );
  };

  const onPublish = async (r: RotaPlanListItem) => {
    setBusyId(r.id);
    try {
      const { created, skipped, errors } = await api.rotaPlans.publish(r.id);
      if (errors.length) errors.slice(0, 3).forEach((m) => toast.warning(m));
      toast.success(`Published ${created} shift${created === 1 ? '' : 's'}${skipped ? `, ${skipped} skipped` : ''}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setBusyId(null);
    }
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
      setBusyId(id);
      try {
        await api.rotaPlans.update(id, { name: trimmed });
        toast.success('Rota name updated');
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Rename failed');
      } finally {
        setBusyId(null);
      }
    })();
  };

  const onDuplicate = (r: RotaPlanListItem) => {
    const name = window.prompt('Name for the copy', `${r.name} (copy)`);
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.warning('Please enter a rota name');
      return;
    }
    void (async () => {
      setBusyId(r.id);
      try {
        await api.rotaPlans.copy(r.id, { name: trimmed, start_date: r.start_date, day_count: r.day_count });
        toast.success('Rota duplicated');
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Duplicate failed');
      } finally {
        setBusyId(null);
      }
    })();
  };

  /** Applies one action to every selected rota, reporting the tally once at the end. */
  const runBulk = async (
    ids: number[],
    verb: string,
    run: (id: number) => Promise<unknown>,
    opts?: { confirm?: { message: string; label: string; description: string } }
  ) => {
    const go = async () => {
      setBulkBusy(true);
      let ok = 0;
      let failed = 0;
      for (const id of ids) {
        try {
          await run(id);
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      setBulkBusy(false);
      setSelectedIds(new Set());
      load();
      if (ok && !failed) toast.success(`${verb} ${ok} rota${ok === 1 ? '' : 's'}`);
      else if (ok && failed) toast.warning(`${verb} ${ok}, failed ${failed}`);
      else toast.error(`Bulk ${verb.toLowerCase()} failed`);
    };
    if (opts?.confirm) {
      toast.confirm(opts.confirm.message, go, {
        label: opts.confirm.label,
        description: opts.confirm.description,
      });
      return;
    }
    await go();
  };

  const selected = [...selectedIds];
  const selectedDrafts = tabRotas.filter((r) => selectedIds.has(r.id) && r.status !== 'published');

  const activeRotas = rotas.filter((r) => !isEnded(r) && r.status === 'published');
  const draftRotas = rotas.filter((r) => !isEnded(r) && r.status !== 'published');
  const liveNow = rotas.filter((r) => r.status === 'published' && isRunningNow(r));

  const statCards: StatCardSpec[] = [
    {
      key: 'active',
      label: 'Active rotas',
      value: activeRotas.length,
      icon: CalendarRange,
      tone: 'neutral',
      caption: `${draftRotas.length} draft${draftRotas.length === 1 ? '' : 's'}`,
    },
    {
      key: 'shifts',
      label: 'Total shifts',
      value: tabRotas.reduce((n, r) => n + r.shift_count, 0),
      icon: CalendarDays,
      tone: 'info',
      caption: 'in this view',
    },
    {
      key: 'staff',
      label: 'Staff assigned',
      value: tabRotas.reduce((n, r) => n + r.staff_count, 0),
      icon: Users,
      tone: 'positive',
      caption: 'across these rotas',
    },
    {
      key: 'unmarked',
      label: 'Unmarked attendance',
      value: tabRotas.reduce((n, r) => n + (r.unmarked_attendance_count ?? 0), 0),
      icon: Clock,
      tone: tabRotas.some((r) => (r.unmarked_attendance_count ?? 0) > 0) ? 'danger' : 'positive',
      caption: 'shifts past with no mark',
    },
    {
      key: 'running',
      label: 'Running today',
      value: liveNow.length,
      icon: CalendarDays,
      tone: liveNow.length ? 'positive' : 'muted',
      caption: new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }),
    },
  ];

  const tabs: { id: Tab; label: string }[] = [
    { id: 'active', label: 'Active rotas' },
    { id: 'draft', label: 'Draft rotas' },
    { id: 'old', label: 'Old rotas' },
  ];

  const emptyText =
    tab === 'draft'
      ? 'No draft rotas. Create one and publish it when it is ready.'
      : tab === 'old'
        ? 'No rotas have ended yet. They move here once their end date passes.'
        : 'No active rotas.';

  return (
    <ProtectedRoute>
      <ModuleGuard moduleKey="rota">
        <AppShell>
          <ModulePage>
            <DashboardHeader
              title="Rotas & Shifts"
              hint="A rota is a draft until it is published. Publishing turns its planner shifts into real assignments, which is what attendance, payroll and invoices read."
              description="Create, manage and publish rotas. Assign shifts, notify staff and track coverage."
              actions={
                canCreateRota ? (
                  <Button asChild>
                    <Link href="/rota/create">
                      <Plus className="size-4 mr-1.5" />
                      Create rota
                    </Link>
                  </Button>
                ) : null
              }
            />

            <ModuleTabs tabs={tabs} value={tab} onChange={setTab} />

            <StatCards cards={statCards} />

            <div className="space-y-3">
              <FilterBar onClear={clearFilters} showClear={!!(nameFilter || rangeFrom || rangeTo || statusFilter !== 'all' || hasWorkFilters(workFilters))}>
                <FilterField label="From" className="flex-1">
                  <Input type="date" value={rangeFrom} max={rangeTo || undefined} onChange={(e) => setRangeFrom(e.target.value)} />
                </FilterField>
                <FilterField label="To" className="flex-1">
                  <Input type="date" value={rangeTo} min={rangeFrom || undefined} onChange={(e) => setRangeTo(e.target.value)} />
                </FilterField>
                <FilterField label="Rota name" className="min-w-[220px] flex-[2]">
                  <Input placeholder="Search rota name…" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
                </FilterField>
                <FilterField label="Status" className="flex-1">
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterField>
              </FilterBar>

              <div className="rounded-lg border bg-card p-4 space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">
                  Client, site, contractor, staff &amp; job title
                </label>
                <WorkFilterBar
                  value={workFilters}
                  onChange={setWorkFilters}
                  options={filterOptions}
                  disabled={loading}
                  className="flex flex-wrap items-center gap-2"
                />
              </div>
            </div>

            <ResultsCard
              title={tabs.find((t) => t.id === tab)?.label ?? 'Rotas'}
              count={total}
              pageSize={pageSize}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              toolbar={
                selected.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">{selected.length} selected</span>
                    {canPublishRota && selectedDrafts.length > 0 ? (
                      <Button
                        size="sm"
                        disabled={bulkBusy}
                        onClick={() =>
                          runBulk(selectedDrafts.map((r) => r.id), 'Published', (id) => api.rotaPlans.publish(id))
                        }
                      >
                        {bulkBusy ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Send className="size-3.5 mr-1.5" />}
                        Publish ({selectedDrafts.length})
                      </Button>
                    ) : null}
                    {canDeleteRota ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:text-destructive"
                        disabled={bulkBusy}
                        onClick={() =>
                          runBulk(selected, 'Deleted', (id) => api.rotaPlans.delete(id), {
                            confirm: {
                              message: `Delete ${selected.length} selected rota${selected.length === 1 ? '' : 's'}?`,
                              label: 'Delete all',
                              description: 'Published shifts linked to these rotas will also be removed.',
                            },
                          })
                        }
                      >
                        <Trash2 className="size-3.5 mr-1.5" />
                        Delete
                      </Button>
                    ) : null}
                  </div>
                ) : null
              }
            >
              <div className="p-4">
                {loading ? (
                  <InlineTableSkeleton rows={5} />
                ) : total === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    {emptyText}{' '}
                    {canCreateRota && tab !== 'old' ? (
                      <Link href="/rota/create" className="text-primary underline hover:no-underline">
                        Create a rota
                      </Link>
                    ) : null}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-10">
                            <input
                              type="checkbox"
                              className="size-4 rounded border-input"
                              checked={allPageSelected}
                              onChange={(e) => toggleSelectAll(e.target.checked)}
                              aria-label="Select all rotas on this page"
                              disabled={!canDeleteRota && !canPublishRota}
                            />
                          </TableHead>
                          <SortableHead label="Rota name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Date range" colKey="start_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Type" colKey="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Client / Site" colKey="where" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Shifts" colKey="shifts" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Staff" colKey="staff" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Last updated" colKey="updated" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageRows.map((r) => {
                          const type = rotaType(r);
                          const status = rotaStatus(r);
                          const busy = busyId === r.id || bulkBusy;
                          const unmarked = r.unmarked_attendance_count ?? 0;
                          const unpublished = r.unpublished_staff_count ?? 0;
                          return (
                            <TableRow
                              key={r.id}
                              // Unmarked attendance wins the tint: it is already costing money,
                              // where unpublished staff is work not yet sent.
                              className={
                                unmarked > 0
                                  ? 'bg-rose-50/60 dark:bg-rose-950/20'
                                  : unpublished > 0
                                    ? 'bg-amber-50/60 dark:bg-amber-950/20'
                                    : undefined
                              }
                            >
                              <TableCell>
                                <input
                                  type="checkbox"
                                  className="size-4 rounded border-input"
                                  checked={selectedIds.has(r.id)}
                                  onChange={(e) => toggleSelect(r.id, e.target.checked)}
                                  aria-label={`Select ${r.name}`}
                                  disabled={busy || (!canDeleteRota && !canPublishRota)}
                                />
                              </TableCell>
                              <TableCell className="font-medium">
                                <Link href={`/rota/calendar?id=${r.id}`} className="hover:underline underline-offset-2">
                                  {r.name}
                                </Link>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {r.day_count} days · {r.staff_count} staff · {r.shift_count} shifts
                                </p>
                                {unpublished > 0 ? (
                                  <Link
                                    href={`/rota/calendar?id=${r.id}`}
                                    className="mt-1 mr-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:underline dark:bg-amber-900/40 dark:text-amber-300"
                                    title={`${unpublished} ${unpublished === 1 ? 'person has' : 'people have'} shifts on this rota that were never published. Their shifts do not reach attendance, payroll or invoicing until they are.`}
                                  >
                                    <Send className="size-3" />
                                    {unpublished} staff rota unpublished
                                  </Link>
                                ) : null}
                                {unmarked > 0 ? (
                                  <Link
                                    href={`/rota/calendar?id=${r.id}`}
                                    className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-medium text-rose-800 hover:underline dark:bg-rose-900/40 dark:text-rose-300"
                                    title={`${unmarked} shift${unmarked === 1 ? '' : 's'} in this rota have been and gone with no attendance marked. They count as unworked until they are marked.`}
                                  >
                                    <Clock className="size-3" />
                                    {unmarked} unmarked
                                  </Link>
                                ) : null}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm">{fmtRange(r.start_date, r.end_date)}</TableCell>
                              <TableCell>
                                <Pill tone={type.tone}>{type.label}</Pill>
                              </TableCell>
                              <TableCell className="text-sm">
                                <span className="block truncate max-w-[180px]" title={r.client_names.join(', ') || undefined}>
                                  {summarise(r.client_names, 'All clients')}
                                </span>
                                <span
                                  className="block truncate max-w-[180px] text-xs text-muted-foreground"
                                  title={r.site_names.join(', ') || undefined}
                                >
                                  {summarise(r.site_names, 'All sites')}
                                </span>
                              </TableCell>
                              <TableCell className="tabular-nums">{r.shift_count}</TableCell>
                              <TableCell className="tabular-nums">{r.staff_count}</TableCell>
                              <TableCell>
                                <Pill tone={status.tone} dot>
                                  {status.label}
                                </Pill>
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                                {fmtStamp(r.updated_at ?? r.created_at)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-end gap-1">
                                  {r.status !== 'published' && canPublishRota ? (
                                    <Button size="sm" disabled={busy} onClick={() => onPublish(r)}>
                                      {busy ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : null}
                                      Publish
                                    </Button>
                                  ) : (
                                    <Button size="sm" variant="outline" asChild>
                                      <Link href={`/rota/calendar?id=${r.id}`}>View</Link>
                                    </Button>
                                  )}
                                  <RowActionsMenu
                                    actions={[
                                      {
                                        label: 'Open rota',
                                        icon: CalendarRange,
                                        onSelect: () => {
                                          window.location.href = `/rota/calendar?id=${r.id}`;
                                        },
                                      },
                                      {
                                        label: 'Duplicate',
                                        icon: Copy,
                                        onSelect: () => onDuplicate(r),
                                        disabled: !canCreateRota || busy,
                                      },
                                      {
                                        label: 'Rename',
                                        icon: Pencil,
                                        onSelect: () => onRename(r.id, r.name),
                                        disabled: !canEditRota || busy,
                                      },
                                      {
                                        label: 'Delete',
                                        icon: Trash2,
                                        destructive: true,
                                        onSelect: () => onDelete(r.id, r.name),
                                        disabled: !canDeleteRota || busy,
                                      },
                                    ]}
                                  />
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {total > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <ShowingCount rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} noun="rotas" />
                    <TablePaginationBar
                      safePage={safePage}
                      pageCount={pageCount}
                      total={total}
                      pageSize={pageSize}
                      rangeStart={rangeStart}
                      rangeEnd={rangeEnd}
                      onPageChange={setPage}
                    />
                  </div>
                ) : null}
              </div>
            </ResultsCard>

            <QuickLinks
              links={[
                {
                  key: 'grid',
                  title: 'Assignment grid',
                  description: 'Live assignments straight from the database, with filters and export.',
                  icon: Grid3x3,
                  tone: 'neutral',
                  action: { label: 'Open grid', href: '/rota/legacy' },
                },
                {
                  key: 'attendance-report',
                  title: 'Attendance report',
                  description: 'Who turned up against what the rota said, summarised by period.',
                  icon: CalendarDays,
                  tone: 'info',
                  action: { label: 'Open report', href: '/rota/attendance-report' },
                },
                {
                  key: 'assignments',
                  title: 'Assignments',
                  description: 'Standing contractor-to-site assignments behind the rota.',
                  icon: Users,
                  tone: 'positive',
                  action: { label: 'Open assignments', href: '/assignments' },
                },
              ]}
            />
          </ModulePage>
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
