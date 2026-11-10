'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { ModuleGuard } from '@/components/module-guard';
import { InlineTableSkeleton } from '@/components/skeletons';
import { useAuth } from '@/contexts/auth-context';
import { canModule, isPortalRole } from '@/lib/permissions';
import { formatDateUK, formatDateTimeUK, localDateKey } from '@/lib/date-format';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { ModulePage, ModuleTabs } from '@/components/module-layout';
import { Card, CardContent } from '@/components/ui/card';
import {
  DashboardHeader,
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
import type { RotaDetail, RotaPlanListItem } from '@/lib/types';
import {
  BarChart3,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Download,
  Grid3x3,
  List as ListIcon,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  RotaPeriodCalendar,
  addDaysKey,
  addMonthsKey,
  periodTitle,
} from '@/components/rota/rota-period-calendar';
import {
  EMPTY_WORK_FILTERS,
  WorkFilterBar,
  hasWorkFilters,
  toWorkFilterParams,
  useWorkFilterOptions,
  type WorkFilterValues,
} from '@/components/work-filter-bar';

type Tab = 'active' | 'draft' | 'old';
type RotaView = 'list' | 'week' | 'month';

/** Planned shifts on the grid, and how many of them reached staff (published). */
function coverage(r: RotaPlanListItem) {
  const planned = Math.max(r.planned_shift_count ?? r.shift_count, 0);
  const sent = r.status === 'published' ? Math.min(r.shift_count, planned || r.shift_count) : 0;
  const total = planned || (r.status === 'published' ? r.shift_count : 0);
  return { planned: total, sent, pct: total ? (sent / total) * 100 : 0 };
}

function csvCell(v: unknown) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

function todayKey() {
  return localDateKey();
}

function isEnded(r: RotaPlanListItem) {
  return r.end_date < todayKey();
}

/** Calendar-day arithmetic on a YYYY-MM-DD key, kept in UTC so it never shifts a day. */
function addDays(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function isRunningNow(r: RotaPlanListItem) {
  const t = todayKey();
  return r.start_date <= t && r.end_date >= t;
}

function fmtRange(start: string, end: string) {
  return `${formatDateUK(start)} – ${formatDateUK(end)}`;
}

function fmtStamp(iso?: string | null) {
  if (!iso) return '—';
  return formatDateTimeUK(iso) || '—';
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
  const portal = isPortalRole(user);
  const canCreateRota = !portal && canModule(user, 'rota', 'create');
  const canEditRota = !portal && canModule(user, 'rota', 'edit');
  const canDeleteRota = !portal && canModule(user, 'rota', 'delete');
  const canPublishRota = !portal && (canModule(user, 'rota', 'publish') || canEditRota);
  const searchParams = useSearchParams();
  const urlTab = searchParams.get('tab');
  const initialTab: Tab = urlTab === 'old' ? 'old' : urlTab === 'draft' ? 'draft' : 'active';

  const [tab, setTab] = useState<Tab>(initialTab);
  const [rotas, setRotas] = useState<RotaPlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [copyOpen, setCopyOpen] = useState(false);
  const [copySource, setCopySource] = useState<RotaPlanListItem | null>(null);
  const [copyName, setCopyName] = useState('');
  const [copyStart, setCopyStart] = useState('');
  const [copyDays, setCopyDays] = useState('7');
  const [copyIncludeAttendance, setCopyIncludeAttendance] = useState(false);
  const [copyBusy, setCopyBusy] = useState(false);

  const [nameFilter, setNameFilter] = useState('');
  const [rangeFrom, setRangeFrom] = useState('');
  const [rangeTo, setRangeTo] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'published'>('all');
  // Only rotas with past shifts nobody marked attendance for.
  const [needsMarking, setNeedsMarking] = useState(false);
  const [markShifts, setMarkShifts] = useState<RotaDetail[] | null>(null);
  const [markShiftsLoading, setMarkShiftsLoading] = useState(false);
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
  const [view, setView] = useState<RotaView>('list');
  // The day the date card and the week / month views are centred on.
  const [focusDate, setFocusDate] = useState(() => todayKey());

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
  }, [tab, nameFilter, rangeFrom, rangeTo, statusFilter, needsMarking, workFilters]);

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

  // Same population as the rose banner: tab membership + unmarked count only.
  // Do not also require name/date filters here — that left "Show only these" empty
  // while the banner still counted the rota.
  const unmarkedRotas = useMemo(
    () =>
      rotas.filter((r) => {
        const n = Number(r.unmarked_attendance_count ?? 0);
        if (!(n > 0)) return false;
        const ended = isEnded(r);
        if (tab === 'active') return !ended && r.status === 'published';
        if (tab === 'draft') return !ended && r.status !== 'published';
        return ended;
      }),
    [rotas, tab]
  );
  const unmarkedShiftTotal = unmarkedRotas.reduce((n, r) => n + Number(r.unmarked_attendance_count ?? 0), 0);
  const showOnlyMarks = needsMarking && unmarkedShiftTotal > 0;
  const listedRotas = showOnlyMarks ? unmarkedRotas : tabRotas;

  // Rotas per tab still waiting on attendance, counted before the page's own filters so
  // the tab badge stays put while the user narrows the list.
  const unmarkedByTab = useMemo(() => {
    const out: Record<Tab, { rotas: number; shifts: number }> = {
      active: { rotas: 0, shifts: 0 },
      draft: { rotas: 0, shifts: 0 },
      old: { rotas: 0, shifts: 0 },
    };
    for (const r of rotas) {
      const n = Number(r.unmarked_attendance_count ?? 0);
      if (!(n > 0)) continue;
      const t: Tab = isEnded(r) ? 'old' : r.status === 'published' ? 'active' : 'draft';
      out[t].rotas += 1;
      out[t].shifts += n;
    }
    return out;
  }, [rotas]);

  useEffect(() => {
    setSelectedIds((prev) => {
      if (prev.size === 0) return prev;
      const valid = new Set(listedRotas.map((r) => r.id));
      const next = new Set([...prev].filter((id) => valid.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [listedRotas]);

  useEffect(() => {
    if (!showOnlyMarks) {
      setMarkShifts(null);
      return;
    }
    if (unmarkedRotas.length === 0) {
      setMarkShifts([]);
      return;
    }
    const planIds = unmarkedRotas.map((r) => r.id);
    const startDate = [...unmarkedRotas.map((r) => r.start_date)].filter(Boolean).sort()[0] || todayKey();
    // Match the company clock used for unmarked counts (Europe/London), not the browser's local day.
    const londonToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date());
    const endDate = [londonToday, ...unmarkedRotas.map((r) => r.end_date)].filter(Boolean).sort().at(-1) || londonToday;
    let cancelled = false;
    setMarkShiftsLoading(true);
    api.assignments
      .rotaDetail({
        start_date: startDate,
        end_date: endDate,
        unmarked_only: true,
        rota_plan_ids: planIds,
        ...toWorkFilterParams(workFilters),
      })
      .then((rows) => {
        if (cancelled) return;
        const needing = [...rows].sort((a, b) => {
          const byDate = String(a.date).localeCompare(String(b.date));
          if (byDate) return byDate;
          return String(a.shift_start || '').localeCompare(String(b.shift_start || ''));
        });
        setMarkShifts(needing);
      })
      .catch(() => {
        if (!cancelled) setMarkShifts([]);
      })
      .finally(() => {
        if (!cancelled) setMarkShiftsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showOnlyMarks, unmarkedRotas, workFilters]);

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
    listedRotas,
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
    setNeedsMarking(false);
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

  /**
   * A copy is nearly always the *next* period rather than a second rota sitting on top of
   * the original's dates, so the dialog opens on the day after the source ends and lets the
   * length be changed before anything is created.
   */
  const onDuplicate = (r: RotaPlanListItem) => {
    setCopySource(r);
    setCopyName(`${r.name} (copy)`);
    setCopyStart(addDays(r.end_date, 1));
    setCopyDays(String(r.day_count));
    setCopyIncludeAttendance(false);
    setCopyOpen(true);
  };

  const submitCopy = () => {
    if (!copySource) return;
    const name = copyName.trim();
    if (!name) {
      toast.warning('Please enter a rota name');
      return;
    }
    if (!copyStart) {
      toast.warning('Please choose a start date');
      return;
    }
    const days = Math.round(Number(copyDays));
    if (!Number.isFinite(days) || days < 1 || days > 90) {
      toast.warning('Number of days must be between 1 and 90');
      return;
    }
    const source = copySource;
    void (async () => {
      setCopyBusy(true);
      setBusyId(source.id);
      try {
        await api.rotaPlans.copy(source.id, {
          name,
          start_date: copyStart,
          day_count: days,
          include_attendance_and_notes: copyIncludeAttendance,
        });
        toast.success('Rota duplicated');
        setCopyOpen(false);
        setCopySource(null);
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Duplicate failed');
      } finally {
        setCopyBusy(false);
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
  const selectedDrafts = listedRotas.filter((r) => selectedIds.has(r.id) && r.status !== 'published');

  const activeRotas = rotas.filter((r) => !isEnded(r) && r.status === 'published');
  const draftRotas = rotas.filter((r) => !isEnded(r) && r.status !== 'published');

  const plannedShifts = listedRotas.reduce((n, r) => n + coverage(r).planned, 0);
  const sentShifts = listedRotas.reduce((n, r) => n + coverage(r).sent, 0);
  const unsentShifts = Math.max(plannedShifts - sentShifts, 0);
  const sentPct = plannedShifts ? (sentShifts / plannedShifts) * 100 : 0;
  const runningOnFocus = rotas.filter((r) => r.status === 'published' && r.start_date <= focusDate && r.end_date >= focusDate);
  const isToday = focusDate === todayKey();
  const stepFocus = (dir: 1 | -1) =>
    setFocusDate((d) => (view === 'month' ? addMonthsKey(d, dir) : addDaysKey(d, view === 'week' ? 7 * dir : dir)));

  const statCards: StatCardSpec[] = [
    {
      key: 'active',
      label: activeRotas.length === 1 ? 'Active rota' : 'Active rotas',
      value: activeRotas.length,
      icon: CalendarRange,
      tone: 'warning',
      caption: `${draftRotas.length} draft${draftRotas.length === 1 ? '' : 's'}`,
    },
    {
      key: 'shifts',
      label: 'Total shifts',
      value: listedRotas.reduce((n, r) => n + r.shift_count, 0),
      icon: Users,
      tone: 'warning',
      caption: `${listedRotas.reduce((n, r) => n + r.staff_count, 0)} staff assigned`,
    },
    {
      key: 'filled',
      label: 'Published shifts',
      value: sentShifts,
      icon: CalendarCheck,
      tone: 'positive',
      caption: `${Math.round(sentPct)}% coverage`,
      progress: { value: sentPct, tone: 'positive' },
    },
    {
      key: 'unfilled',
      label: 'Unpublished shifts',
      value: unsentShifts,
      icon: Clock,
      tone: unsentShifts ? 'danger' : 'positive',
      caption: plannedShifts
        ? `${Math.round(100 - sentPct)}% not sent to staff · ${listedRotas.reduce((n, r) => n + Number(r.unmarked_attendance_count ?? 0), 0)} unmarked`
        : 'nothing planned',
      progress: { value: plannedShifts ? 100 - sentPct : 0, tone: 'danger' },
    },
    {
      key: 'date',
      label: 'Date',
      value: '',
      icon: CalendarDays,
      tone: 'neutral',
      body: (
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setFocusDate(todayKey())}
            title="Back to today"
          >
            <p className="truncate text-sm text-muted-foreground">{isToday ? 'Today' : 'Viewing'}</p>
            <p className="truncate text-base font-bold">
              {new Date(`${focusDate}T00:00:00`).toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {runningOnFocus.length} rota{runningOnFocus.length === 1 ? '' : 's'} running
            </p>
          </button>
          <div className="flex shrink-0 gap-1">
            <Button size="icon" variant="outline" className="size-8" onClick={() => stepFocus(-1)} aria-label="Previous">
              <ChevronLeft className="size-4" />
            </Button>
            <Button size="icon" variant="outline" className="size-8" onClick={() => stepFocus(1)} aria-label="Next">
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      ),
    },
  ];

  const exportCsv = () => {
    const rows = selectedIds.size ? listedRotas.filter((r) => selectedIds.has(r.id)) : listedRotas;
    if (!rows.length) {
      toast.warning('No rotas to export');
      return;
    }
    const head = ['Rota', 'Start', 'End', 'Days', 'Type', 'Clients', 'Sites', 'Shifts', 'Staff', 'Status', 'Unmarked', 'Last updated'];
    const body = rows.map((r) => [
      r.name, r.start_date, r.end_date, r.day_count, rotaType(r).label, r.client_names.join('; '), r.site_names.join('; '),
      r.shift_count, r.staff_count, rotaStatus(r).label, r.unmarked_attendance_count ?? 0,
      r.updated_at ?? r.created_at,
    ]);
    const csv = [head, ...body].map((line) => line.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `rotas-${tab}-${todayKey()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} rota${rows.length === 1 ? '' : 's'}`);
  };

  const filtersActive = !!(nameFilter || rangeFrom || rangeTo || statusFilter !== 'all' || needsMarking || hasWorkFilters(workFilters));
  const selectedOne = selected.length === 1 ? listedRotas.find((r) => r.id === selected[0]) ?? null : null;

  const unmarkedTitle = (t: Tab) =>
    `${unmarkedByTab[t].rotas} rota${unmarkedByTab[t].rotas === 1 ? '' : 's'} with ${unmarkedByTab[t].shifts} shift${unmarkedByTab[t].shifts === 1 ? '' : 's'} where attendance was never marked`;
  const tabs: { id: Tab; label: string; badge?: number; badgeTitle?: string }[] = [
    { id: 'active', label: 'Active rotas', badge: unmarkedByTab.active.rotas, badgeTitle: unmarkedTitle('active') },
    { id: 'draft', label: 'Draft rotas' },
    { id: 'old', label: 'Archived rotas', badge: unmarkedByTab.old.rotas, badgeTitle: unmarkedTitle('old') },
  ];
  const tabUnmarked = unmarkedByTab[tab];

  const emptyText = showOnlyMarks
    ? 'No rotas with unmarked attendance in this tab.'
    : tab === 'draft'
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

            <Card>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-end gap-3">
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
                  <Button variant="outline" onClick={clearFilters} disabled={!filtersActive}>
                    <X className="mr-1.5 size-4" />
                    Clear
                  </Button>
                </div>
                {/* Client / Site / Contractor / Sub-contractor / Staff / Job title, answered on the
                    server: a rota is kept when any of its shifts match. */}
                <WorkFilterBar
                  value={workFilters}
                  onChange={setWorkFilters}
                  options={filterOptions}
                  disabled={loading}
                  className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6 [&>*]:!w-full"
                />
              </CardContent>
            </Card>

            {tabUnmarked.rotas > 0 ? (
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
                <Clock className="size-4 shrink-0" />
                <p className="flex-1">
                  <span className="font-semibold">
                    {tabUnmarked.rotas} rota{tabUnmarked.rotas === 1 ? '' : 's'} still need{tabUnmarked.rotas === 1 ? 's' : ''} attendance marking
                  </span>{' '}
                  · {tabUnmarked.shifts} past shift{tabUnmarked.shifts === 1 ? '' : 's'} with no attendance. They count as unworked for pay and
                  invoicing until marked.
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant={showOnlyMarks ? 'default' : 'outline'}
                  className={showOnlyMarks ? 'bg-rose-600 hover:bg-rose-700' : 'border-rose-300 bg-white text-rose-800 hover:bg-rose-100 dark:bg-transparent dark:text-rose-200'}
                  onClick={() => setNeedsMarking((v) => !v)}
                >
                  {showOnlyMarks ? 'Show all rotas' : 'Show only these'}
                </Button>
              </div>
            ) : null}

            {showOnlyMarks ? (
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">Shifts needing attendance</p>
                      <p className="text-sm text-muted-foreground">
                        Started shifts with no mark in the rotas below. Mark each one so pay and invoicing stay correct.
                      </p>
                    </div>
                    {markShiftsLoading ? (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    ) : (
                      <Pill tone="danger">{markShifts?.length ?? 0} shown</Pill>
                    )}
                  </div>
                  {markShiftsLoading ? (
                    <InlineTableSkeleton rows={4} />
                  ) : !markShifts?.length ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">
                      No started unmarked shifts were returned for these rotas. Open a rota to review attendance on the calendar.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Staff</TableHead>
                            <TableHead>Site</TableHead>
                            <TableHead>Date</TableHead>
                            <TableHead>Start</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {markShifts.map((s) => {
                            const start = (s.shift_start || '').slice(0, 5);
                            const href =
                              `/rota/calendar?id=${s.rota_plan_id ?? ''}` +
                              `&emp=${s.guard_id}&date=${s.date}&start=${encodeURIComponent(start)}&fix=attendance`;
                            return (
                              <TableRow key={`${s.id}-${s.date}-${start}`}>
                                <TableCell className="font-medium">{s.guard_name || '—'}</TableCell>
                                <TableCell>{s.site_name || '—'}</TableCell>
                                <TableCell className="whitespace-nowrap">{formatDateUK(s.date)}</TableCell>
                                <TableCell className="whitespace-nowrap">{start || '—'}</TableCell>
                                <TableCell className="capitalize">{(s.attendance_status || 'pending').replaceAll('_', ' ')}</TableCell>
                                <TableCell className="text-right">
                                  <Button size="sm" variant="outline" asChild>
                                    <Link href={href}>Mark</Link>
                                  </Button>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : null}

            <ResultsCard
              title={showOnlyMarks ? 'Rotas needing attendance' : tabs.find((t) => t.id === tab)?.label ?? 'Rotas'}
              count={total}
              pageSize={pageSize}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
              toolbar={
                <div className="flex flex-wrap items-center gap-2">
                  <label className="mr-1 inline-flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-input accent-primary"
                      checked={allPageSelected}
                      onChange={(e) => toggleSelectAll(e.target.checked)}
                      disabled={view !== 'list' || pageIds.length === 0 || (!canDeleteRota && !canPublishRota)}
                    />
                    {selected.length ? `${selected.length} selected` : 'Select all'}
                  </label>
                  {canPublishRota ? (
                    <Button
                      size="sm"
                      disabled={bulkBusy || selectedDrafts.length === 0}
                      title={selectedDrafts.length ? undefined : 'Select one or more draft rotas'}
                      onClick={() =>
                        runBulk(selectedDrafts.map((r) => r.id), 'Published', (id) => api.rotaPlans.publish(id))
                      }
                    >
                      {bulkBusy ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <Send className="size-3.5 mr-1.5" />}
                      Publish{selectedDrafts.length ? ` (${selectedDrafts.length})` : ''}
                    </Button>
                  ) : null}
                  {canCreateRota ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bulkBusy || !selectedOne}
                      title={selectedOne ? undefined : 'Select exactly one rota to duplicate'}
                      onClick={() => selectedOne && onDuplicate(selectedOne)}
                    >
                      <Copy className="size-3.5 mr-1.5" />
                      Duplicate
                    </Button>
                  ) : null}
                  {canDeleteRota ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                      disabled={bulkBusy || selected.length === 0}
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
                  <Button size="sm" variant="outline" onClick={exportCsv} disabled={!listedRotas.length}>
                    <Download className="size-3.5 mr-1.5" />
                    Export
                  </Button>
                  <div className="ml-1 inline-flex overflow-hidden rounded-md border">
                    {(
                      [
                        { id: 'list', label: 'List view', icon: ListIcon },
                        { id: 'week', label: 'Week view', icon: CalendarDays },
                        { id: 'month', label: 'Month view', icon: CalendarRange },
                      ] as const
                    ).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setView(v.id)}
                        aria-pressed={view === v.id}
                        className={cn(
                          'inline-flex items-center gap-1.5 border-r px-2.5 py-1.5 text-xs font-medium last:border-r-0',
                          view === v.id ? 'bg-orange-50 text-primary dark:bg-orange-950/30' : 'text-muted-foreground hover:bg-muted'
                        )}
                      >
                        <v.icon className="size-3.5" />
                        {v.label}
                      </button>
                    ))}
                    <Link
                      href="/rota/legacy"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
                      title="Every live shift on a calendar grid"
                    >
                      <Grid3x3 className="size-3.5" />
                      Shift calendar
                    </Link>
                  </div>
                </div>
              }
            >
              <div className="p-4">
                {view !== 'list' && !loading ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Button size="icon" variant="outline" className="size-8" onClick={() => stepFocus(-1)} aria-label="Previous period">
                        <ChevronLeft className="size-4" />
                      </Button>
                      <p className="text-sm font-semibold">{periodTitle(view, focusDate)}</p>
                      <Button size="icon" variant="outline" className="size-8" onClick={() => stepFocus(1)} aria-label="Next period">
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                    <RotaPeriodCalendar rotas={listedRotas} mode={view} focus={focusDate} today={todayKey()} />
                  </div>
                ) : loading ? (
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
                              <TableCell className={cn(unmarked > 0 && 'shadow-[inset_4px_0_0_0_#e11d48]')}>
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
                                    className="mt-1 mr-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 hover:underline dark:bg-amber-900/40 dark:text-amber-300"
                                    title={`${unpublished} ${unpublished === 1 ? 'person has' : 'people have'} shifts on this rota that were never published. Their shifts do not reach attendance, payroll or invoicing until they are.`}
                                  >
                                    <Send className="size-3" />
                                    {unpublished} staff rota unpublished
                                  </Link>
                                ) : null}
                                {unmarked > 0 ? (
                                  <Link
                                    href={`/rota/calendar?id=${r.id}`}
                                    className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 hover:underline dark:bg-rose-900/40 dark:text-rose-300"
                                    title={`${unmarked} shift${unmarked === 1 ? '' : 's'} in this rota have been and gone with no attendance marked. They count as unworked until they are marked.`}
                                  >
                                    <Clock className="size-3" />
                                    {unmarked} shift{unmarked === 1 ? '' : 's'} need attendance
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
                                  {canCreateRota ? (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="size-8"
                                      title="Duplicate"
                                      disabled={busy}
                                      onClick={() => onDuplicate(r)}
                                    >
                                      <Copy className="size-4" />
                                    </Button>
                                  ) : null}
                                  {canEditRota ? (
                                    <Button size="icon" variant="ghost" className="size-8" title="Edit rota" asChild>
                                      <Link href={`/rota/calendar?id=${r.id}`}>
                                        <Pencil className="size-4" />
                                      </Link>
                                    </Button>
                                  ) : null}
                                  {canDeleteRota ? (
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="size-8 text-red-600 hover:text-red-700"
                                      title="Delete"
                                      disabled={busy}
                                      onClick={() => onDelete(r.id, r.name)}
                                    >
                                      <Trash2 className="size-4" />
                                    </Button>
                                  ) : null}
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
                {view === 'list' && total > 0 ? (
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
                {
                  key: 'reports',
                  title: 'Reports',
                  description: 'Shift coverage, hours and attendance across any period.',
                  icon: BarChart3,
                  tone: 'warning',
                  action: { label: 'Open reports', href: '/reports' },
                },
              ]}
            />
            <Dialog open={copyOpen} onOpenChange={(o) => { if (!copyBusy) setCopyOpen(o); }}>
              <DialogContent showCloseButton className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Duplicate rota</DialogTitle>
                  <DialogDescription>
                    {copySource
                      ? `Copying “${copySource.name}” (${copySource.start_date} – ${copySource.end_date}). Choose when the copy starts — the shift pattern moves with it.`
                      : null}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="copy-name">Name</Label>
                    <Input
                      id="copy-name"
                      value={copyName}
                      onChange={(e) => setCopyName(e.target.value)}
                      placeholder="Rota name"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="copy-start">Starts on</Label>
                      <Input
                        id="copy-start"
                        type="date"
                        value={copyStart}
                        onChange={(e) => setCopyStart(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="copy-days">Days</Label>
                      <Input
                        id="copy-days"
                        type="number"
                        min={1}
                        max={90}
                        value={copyDays}
                        onChange={(e) => setCopyDays(e.target.value)}
                      />
                    </div>
                  </div>
                  {copyStart && Number(copyDays) >= 1 ? (
                    <p className="text-xs text-muted-foreground">
                      New period: {copyStart} – {addDays(copyStart, Math.max(0, Math.round(Number(copyDays)) - 1))}
                    </p>
                  ) : null}
                  <label className="flex items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-primary"
                      checked={copyIncludeAttendance}
                      onChange={(e) => setCopyIncludeAttendance(e.target.checked)}
                    />
                    <span>
                      Copy attendance, notes and adjustments
                      <span className="block text-xs text-muted-foreground">
                        Off by default — a future period starts with a clean slate.
                      </span>
                    </span>
                  </label>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" disabled={copyBusy} onClick={() => setCopyOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" disabled={copyBusy} onClick={submitCopy}>
                    {copyBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                    Duplicate
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
