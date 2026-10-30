'use client';
import { InlineKpiTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { storageGet, storageRemove, storageSet } from '@/lib/safe-storage';
import type { Payroll, Guard, PayrollPreview } from '@/lib/types';
import { ATT_LABELS, HoursCell, PayPreviewDetail } from './pay-preview';
import { formatMoney } from '@/lib/rota-shifts-utils';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { ModulePage } from '@/components/module-layout';
import {
  DashboardHeader,
  Pill,
  RecordAvatar,
  ResultsCard,
  QuickLinks,
  RowActionsMenu,
  ShowingCount,
  StatCards,
  type StatCardSpec,
} from '@/components/module-dashboard';
import { PoundSterling, Download, Trash2, Pencil, Eye, FileInput, FileText, Search, Calculator, Banknote, ChevronLeft, ChevronRight, Clock, Gift, Users } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
import {
  EMPTY_WORK_FILTERS,
  WorkFilterBar,
  describeWorkFilters,
  hasWorkFilters,
  toWorkFilterParams,
  useWorkFilterOptions,
  type WorkFilterValues,
} from '@/components/work-filter-bar';

const PAYMENT_MODE_LABELS: Record<string, string> = {
  '100_bank': '100% Bank',
  '100_cash': '100% Cash',
  split: 'Bank + Cash Split',
};

/** The filters the currently displayed records were fetched with. */
type PayrollQuery = { search: string; from: string; to: string; filters: WorkFilterValues };

const EMPTY_QUERY: PayrollQuery = {
  search: '',
  from: '',
  to: '',
  filters: EMPTY_WORK_FILTERS,
};

/** useTableList always takes a search accessor; the server has already filtered. */
const NO_CLIENT_SEARCH = () => '';

function describeQuery(q: PayrollQuery, options: Parameters<typeof describeWorkFilters>[1]) {
  const parts: string[] = [];
  if (q.search) parts.push(`“${q.search}”`);
  if (q.from && q.to) parts.push(`${q.from} to ${q.to}`);
  else if (q.from) parts.push(`from ${q.from}`);
  else if (q.to) parts.push(`up to ${q.to}`);
  parts.push(...describeWorkFilters(q.filters, options));
  return parts.join(' · ');
}

/**
 * The last payroll search and pay calculation stay on screen until the user presses
 * Clear — across navigation, refresh, new tabs and closing the browser. Only the search
 * inputs are kept, per user, and the rows are fetched again on arrival, so nothing
 * about pay itself is left in the browser.
 */
const PREVIEW_STORE_KEY = 'controlops.payroll.preview';

type PreviewQuery = { guard: string; start: string; end: string; filters: WorkFilterValues };

const storeKey = (base: string, uid: string | number) => `${base}.${uid}`;

function loadStored<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = storageGet(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function store(key: string, value: unknown) {
  if (typeof window === 'undefined') return;
  if (value) storageSet(key, JSON.stringify(value));
  else storageRemove(key);
}

function loadStoredPreview(uid: string | number): PreviewQuery | null {
  const p = loadStored<Partial<PreviewQuery>>(storeKey(PREVIEW_STORE_KEY, uid));
  if (!p?.guard || !p.start || !p.end) return null;
  return { guard: p.guard, start: p.start, end: p.end, filters: { ...EMPTY_WORK_FILTERS, ...(p.filters ?? {}) } };
}

/** Hands a fetched file to the browser. Blob, not a bare link: the API needs the auth header. */
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function payableAmount(p: Payroll) {
  return (p.bank_amount ?? 0) + (p.cash_amount ?? 0);
}

export default function PayrollPage() {
  const router = useRouter();
  // The API is the real boundary; these stop the UI offering actions it
  // already knows the role will be refused.
  const { user: permUser } = useAuth();
  const uid = permUser?.id;
  const canCreateMod = canModule(permUser, 'payroll', 'create');
  const canEditMod = canModule(permUser, 'payroll', 'edit');
  const canDeleteMod = canModule(permUser, 'payroll', 'delete');
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [loading, setLoading] = useState(false);
  // Nothing is fetched until Search is pressed: the records only mean something next to
  // the period you asked for, and a company-wide dump is both slow and misleading as a
  // starting point. Everything on screen — totals, table, exports — is that one result set.
  const [hasSearched, setHasSearched] = useState(false);
  const [appliedQuery, setAppliedQuery] = useState<PayrollQuery>(EMPTY_QUERY);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcMode, setCalcMode] = useState<'employee' | 'site' | 'client' | 'rota'>('employee');
  const [calcGuardId, setCalcGuardId] = useState('');
  const [calcSiteId, setCalcSiteId] = useState('');
  const [calcRotaId, setCalcRotaId] = useState('');
  const [calcClientId, setCalcClientId] = useState('');
  // Optional narrowing on top of the chosen anchor, e.g. only the cleaners on a client.
  const [calcNarrow, setCalcNarrow] = useState<WorkFilterValues>(EMPTY_WORK_FILTERS);
  const [calcStart, setCalcStart] = useState('');
  const [calcEnd, setCalcEnd] = useState('');
  const [calcPaymentMode, setCalcPaymentMode] = useState('100_bank');
  const [calcLoading, setCalcLoading] = useState(false);
  // Live "what is this person owed" lookup. Saves nothing — it reads the rota every
  // time, so correcting a rate or an attendance mark shows up on the next search.
  const [pvGuardId, setPvGuardId] = useState('all');
  const [pvStart, setPvStart] = useState('');
  const [pvEnd, setPvEnd] = useState('');
  const [pvLoading, setPvLoading] = useState(false);
  // The preview keeps its own copy of the shared filters: it is a live read of the rota,
  // not of the saved records the table below shows, and the two are searched separately.
  const [pvFilters, setPvFilters] = useState<WorkFilterValues>(EMPTY_WORK_FILTERS);
  const [pvAppliedFilters, setPvAppliedFilters] = useState<WorkFilterValues>(EMPTY_WORK_FILTERS);
  const [preview, setPreview] = useState<PayrollPreview | null>(null);
  // Breakdown opens in its own window over the all-employees result, so the list stays
  // put and Previous / Next walk through it without recalculating the whole company.
  const [bdGuardId, setBdGuardId] = useState<number | null>(null);
  const [breakdown, setBreakdown] = useState<PayrollPreview | null>(null);
  const [bdLoading, setBdLoading] = useState(false);
  const canRota = canModule(permUser, 'rota', 'view');

  const runPreview = async (restore?: PreviewQuery) => {
    const who = restore?.guard ?? pvGuardId;
    const start = restore?.start ?? pvStart;
    const end = restore?.end ?? pvEnd;
    const filters = restore?.filters ?? pvFilters;
    if (!who || !start || !end) return;
    setPvLoading(true);
    try {
      const result = await api.payroll.preview(
        start,
        end,
        who === 'all' ? undefined : parseInt(who, 10),
        toWorkFilterParams(filters)
      );
      setPvAppliedFilters(filters);
      setPreview(result);
      if (uid) store(storeKey(PREVIEW_STORE_KEY, uid), { guard: who, start, end, filters });
      setPage(1);
      void fetchPayrolls({
        search: '',
        from: start,
        to: end,
        filters: { ...filters, guard: who === 'all' ? '' : who },
      });
    } catch (e) {
      setPreview(null);
      toast.error(e instanceof Error ? e.message : 'Could not calculate pay for that period');
    } finally {
      setPvLoading(false);
    }
  };

  const openBreakdown = async (guardId: number) => {
    if (!preview) return;
    setBdGuardId(guardId);
    setBdLoading(true);
    try {
      setBreakdown(
        await api.payroll.preview(
          preview.period_start,
          preview.period_end,
          guardId,
          toWorkFilterParams(pvAppliedFilters)
        )
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load that breakdown');
    } finally {
      setBdLoading(false);
    }
  };

  const closeBreakdown = () => {
    setBdGuardId(null);
    setBreakdown(null);
  };

  const bdOrder = preview?.guard_id === null ? preview.by_employee : [];
  const bdIndex = bdOrder.findIndex((e) => e.guard_id === bdGuardId);
  const bdPrev = bdIndex > 0 ? bdOrder[bdIndex - 1] : null;
  const bdNext = bdIndex >= 0 && bdIndex < bdOrder.length - 1 ? bdOrder[bdIndex + 1] : null;

  useEffect(() => {
    if (bdGuardId === null) return;
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (ev.key === 'ArrowLeft' && bdPrev && !bdLoading) void openBreakdown(bdPrev.guard_id);
      if (ev.key === 'ArrowRight' && bdNext && !bdLoading) void openBreakdown(bdNext.guard_id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bdGuardId, bdPrev, bdNext, bdLoading]);

  const previewFileName = (p: PayrollPreview, ext: string) =>
    `pay-${(p.guard_id !== null ? p.guard_name : 'all-employees').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${p.period_start}-to-${p.period_end}.${ext}`;

  const exportPreviewCsv = (p: PayrollPreview) => {
    const head = ['Employee', 'Date', 'Site', 'Start', 'End', 'Break mins', 'Hours', 'Attendance', 'Rate', 'Paid'];
    const body = p.shifts.map((s) => [
      s.guard_name, s.date, s.site_name, s.shift_start ?? '', s.shift_end ?? '', s.break_minutes,
      s.hours, ATT_LABELS[s.attendance_status] ?? s.attendance_status,
      s.shift_rate ?? '', s.amount,
    ]);
    const csv = [head, ...body, [], ['Total hours', p.rota_hours], ['Attended hours', p.attended_hours],
      ['Total paid', p.amount]]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), previewFileName(p, 'csv'));
    toast.success(p.guard_id !== null ? 'Breakdown exported' : 'CSV exported');
  };

  const exportPreviewPdf = async (p: PayrollPreview) => {
    try {
      const blob = await api.payroll.previewPdf(
        p.period_start,
        p.period_end,
        p.guard_id ?? undefined,
        toWorkFilterParams(pvAppliedFilters)
      );
      saveBlob(blob, previewFileName(p, 'pdf'));
      toast.success(p.guard_id !== null ? 'Breakdown PDF exported' : 'PDF exported');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF export failed');
    }
  };
  const [sites, setSites] = useState<Awaited<ReturnType<typeof api.sites.list>>>([]);
  const [rotas, setRotas] = useState<Awaited<ReturnType<typeof api.rotaPlans.list>>>([]);
  const filterOptions = useWorkFilterOptions();
  const [exportOpen, setExportOpen] = useState(false);
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [viewRec, setViewRec] = useState<Payroll | null>(null);
  const [editRec, setEditRec] = useState<Payroll | null>(null);
  const [editHours, setEditHours] = useState('');
  const [editRate, setEditRate] = useState('');
  const [editBank, setEditBank] = useState('');
  const [editCash, setEditCash] = useState('');
  const [editAllowances, setEditAllowances] = useState('');
  const [editMode, setEditMode] = useState('100_bank');
  const [editStart, setEditStart] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const guardMap = useMemo(() => new Map(guards.map((g) => [g.id, g.full_name])), [guards]);

  const fetchPayrolls = useCallback(async (q: PayrollQuery) => {
    setLoading(true);
    try {
      setPayrolls(
        await api.payroll.list({
          ...toWorkFilterParams(q.filters),
          ...(q.search ? { search: q.search } : {}),
          ...(q.from ? { period_start: q.from } : {}),
          ...(q.to ? { period_end: q.to } : {}),
        })
      );
      setAppliedQuery(q);
      setHasSearched(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not load payroll records');
    } finally {
      setLoading(false);
    }
  }, []);

  /** Re-runs whatever is on screen. No-op before the first search — nothing to refresh. */
  const reloadCurrent = useCallback(() => {
    if (!hasSearched) return;
    void fetchPayrolls(appliedQuery);
  }, [hasSearched, appliedQuery, fetchPayrolls]);

  // The last calculation, and the records that follow it, are re-run on arrival, so coming
  // back to Payroll shows the same rows rather than an empty screen. Once per user:
  // re-running on every change would fight whatever the user has since typed.
  const restoredFor = useRef<string | number | null>(null);
  useEffect(() => {
    if (!uid || restoredFor.current === uid) return;
    restoredFor.current = uid;
    const pv = loadStoredPreview(uid);
    if (pv) {
      setPvGuardId(pv.guard);
      setPvStart(pv.start);
      setPvEnd(pv.end);
      setPvFilters(pv.filters);
      void runPreview(pv);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  useEffect(() => {
    api.guards.list().then(setGuards).catch(() => {});
    api.sites.list().then(setSites).catch(() => {});
    api.rotaPlans.list().then(setRotas).catch(() => {});
  }, []);

  const applyModeSplit = useCallback((mode: string, hours: number, rate: number, allowances: number, currentBank?: string, currentCash?: string, rotaAmount?: number) => {
    const base = rotaAmount ?? (hours * rate + allowances);
    if (mode === '100_cash') {
      return { bank: '0', cash: base.toFixed(2) };
    }
    if (mode === 'split') {
      const bank = parseFloat(currentBank ?? '0') || 0;
      const cash = parseFloat(currentCash ?? '0') || 0;
      if (bank === 0 && cash === 0) {
        return { bank: (base / 2).toFixed(2), cash: (base / 2).toFixed(2) };
      }
      return { bank: String(bank), cash: String(cash) };
    }
    return { bank: base.toFixed(2), cash: '0' };
  }, []);

  const handleImportFromRota = async () => {
    if (!calcStart || !calcEnd) return;
    if (calcMode === 'employee' && !calcGuardId) return;
    if (calcMode === 'site' && !calcSiteId) return;
    if (calcMode === 'client' && !calcClientId) return;
    if (calcMode === 'rota' && !calcRotaId) return;
    setCalcLoading(true);
    try {
      let imported: Payroll[] = [];
      const narrow = toWorkFilterParams(calcNarrow);
      if (calcMode === 'employee' && !hasWorkFilters(calcNarrow)) {
        const rec = await api.payroll.calculate(parseInt(calcGuardId, 10), calcStart, calcEnd);
        imported = [rec];
      } else {
        imported = await api.payroll.calculateBatch({
          mode: calcMode,
          period_start: calcStart,
          period_end: calcEnd,
          ...narrow,
          ...(calcMode === 'employee' ? { guard_id: parseInt(calcGuardId, 10) } : {}),
          ...(calcMode === 'site' ? { site_id: parseInt(calcSiteId, 10) } : {}),
          ...(calcMode === 'client' ? { client_id: parseInt(calcClientId, 10) } : {}),
          ...(calcMode === 'rota' ? { rota_plan_id: parseInt(calcRotaId, 10) } : {}),
        });
      }
      if (!imported.length) {
        toast.error('No payroll records found — check the published rota has On Time, Late, or Cancelled - Paid shifts in this period');
      } else {
        for (const rec of imported) {
          const split = applyModeSplit(
            calcPaymentMode,
            rec.total_hours,
            rec.hourly_rate,
            rec.allowance_total,
            undefined,
            undefined,
            (rec.bank_amount ?? 0) + (rec.cash_amount ?? 0)
          );
          await api.payroll.update(rec.id, {
            payment_mode: calcPaymentMode,
            bank_amount: parseFloat(split.bank),
            cash_amount: parseFloat(split.cash),
          });
        }
        toast.success(`Imported ${imported.length} payroll record(s) from rota`);
      }
      setCalcOpen(false);
      setCalcGuardId('');
      setCalcSiteId('');
      setCalcRotaId('');
      setCalcClientId('');
      setCalcNarrow(EMPTY_WORK_FILTERS);
      setCalcStart('');
      setCalcEnd('');
      setCalcPaymentMode('100_bank');
      reloadCurrent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import from rota failed');
    } finally {
      setCalcLoading(false);
    }
  };

  const handleDelete = (id: number) => {
    toast.confirm('Delete this payroll record?', async () => {
      try {
        await api.payroll.delete(id);
        reloadCurrent();
        toast.success('Payroll record deleted');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      }
    }, { label: 'Delete', description: 'This cannot be undone.' });
  };

  const openEdit = (p: Payroll) => {
    setEditRec(p);
    setEditHours(String(p.total_hours ?? 0));
    setEditRate(String(p.hourly_rate ?? 0));
    setEditBank(String(p.bank_amount ?? 0));
    setEditCash(String(p.cash_amount ?? 0));
    setEditAllowances(String(p.allowance_total ?? 0));
    setEditMode(p.payment_mode || '100_bank');
    setEditStart(p.period_start);
    setEditEnd(p.period_end);
  };

  const handleEditSave = async () => {
    if (!editRec) return;
    const hours = parseFloat(editHours);
    const rate = parseFloat(editRate);
    const bank = parseFloat(editBank);
    const cash = parseFloat(editCash);
    const allowances = parseFloat(editAllowances);
    if ([hours, rate, bank, cash, allowances].some((n) => Number.isNaN(n) || n < 0)) {
      toast.error('Enter valid non-negative numbers');
      return;
    }
    if (!editStart || !editEnd) {
      toast.error('Period dates are required');
      return;
    }
    setEditSaving(true);
    try {
      await api.payroll.update(editRec.id, {
        period_start: editStart,
        period_end: editEnd,
        total_hours: hours,
        hourly_rate: rate,
        bank_amount: bank,
        cash_amount: cash,
        allowance_total: allowances,
        payment_mode: editMode,
      });
      setEditRec(null);
      reloadCurrent();
      toast.success('Payroll updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setEditSaving(false);
    }
  };

  /** What Clear search does: forget the search and calculation, here and in storage. */
  const clearSearch = useCallback(() => {
    setAppliedQuery(EMPTY_QUERY);
    setPayrolls([]);
    setHasSearched(false);
    setPreview(null);
    closeBreakdown();
    setPage(1);
    if (uid) store(storeKey(PREVIEW_STORE_KEY, uid), null);
  }, [uid]);

  const getSortValue = useCallback(
    (p: Payroll, key: string) => {
      switch (key) {
        case 'guard':
          return guardMap.get(p.guard_id) ?? '';
        case 'period':
          return p.period_start;
        case 'hours':
          return p.total_hours;
        case 'rate':
          return p.hourly_rate;
        case 'bank':
          return p.bank_amount;
        case 'cash':
          return p.cash_amount;
        case 'allowances':
          return p.allowance_total;
        case 'payable':
          return payableAmount(p);
        case 'mode':
          return p.payment_mode || '';
        default:
          return '';
      }
    },
    [guardMap]
  );

  // Filtering is the API's job now, so the list goes in unfiltered — sorting and paging
  // only. An empty search term keeps useTableList from re-filtering what the server sent.
  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    payrolls,
    '',
    sortKey,
    sortDir,
    page,
    pageSize,
    NO_CLIENT_SEARCH,
    getSortValue
  );

  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);

  const summaryRows = payrolls;
  const totalBank = summaryRows.reduce((sum, p) => sum + p.bank_amount, 0);
  const totalCash = summaryRows.reduce((sum, p) => sum + p.cash_amount, 0);
  const totalAllowances = summaryRows.reduce((sum, p) => sum + p.allowance_total, 0);
  const totalPayable = totalBank + totalCash;
  const totalHours = summaryRows.reduce((sum, p) => sum + (p.total_hours ?? 0), 0);
  const employeeCount = new Set(summaryRows.map((p) => p.guard_id)).size;

  /** The cards along the top, in the shape every module dashboard uses. Total pay leads,
   *  because that is the number this screen exists to produce. */
  const statCards: StatCardSpec[] = [
    {
      key: 'payable',
      label: 'Total pay',
      value: formatMoney(totalPayable),
      icon: PoundSterling,
      tone: 'warning',
      caption: hasSearched ? 'bank + cash, this search' : 'calculate to load records',
    },
    {
      key: 'employees',
      label: 'Employees',
      value: employeeCount,
      icon: Users,
      tone: 'neutral',
      caption: `${payrolls.length} record${payrolls.length === 1 ? '' : 's'}`,
    },
    {
      key: 'hours',
      label: 'Total hours',
      value: totalHours.toFixed(2),
      icon: Calculator,
      tone: 'info',
    },
    {
      key: 'split',
      label: 'Bank / cash',
      value: `${formatMoney(totalBank)} / ${formatMoney(totalCash)}`,
      icon: Banknote,
      tone: 'positive',
      caption: 'how it is paid out',
    },
    {
      key: 'allowances',
      label: 'Allowances',
      value: formatMoney(totalAllowances),
      icon: Gift,
      tone: 'muted',
      caption: 'included in total pay',
    },
  ];

  // Exports exactly the rows the table is showing — the current search result, every page
  // of it — so the file can never disagree with the screen it was taken from.
  const exportCsv = () => {
    if (!payrolls.length) {
      toast.error('Nothing to export — search for records first');
      return;
    }
    const headers = ['Guard', 'Period Start', 'Period End', 'Hours', 'Rate', 'Bank', 'Cash', 'Allowances', 'Payable', 'Payment Mode'];
    const lines = [headers.join(',')];
    for (const p of payrolls) {
      lines.push(
        [
          guardMap.get(p.guard_id) ?? `Guard #${p.guard_id}`,
          p.period_start,
          p.period_end,
          (p.total_hours ?? 0).toFixed(2),
          (p.hourly_rate ?? 0).toFixed(2),
          (p.bank_amount ?? 0).toFixed(2),
          (p.cash_amount ?? 0).toFixed(2),
          (p.allowance_total ?? 0).toFixed(2),
          payableAmount(p).toFixed(2),
          PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      );
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-export${appliedQuery.from ? `-${appliedQuery.from}` : ''}${appliedQuery.to ? `-to-${appliedQuery.to}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
    toast.success(`Exported ${payrolls.length} record${payrolls.length === 1 ? '' : 's'}`);
  };

  const exportRecordsPdf = async () => {
    if (!payrolls.length) {
      toast.error('Nothing to export — search for records first');
      return;
    }
    try {
      // Rebuilt server-side from the same filters, so the file matches the screen.
      const blob = await api.payroll.exportPdf({
        ...toWorkFilterParams(appliedQuery.filters),
        ...(appliedQuery.search ? { search: appliedQuery.search } : {}),
        ...(appliedQuery.from ? { period_start: appliedQuery.from } : {}),
        ...(appliedQuery.to ? { period_end: appliedQuery.to } : {}),
      });
      saveBlob(
        blob,
        `payroll-export${appliedQuery.from ? `-${appliedQuery.from}` : ''}${appliedQuery.to ? `-to-${appliedQuery.to}` : ''}.pdf`
      );
      setExportOpen(false);
      toast.success(`Exported ${payrolls.length} record${payrolls.length === 1 ? '' : 's'} as PDF`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF export failed');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <DashboardHeader
            title="Payroll"
            hint="Records are imported from published rota hours. Payable shifts are On Time, Late, and Cancelled - Paid (agreed hours). Rota'd and attended totals are shown side by side."
            description={
              hasSearched
                ? `${payrolls.length} payroll record${payrolls.length !== 1 ? 's' : ''} for this search`
                : 'Calculate a period below to load its payroll records. Import payable hours from the rota, then edit anything that needs correcting.'
            }
            actions={
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={clearSearch}
                  disabled={loading || pvLoading}
                  title="Clear the last payroll search and pay calculation"
                >
                  {loading || pvLoading ? 'Loading...' : 'Clear search'}
                </Button>
                <Button variant="outline" onClick={exportCsv} disabled={!payrolls.length}>
                  <Download className="size-4 mr-2" />
                  Export CSV
                </Button>
                <Button variant="outline" onClick={() => void exportRecordsPdf()} disabled={!payrolls.length}>
                  <FileText className="size-4 mr-2" />
                  Export PDF
                </Button>
                <Dialog open={exportOpen} onOpenChange={setExportOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" disabled={!payrolls.length}>
                      <Download className="size-4 mr-2" />
                      Export…
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Export payroll CSV</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">
                        The file contains exactly the records your current search returned — every page of
                        them, not just the one on screen. To export something else, change the filters and
                        search again.
                      </p>
                      <dl className="rounded-md border p-3 text-sm space-y-1">
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Filters</dt>
                          <dd className="text-right font-medium">{describeQuery(appliedQuery, filterOptions) || 'None — all records'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Records</dt>
                          <dd className="text-right font-medium">{payrolls.length}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Total payable</dt>
                          <dd className="text-right font-medium">{formatMoney(totalPayable)}</dd>
                        </div>
                      </dl>
                      <div className="grid grid-cols-2 gap-2">
                        <Button onClick={exportCsv} disabled={!payrolls.length}>
                          <Download className="size-4 mr-2" />
                          CSV ({payrolls.length})
                        </Button>
                        <Button variant="outline" onClick={() => void exportRecordsPdf()} disabled={!payrolls.length}>
                          <FileText className="size-4 mr-2" />
                          PDF ({payrolls.length})
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
                  {canCreateMod ? (
                    <DialogTrigger asChild>
                      <Button>
                        <FileInput className="size-4 mr-2" />
                        Import from Rota
                      </Button>
                    </DialogTrigger>
                  ) : null}
                  <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Import from Rota</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <p className="text-sm text-muted-foreground">
                        Pay is already calculated on the published rota. This imports those payable hours and amounts into payroll records — it does not recalculate rates. Use Edit on a record if anything needs correcting.
                      </p>
                      <div className="space-y-1">
                        <Label>Import by</Label>
                        <Select
                          value={calcMode}
                          onValueChange={(v) => setCalcMode(v as 'employee' | 'site' | 'client' | 'rota')}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="employee">Individual employee</SelectItem>
                            <SelectItem value="site">By site (all staff on site)</SelectItem>
                            <SelectItem value="client">By client (all of the client&rsquo;s sites)</SelectItem>
                            <SelectItem value="rota">By rota (all staff on rota)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {calcMode === 'employee' ? (
                        <div className="space-y-1">
                          <Label>Employee <span className="text-destructive">*</span></Label>
                          <SearchableSelect
                            value={calcGuardId}
                            onChange={setCalcGuardId}
                            options={guards.map((g) => ({ value: String(g.id), label: g.full_name }))}
                            placeholder="Select employee"
                            searchPlaceholder="Search staff…"
                            emptyText="No staff found"
                          />
                        </div>
                      ) : calcMode === 'site' ? (
                        <div className="space-y-1">
                          <Label>Site <span className="text-destructive">*</span></Label>
                          <SearchableSelect
                            value={calcSiteId}
                            onChange={setCalcSiteId}
                            options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
                            placeholder="Select site"
                            searchPlaceholder="Search sites…"
                            emptyText="No sites found"
                          />
                        </div>
                      ) : calcMode === 'client' ? (
                        <div className="space-y-1">
                          <Label>Client <span className="text-destructive">*</span></Label>
                          <SearchableSelect
                            value={calcClientId}
                            onChange={setCalcClientId}
                            options={filterOptions.clients}
                            placeholder="Select client"
                            searchPlaceholder="Search clients…"
                            emptyText="No clients found"
                          />
                          <p className="text-xs text-muted-foreground">
                            Covers every site assigned to this client &mdash; there is no need to import each one.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Label>Rota <span className="text-destructive">*</span></Label>
                          <SearchableSelect
                            value={calcRotaId}
                            onChange={setCalcRotaId}
                            options={rotas.map((r) => ({ value: String(r.id), label: r.name }))}
                            placeholder="Select rota"
                            searchPlaceholder="Search rotas…"
                            emptyText="No rotas found"
                          />
                        </div>
                      )}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Period Start <span className="text-destructive">*</span></Label>
                          <Input type="date" value={calcStart} onChange={(e) => setCalcStart(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Period End <span className="text-destructive">*</span></Label>
                          <Input type="date" value={calcEnd} onChange={(e) => setCalcEnd(e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Payment mode</Label>
                        <Select value={calcPaymentMode} onValueChange={setCalcPaymentMode}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(PAYMENT_MODE_LABELS).map(([k, label]) => (
                              <SelectItem key={k} value={k}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Splits the imported rota payable into bank and/or cash. Existing records for the same guard and period are updated, not duplicated.
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label>Narrow by (optional)</Label>
                        <WorkFilterBar
                          value={calcNarrow}
                          onChange={setCalcNarrow}
                          options={filterOptions}
                          keys={
                            calcMode === 'client'
                              ? ['site', 'contractor', 'subContractor', 'guard', 'jobTitle']
                              : ['client', 'contractor', 'subContractor', 'jobTitle']
                          }
                          className="flex flex-wrap items-center gap-2 pt-1"
                        />
                      </div>
                      <Button
                        className="w-full"
                        onClick={() => void handleImportFromRota()}
                        disabled={
                          calcLoading ||
                          !calcStart ||
                          !calcEnd ||
                          (calcMode === 'employee' && !calcGuardId) ||
                          (calcMode === 'site' && !calcSiteId) ||
                          (calcMode === 'client' && !calcClientId) ||
                          (calcMode === 'rota' && !calcRotaId)
                        }
                      >
                        {calcLoading ? 'Importing…' : 'Import from Rota'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            }
          />

          <StatCards cards={statCards} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calculator className="size-4" /> Employee hours &amp; pay
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Pick a date range to see what everyone is owed, or narrow it to one person. Pay follows
                attendance &mdash; On Time, Late, and Cancelled - Paid (agreed hours) are paid, and the
                rota&rsquo;d total is shown beside it so you can see anything that was missed. Nothing is saved.
              </p>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1 min-w-56">
                  <Label>Employee</Label>
                  <SearchableSelect
                    value={pvGuardId}
                    onChange={setPvGuardId}
                    options={guards.map((g) => ({ value: String(g.id), label: g.full_name }))}
                    noneOption={{ value: 'all', label: 'All employees' }}
                    placeholder="Select employee"
                    searchPlaceholder="Search staff…"
                  />
                </div>
                <div className="space-y-1">
                  <Label>From</Label>
                  <Input type="date" value={pvStart} onChange={(e) => setPvStart(e.target.value)} className="min-w-0 w-full sm:w-auto" />
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <Input type="date" value={pvEnd} onChange={(e) => setPvEnd(e.target.value)} className="min-w-0 w-full sm:w-auto" />
                </div>
                <div className="space-y-1 w-full">
                  <Label>Filter by</Label>
                  {/* Same six filters as the records search below; a client covers all
                      of its sites, so the run does not have to name them one by one. */}
                  <WorkFilterBar
                    value={pvFilters}
                    onChange={setPvFilters}
                    options={filterOptions}
                    keys={['client', 'site', 'contractor', 'subContractor', 'jobTitle']}
                    disabled={pvLoading}
                    className="flex flex-wrap items-center gap-2"
                  />
                </div>
                <Button
                  type="button"
                  onClick={() => void runPreview()}
                  disabled={pvLoading || !pvGuardId || !pvStart || !pvEnd}
                >
                  <Search className="size-4 mr-1.5" />
                  {pvLoading ? 'Calculating\u2026' : 'Calculate'}
                </Button>
                {preview && (
                  <>
                    <Button type="button" variant="outline" onClick={() => exportPreviewCsv(preview)}>
                      <Download className="size-4 mr-1.5" />
                      Export CSV
                    </Button>
                    <Button type="button" variant="outline" onClick={() => void exportPreviewPdf(preview)}>
                      <FileText className="size-4 mr-1.5" />
                      Export PDF
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearSearch}
                    >
                      Clear
                    </Button>
                  </>
                )}
              </div>

              {preview && (
                <PayPreviewDetail preview={preview} canRota={canRota}>
                  {preview.guard_id === null && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">By employee</h4>
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Employee</TableHead>
                              <TableHead className="text-right">Shifts</TableHead>
                              <TableHead className="text-right">Total hours</TableHead>
                              <TableHead className="text-right">Attended hours</TableHead>
                              <TableHead className="text-right">Pay</TableHead>
                              <TableHead />
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {preview.by_employee.map((e) => (
                              <TableRow
                                key={e.guard_id}
                                className={cn(
                                  'cursor-pointer',
                                  e.unmarked_shifts > 0 && 'bg-rose-50/70 dark:bg-rose-950/25'
                                )}
                                onClick={() => void openBreakdown(e.guard_id)}
                              >
                                <TableCell className="font-medium">
                                  {e.guard_name}
                                  {e.unmarked_shifts > 0 ? (
                                    <span
                                      className="ml-2 inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800 dark:bg-rose-900/40 dark:text-rose-300"
                                      title={`${e.unmarked_shifts} shift${e.unmarked_shifts === 1 ? '' : 's'} with no attendance marked (${e.unmarked_hours.toFixed(2)} hrs)`}
                                    >
                                      <Clock className="size-3" />
                                      {e.unmarked_shifts} unmarked
                                    </span>
                                  ) : null}
                                </TableCell>
                                <TableCell className="text-right tabular-nums">{e.shifts}</TableCell>
                                <TableCell className="text-right tabular-nums">{e.rota_hours.toFixed(2)}</TableCell>
                                <TableCell className="text-right tabular-nums">
                                  <HoursCell attended={e.attended_hours} missed={e.unattended_hours} upcoming={e.upcoming_hours} />
                                </TableCell>
                                <TableCell className="text-right tabular-nums font-semibold">{formatMoney(e.amount)}</TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      void openBreakdown(e.guard_id);
                                    }}
                                    title={`See every shift for ${e.guard_name}`}
                                  >
                                    Breakdown
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        Showing totals for {preview.employee_count} employees. Click a row or <strong>Breakdown</strong> for
                        that person&rsquo;s shift-by-shift detail, or <strong>Export CSV</strong> for every shift in one file.
                      </p>
                    </div>
                  )}
                </PayPreviewDetail>
              )}
            </CardContent>
          </Card>

          <ResultsCard
            title="Payroll records"
            count={hasSearched ? total : undefined}
            pageSize={pageSize}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          >
            <div className="p-4">
              {hasSearched && describeQuery(appliedQuery, filterOptions) ? (
                <p className="mb-3 text-sm text-muted-foreground">
                  Showing results for {describeQuery(appliedQuery, filterOptions)}
                </p>
              ) : null}
              {loading ? (
                <InlineKpiTableSkeleton />
              ) : !hasSearched ? (
                <div className="text-center py-12 text-muted-foreground">
                  Pick an employee and period above and press <strong>Calculate</strong> to load the saved payroll
                  records for the same period and filters.
                </div>
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {describeQuery(appliedQuery, filterOptions)
                    ? 'No records match your search.'
                    : 'No payroll records yet. Use “Import from Rota” to pull payable totals, then Edit if anything needs correcting.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Guard" colKey="guard" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Period" colKey="period" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Hours" colKey="hours" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Bank" colKey="bank" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Cash" colKey="cash" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Allowances" colKey="allowances" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Payable" colKey="payable" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Payment Mode" colKey="mode" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            <span className="flex items-center gap-2">
                              <RecordAvatar name={guardMap.get(p.guard_id) ?? `Guard ${p.guard_id}`} />
                              <span className="min-w-0">
                                <span className="block truncate">
                                  {guardMap.get(p.guard_id) ?? `Guard #${p.guard_id}`}
                                </span>
                                <span className="block text-xs font-normal text-muted-foreground tabular-nums">
                                  {(p.total_hours ?? 0).toFixed(2)}h @ {formatMoney(p.hourly_rate ?? 0)}
                                </span>
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {p.period_start} – {p.period_end}
                          </TableCell>
                          <TableCell>{(p.total_hours ?? 0).toFixed(2)}h</TableCell>
                          <TableCell className="font-medium">{formatMoney(p.bank_amount)}</TableCell>
                          <TableCell className="font-medium">{formatMoney(p.cash_amount)}</TableCell>
                          <TableCell>{formatMoney(p.allowance_total)}</TableCell>
                          <TableCell className="font-semibold">{formatMoney(payableAmount(p))}</TableCell>
                          <TableCell>
                            <Pill tone={p.payment_mode === '100_cash' ? 'info' : p.payment_mode === 'split' ? 'warning' : 'neutral'}>
                              {PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode}
                            </Pill>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                onClick={() => setViewRec(p)}
                                title="View record"
                              >
                                <Eye className="size-4" />
                              </Button>
                              <RowActionsMenu
                                actions={[
                                  { label: 'View record', icon: Eye, onSelect: () => setViewRec(p) },
                                  {
                                    label: 'Edit record',
                                    icon: Pencil,
                                    onSelect: () => openEdit(p),
                                    disabled: !canEditMod,
                                  },
                                  {
                                    label: 'Employee profile',
                                    icon: Users,
                                    onSelect: () => router.push(`/guards/${p.guard_id}`),
                                  },
                                  {
                                    label: 'Delete record',
                                    icon: Trash2,
                                    onSelect: () => handleDelete(p.id),
                                    destructive: true,
                                    disabled: !canDeleteMod,
                                  },
                                ]}
                                label={`Payroll record ${p.id} actions`}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {hasSearched && total > 0 ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <ShowingCount rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} noun="records" />
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
                key: 'rota',
                title: 'Rotas & shifts',
                description: 'Payable hours come from published rotas. Correct a shift there and re-import.',
                icon: Calculator,
                tone: 'neutral',
                action: { label: 'Open rotas', href: '/rota' },
              },
              {
                key: 'staff',
                title: 'Employee hub',
                description: 'Pay rates, contracted hours and bank details live on the staff record.',
                icon: Users,
                tone: 'info',
                action: { label: 'Open employees', href: '/guards' },
              },
              {
                key: 'reports',
                title: 'Reports',
                description: 'Hours, cost and attendance reports across any period.',
                icon: FileText,
                tone: 'positive',
                action: { label: 'View reports', href: '/reports' },
              },
            ]}
          />
        </ModulePage>

      <Dialog open={bdGuardId !== null} onOpenChange={(open) => !open && closeBreakdown()}>
        <DialogContent className="sm:max-w-6xl w-full max-h-[92dvh] p-0 gap-0 flex flex-col overflow-hidden">
          <DialogHeader className="border-b px-6 py-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3 pr-8">
              <div className="min-w-0">
                <DialogTitle className="truncate">
                  {breakdown?.guard_name ?? bdOrder[bdIndex]?.guard_name ?? 'Breakdown'}
                </DialogTitle>
                <DialogDescription>
                  {preview ? `${preview.period_start} to ${preview.period_end}` : ''}
                  {bdIndex >= 0 ? ` · employee ${bdIndex + 1} of ${bdOrder.length}` : ''}
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!bdPrev || bdLoading}
                  onClick={() => bdPrev && void openBreakdown(bdPrev.guard_id)}
                  title={bdPrev ? `Previous: ${bdPrev.guard_name} (←)` : undefined}
                >
                  <ChevronLeft className="size-4 mr-1" />
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!bdNext || bdLoading}
                  onClick={() => bdNext && void openBreakdown(bdNext.guard_id)}
                  title={bdNext ? `Next: ${bdNext.guard_name} (→)` : undefined}
                >
                  Next
                  <ChevronRight className="size-4 ml-1" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!breakdown || bdLoading}
                onClick={() => breakdown && exportPreviewCsv(breakdown)}
              >
                <Download className="size-4 mr-1.5" />
                Export breakdown CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!breakdown || bdLoading}
                onClick={() => breakdown && void exportPreviewPdf(breakdown)}
              >
                <FileText className="size-4 mr-1.5" />
                Export breakdown PDF
              </Button>
              {bdGuardId !== null && (
                <Button asChild type="button" variant="ghost" size="sm">
                  <Link href={`/guards/${bdGuardId}`}>
                    <Users className="size-4 mr-1.5" />
                    Employee profile
                  </Link>
                </Button>
              )}
            </div>
          </DialogHeader>
          <div className={cn('flex-1 overflow-y-auto px-6 py-5', bdLoading && 'opacity-60 pointer-events-none')}>
            {breakdown ? (
              <PayPreviewDetail preview={breakdown} canRota={canRota} />
            ) : (
              <InlineKpiTableSkeleton />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewRec} onOpenChange={(open) => !open && setViewRec(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payroll details</DialogTitle>
          </DialogHeader>
          {viewRec && (
            <>
              <dl className="grid gap-3 text-sm">
                <div><dt className="text-muted-foreground">Guard</dt><dd className="font-medium">{guardMap.get(viewRec.guard_id) ?? `#${viewRec.guard_id}`}</dd></div>
                <div><dt className="text-muted-foreground">Period</dt><dd>{viewRec.period_start} – {viewRec.period_end}</dd></div>
                <div><dt className="text-muted-foreground">Hours</dt><dd>{(viewRec.total_hours ?? 0).toFixed(2)}</dd></div>
                <div><dt className="text-muted-foreground">Rate</dt><dd>{formatMoney(viewRec.hourly_rate)}/hr</dd></div>
                <div><dt className="text-muted-foreground">Bank</dt><dd>{formatMoney(viewRec.bank_amount)}</dd></div>
                <div><dt className="text-muted-foreground">Cash</dt><dd>{formatMoney(viewRec.cash_amount)}</dd></div>
                <div><dt className="text-muted-foreground">Allowances</dt><dd>{formatMoney(viewRec.allowance_total)}</dd></div>
                <div><dt className="text-muted-foreground">Payable</dt><dd className="font-semibold">{formatMoney(payableAmount(viewRec))}</dd></div>
                <div><dt className="text-muted-foreground">Payment mode</dt><dd>{PAYMENT_MODE_LABELS[viewRec.payment_mode] ?? viewRec.payment_mode}</dd></div>
              </dl>
              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => {
                    openEdit(viewRec);
                    setViewRec(null);
                  }}
                >
                  <Pencil className="size-4 mr-2" />
                  Edit
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editRec} onOpenChange={(open) => !open && setEditRec(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit payroll</DialogTitle>
          </DialogHeader>
          {editRec && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {guardMap.get(editRec.guard_id) ?? `Guard #${editRec.guard_id}`} — correct hours, rate, allowances, or bank/cash if the imported rota figures need a change.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Period start</Label>
                  <Input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Period end</Label>
                  <Input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Hours</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editHours}
                    onChange={(e) => {
                      setEditHours(e.target.value);
                      const h = parseFloat(e.target.value) || 0;
                      const r = parseFloat(editRate) || 0;
                      const a = parseFloat(editAllowances) || 0;
                      const split = applyModeSplit(editMode, h, r, a, editBank, editCash);
                      setEditBank(split.bank);
                      setEditCash(split.cash);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Hourly rate (£)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editRate}
                    onChange={(e) => {
                      setEditRate(e.target.value);
                      const h = parseFloat(editHours) || 0;
                      const r = parseFloat(e.target.value) || 0;
                      const a = parseFloat(editAllowances) || 0;
                      const split = applyModeSplit(editMode, h, r, a, editBank, editCash);
                      setEditBank(split.bank);
                      setEditCash(split.cash);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Allowances (£)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editAllowances}
                    onChange={(e) => {
                      setEditAllowances(e.target.value);
                      const h = parseFloat(editHours) || 0;
                      const r = parseFloat(editRate) || 0;
                      const a = parseFloat(e.target.value) || 0;
                      const split = applyModeSplit(editMode, h, r, a, editBank, editCash);
                      setEditBank(split.bank);
                      setEditCash(split.cash);
                    }}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Payment mode</Label>
                  <Select
                    value={editMode}
                    onValueChange={(v) => {
                      setEditMode(v);
                      const h = parseFloat(editHours) || 0;
                      const r = parseFloat(editRate) || 0;
                      const a = parseFloat(editAllowances) || 0;
                      const split = applyModeSplit(v, h, r, a);
                      setEditBank(split.bank);
                      setEditCash(split.cash);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PAYMENT_MODE_LABELS).map(([k, label]) => (
                        <SelectItem key={k} value={k}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Bank (£)</Label>
                  <Input type="number" min={0} step="0.01" value={editBank} onChange={(e) => setEditBank(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Cash (£)</Label>
                  <Input type="number" min={0} step="0.01" value={editCash} onChange={(e) => setEditCash(e.target.value)} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Changing hours, rate, allowances, or payment mode updates bank/cash automatically — you can still override those amounts before saving.
              </p>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditRec(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleEditSave()} disabled={editSaving}>
                  {editSaving ? 'Saving…' : 'Save changes'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
    </ProtectedRoute>
  );
}
