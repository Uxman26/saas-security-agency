'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Payroll, Guard } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { PoundSterling, Calculator, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';

const PAYMENT_MODE_LABELS: Record<string, string> = {
  '100_bank': '100% Bank',
  '100_cash': '100% Cash',
  'split': 'Bank + Cash Split',
};

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
  const [calcLoading, setCalcLoading] = useState(false);
  const [sites, setSites] = useState<Awaited<ReturnType<typeof api.sites.list>>>([]);
  const [rotas, setRotas] = useState<Awaited<ReturnType<typeof api.rotaPlans.list>>>([]);
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

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

  const handleCalculate = async () => {
    if (!calcStart || !calcEnd) return;
    if (calcMode === 'employee' && !calcGuardId) return;
    if (calcMode === 'site' && !calcSiteId) return;
    if (calcMode === 'rota' && !calcRotaId) return;
    setCalcLoading(true);
    try {
      if (calcMode === 'employee') {
        await api.payroll.calculate(parseInt(calcGuardId, 10), calcStart, calcEnd);
      } else {
        const batch = await api.payroll.calculateBatch({
          mode: calcMode,
          period_start: calcStart,
          period_end: calcEnd,
          ...(calcMode === 'site' ? { site_id: parseInt(calcSiteId, 10) } : {}),
          ...(calcMode === 'rota' ? { rota_plan_id: parseInt(calcRotaId, 10) } : {}),
        });
        if (!batch.length) {
          toast.error('No payroll records created — check assignments exist for this period');
        } else {
          toast.success(`Created ${batch.length} payroll record(s)`);
        }
      }
      setCalcOpen(false);
      setCalcGuardId('');
      setCalcSiteId('');
      setCalcRotaId('');
      setCalcStart('');
      setCalcEnd('');
      loadPayrolls();
      if (calcMode === 'employee') toast.success('Payroll calculated');
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
        case 'mode':
          return p.payment_mode || '';
        default:
          return '';
      }
    },
    [guardMap]
  );

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    payrolls,
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
  }, [search]);
  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);

  const totalBank = payrolls.reduce((sum, p) => sum + p.bank_amount, 0);
  const totalCash = payrolls.reduce((sum, p) => sum + p.cash_amount, 0);
  const totalAllowances = payrolls.reduce((sum, p) => sum + p.allowance_total, 0);

  return (
    <ProtectedRoute>
      <AppShell>
      <div>
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><PoundSterling className="size-7" /> Payroll</h1>
              <p className="text-muted-foreground mt-1">{payrolls.length} payroll record{payrolls.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadPayrolls} disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </Button>
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
          </div>

          {/* Summary cards */}
          {payrolls.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-3 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Bank</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">£{totalBank.toFixed(2)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Cash</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">£{totalCash.toFixed(2)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Allowances</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">£{totalAllowances.toFixed(2)}</span>
                </CardContent>
              </Card>
            </div>
          )}

          <div className="mb-4">
            <Input
              placeholder="Search by guard name or period..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
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
                  {search ? 'No records match your search.' : 'No payroll records yet. Use "Calculate Payroll" to generate records.'}
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
                          <TableCell>£{p.hourly_rate.toFixed(2)}/hr</TableCell>
                          <TableCell className="font-medium">£{p.bank_amount.toFixed(2)}</TableCell>
                          <TableCell className="font-medium">£{p.cash_amount.toFixed(2)}</TableCell>
                          <TableCell>£{p.allowance_total.toFixed(2)}</TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                              {PAYMENT_MODE_LABELS[p.payment_mode] ?? p.payment_mode}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(p.id)}
                              title="Delete record"
                            >
                              <Trash2 className="size-4" />
                            </Button>
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
        </div>
      </div>
    </AppShell>
    </ProtectedRoute>
  );
}
