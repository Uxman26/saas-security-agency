'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Payroll, Guard } from '@/lib/types';
import { formatMoney } from '@/lib/rota-shifts-utils';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { PoundSterling, Calculator, Trash2, Pencil, Eye, Download } from 'lucide-react';
import { toast } from '@/lib/toast';

const PAYMENT_MODE_LABELS: Record<string, string> = {
  '100_bank': '100% Bank',
  '100_cash': '100% Cash',
  split: 'Bank + Cash Split',
};

function periodOverlaps(p: Payroll, from: string, to: string) {
  if (!from && !to) return true;
  const start = from || '0000-01-01';
  const end = to || '9999-12-31';
  return p.period_start <= end && p.period_end >= start;
}

function payableAmount(p: Payroll) {
  return (p.bank_amount ?? 0) + (p.cash_amount ?? 0);
}

export default function PayrollPage() {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [loading, setLoading] = useState(true);
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcMode, setCalcMode] = useState<'employee' | 'site' | 'rota'>('employee');
  const [calcGuardId, setCalcGuardId] = useState('');
  const [calcSiteId, setCalcSiteId] = useState('');
  const [calcRotaId, setCalcRotaId] = useState('');
  const [calcStart, setCalcStart] = useState('');
  const [calcEnd, setCalcEnd] = useState('');
  const [calcPaymentMode, setCalcPaymentMode] = useState('100_bank');
  const [calcLoading, setCalcLoading] = useState(false);
  const [sites, setSites] = useState<Awaited<ReturnType<typeof api.sites.list>>>([]);
  const [rotas, setRotas] = useState<Awaited<ReturnType<typeof api.rotaPlans.list>>>([]);
  const [search, setSearch] = useState('');
  const [exportFrom, setExportFrom] = useState('');
  const [exportTo, setExportTo] = useState('');
  const [exportSiteId, setExportSiteId] = useState('');
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

  const loadPayrolls = () => {
    setLoading(true);
    api.payroll.list().then(setPayrolls).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPayrolls();
    api.guards.list().then(setGuards).catch(() => {});
    api.sites.list().then(setSites).catch(() => {});
    api.rotaPlans.list().then(setRotas).catch(() => {});
  }, []);

  const applyModeSplit = useCallback((mode: string, hours: number, rate: number, allowances: number, currentBank?: string, currentCash?: string) => {
    const base = hours * rate + allowances;
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

  const handleCalculate = async () => {
    if (!calcStart || !calcEnd) return;
    if (calcMode === 'employee' && !calcGuardId) return;
    if (calcMode === 'site' && !calcSiteId) return;
    if (calcMode === 'rota' && !calcRotaId) return;
    setCalcLoading(true);
    try {
      let created: Payroll[] = [];
      if (calcMode === 'employee') {
        const rec = await api.payroll.calculate(parseInt(calcGuardId, 10), calcStart, calcEnd);
        created = [rec];
      } else {
        created = await api.payroll.calculateBatch({
          mode: calcMode,
          period_start: calcStart,
          period_end: calcEnd,
          ...(calcMode === 'site' ? { site_id: parseInt(calcSiteId, 10) } : {}),
          ...(calcMode === 'rota' ? { rota_plan_id: parseInt(calcRotaId, 10) } : {}),
        });
      }
      if (!created.length) {
        toast.error('No payroll records created — check assignments exist for this period');
      } else {
        for (const rec of created) {
          const split = applyModeSplit(calcPaymentMode, rec.total_hours, rec.hourly_rate, rec.allowance_total);
          await api.payroll.update(rec.id, {
            payment_mode: calcPaymentMode,
            bank_amount: parseFloat(split.bank),
            cash_amount: parseFloat(split.cash),
          });
        }
        toast.success(`Created ${created.length} payroll record(s)`);
      }
      setCalcOpen(false);
      setCalcGuardId('');
      setCalcSiteId('');
      setCalcRotaId('');
      setCalcStart('');
      setCalcEnd('');
      setCalcPaymentMode('100_bank');
      loadPayrolls();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payroll calculation failed');
    } finally {
      setCalcLoading(false);
    }
  };

  const handleDelete = (id: number) => {
    toast.confirm('Delete this payroll record?', async () => {
      try {
        await api.payroll.delete(id);
        loadPayrolls();
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
      loadPayrolls();
      toast.success('Payroll updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setEditSaving(false);
    }
  };

  const filteredPayrolls = useMemo(() => {
    let list = payrolls;
    if (exportFrom || exportTo) {
      list = list.filter((p) => periodOverlaps(p, exportFrom, exportTo));
    }
    return list;
  }, [payrolls, exportFrom, exportTo]);

  const getSearchText = useCallback(
    (p: Payroll) =>
      [guardMap.get(p.guard_id), p.period_start, p.period_end, String(p.total_hours), String(p.hourly_rate), String(p.bank_amount), String(p.cash_amount), p.payment_mode]
        .filter(Boolean)
        .join(' '),
    [guardMap]
  );
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

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    filteredPayrolls,
    search,
    sortKey,
    sortDir,
    page,
    pageSize,
    getSearchText,
    getSortValue
  );

  useEffect(() => {
    setPage(1);
  }, [search, exportFrom, exportTo]);
  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);

  const summaryRows = filteredPayrolls;
  const totalBank = summaryRows.reduce((sum, p) => sum + p.bank_amount, 0);
  const totalCash = summaryRows.reduce((sum, p) => sum + p.cash_amount, 0);
  const totalAllowances = summaryRows.reduce((sum, p) => sum + p.allowance_total, 0);
  const totalPayable = totalBank + totalCash;

  const exportCsv = () => {
    const headers = ['Guard', 'Period Start', 'Period End', 'Hours', 'Rate', 'Bank', 'Cash', 'Allowances', 'Payable', 'Payment Mode'];
    const lines = [headers.join(',')];
    for (const p of filteredPayrolls) {
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
    a.download = `payroll-export${exportFrom ? `-${exportFrom}` : ''}${exportTo ? `-to-${exportTo}` : ''}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
    toast.success('CSV exported');
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title={<span className="flex items-center gap-2"><PoundSterling className="size-7" /> Payroll</span>}
            description={`${payrolls.length} payroll record${payrolls.length !== 1 ? 's' : ''}`}
            actions={
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={loadPayrolls} disabled={loading}>
                  {loading ? 'Loading...' : 'Refresh'}
                </Button>
                <Button variant="outline" onClick={exportCsv}>
                  <Download className="size-4 mr-2" />
                  Export
                </Button>
                <Dialog open={exportOpen} onOpenChange={setExportOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Download className="size-4 mr-2" />
                      Export CSV
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Export payroll CSV</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label>Date from</Label>
                          <Input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Date to</Label>
                          <Input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label>Site (optional)</Label>
                        <Select value={exportSiteId || '__all'} onValueChange={(v) => setExportSiteId(v === '__all' ? '' : v)}>
                          <SelectTrigger>
                            <SelectValue placeholder="All sites" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__all">All sites</SelectItem>
                            {sites.map((s) => (
                              <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">Site filter applies when batch was calculated by site; date range filters by pay period overlap.</p>
                      </div>
                      <Button className="w-full" onClick={exportCsv}>
                        Download CSV ({filteredPayrolls.length} records)
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Dialog open={calcOpen} onOpenChange={setCalcOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Calculator className="size-4 mr-2" />
                      Calculate Payroll
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Calculate Payroll</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <p className="text-sm text-muted-foreground">
                        Calculate payroll from published assignments and shift hours for a given period.
                      </p>
                      <div className="space-y-1">
                        <Label>Generate by</Label>
                        <Select value={calcMode} onValueChange={(v) => setCalcMode(v as 'employee' | 'site' | 'rota')}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="employee">Individual employee</SelectItem>
                            <SelectItem value="site">By site (all staff on site)</SelectItem>
                            <SelectItem value="rota">By rota (all staff on rota)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {calcMode === 'employee' ? (
                        <div className="space-y-1">
                          <Label>Employee <span className="text-destructive">*</span></Label>
                          <Select value={calcGuardId} onValueChange={setCalcGuardId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select employee" />
                            </SelectTrigger>
                            <SelectContent>
                              {guards.map((g) => (
                                <SelectItem key={g.id} value={g.id.toString()}>{g.full_name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : calcMode === 'site' ? (
                        <div className="space-y-1">
                          <Label>Site <span className="text-destructive">*</span></Label>
                          <Select value={calcSiteId} onValueChange={setCalcSiteId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select site" />
                            </SelectTrigger>
                            <SelectContent>
                              {sites.map((s) => (
                                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <Label>Rota <span className="text-destructive">*</span></Label>
                          <Select value={calcRotaId} onValueChange={setCalcRotaId}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select rota" />
                            </SelectTrigger>
                            <SelectContent>
                              {rotas.map((r) => (
                                <SelectItem key={r.id} value={r.id.toString()}>{r.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                        <p className="text-xs text-muted-foreground">Applied to each record after calculation (bank/cash split from hours × rate + allowances).</p>
                      </div>
                      <Button
                        className="w-full"
                        onClick={handleCalculate}
                        disabled={
                          calcLoading ||
                          !calcStart ||
                          !calcEnd ||
                          (calcMode === 'employee' && !calcGuardId) ||
                          (calcMode === 'site' && !calcSiteId) ||
                          (calcMode === 'rota' && !calcRotaId)
                        }
                      >
                        {calcLoading ? 'Calculating...' : 'Calculate & Save Payroll'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            }
          />

          {payrolls.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Bank</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">{formatMoney(totalBank)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Cash</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">{formatMoney(totalCash)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Allowances</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">{formatMoney(totalAllowances)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Payable</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">{formatMoney(totalPayable)}</span>
                  <p className="text-xs text-muted-foreground mt-1">Bank + cash</p>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Search by guard name or period..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <div className="flex gap-2 items-center">
              <Input type="date" value={exportFrom} onChange={(e) => setExportFrom(e.target.value)} className="w-auto" aria-label="Filter from" />
              <span className="text-muted-foreground text-sm">to</span>
              <Input type="date" value={exportTo} onChange={(e) => setExportTo(e.target.value)} className="w-auto" aria-label="Filter to" />
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Payroll Records</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading payroll records...</div>
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search || exportFrom || exportTo ? 'No records match your filters.' : 'No payroll records yet. Use "Calculate Payroll" to generate records.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Guard" colKey="guard" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Period" colKey="period" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Hours" colKey="hours" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Rate" colKey="rate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
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
                            {guardMap.get(p.guard_id) ?? `Guard #${p.guard_id}`}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {p.period_start} – {p.period_end}
                          </TableCell>
                          <TableCell>{(p.total_hours ?? 0).toFixed(2)}h</TableCell>
                          <TableCell>{formatMoney(p.hourly_rate)}/hr</TableCell>
                          <TableCell className="font-medium">{formatMoney(p.bank_amount)}</TableCell>
                          <TableCell className="font-medium">{formatMoney(p.cash_amount)}</TableCell>
                          <TableCell>{formatMoney(p.allowance_total)}</TableCell>
                          <TableCell className="font-semibold">{formatMoney(payableAmount(p))}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                              {PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => setViewRec(p)} title="View record">
                                <Eye className="size-4" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Edit record">
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(p.id)}
                                title="Delete record"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePaginationBar
                    safePage={safePage}
                    pageCount={pageCount}
                    total={total}
                    pageSize={pageSize}
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    onPageChange={setPage}
                    onPageSizeChange={(n) => {
                      setPageSize(n);
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </ModulePage>

      <Dialog open={!!viewRec} onOpenChange={(open) => !open && setViewRec(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payroll details</DialogTitle>
          </DialogHeader>
          {viewRec && (
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
                {guardMap.get(editRec.guard_id) ?? `Guard #${editRec.guard_id}`}
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
                Base pay = hours × rate + allowances. Changing payment mode recalculates bank and cash (you can still override amounts).
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
