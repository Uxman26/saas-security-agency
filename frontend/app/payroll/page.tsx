'use client';

import { useState, useEffect, useMemo } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Payroll, Guard } from '@/lib/types';
import { PoundSterling, Calculator, Trash2 } from 'lucide-react';

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
  const [calcGuardId, setCalcGuardId] = useState('');
  const [calcStart, setCalcStart] = useState('');
  const [calcEnd, setCalcEnd] = useState('');
  const [calcLoading, setCalcLoading] = useState(false);
  const [search, setSearch] = useState('');

  const guardMap = useMemo(() => new Map(guards.map((g) => [g.id, g.full_name])), [guards]);

  const loadPayrolls = () => {
    setLoading(true);
    api.payroll.list().then(setPayrolls).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPayrolls();
    api.guards.list().then(setGuards).catch(() => {});
  }, []);

  const handleCalculate = async () => {
    if (!calcGuardId || !calcStart || !calcEnd) return;
    setCalcLoading(true);
    try {
      await api.payroll.calculate(parseInt(calcGuardId), calcStart, calcEnd);
      setCalcOpen(false);
      setCalcGuardId('');
      setCalcStart('');
      setCalcEnd('');
      loadPayrolls();
    } catch (err) {
      console.error(err);
    } finally {
      setCalcLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this payroll record? This cannot be undone.')) return;
    try {
      await api.payroll.delete(id);
      loadPayrolls();
    } catch (err) { console.error(err); }
  };

  const filtered = useMemo(() =>
    payrolls.filter(p =>
      (guardMap.get(p.guard_id) ?? '').toLowerCase().includes(search.toLowerCase()) ||
      p.period_start.includes(search) ||
      p.period_end.includes(search)
    ), [payrolls, search, guardMap]);

  const totalBank = filtered.reduce((sum, p) => sum + p.bank_amount, 0);
  const totalCash = filtered.reduce((sum, p) => sum + p.cash_amount, 0);
  const totalAllowances = filtered.reduce((sum, p) => sum + p.allowance_total, 0);

  return (
    <ProtectedRoute>
      <div>
        <Nav />
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
                      Auto-calculate payroll for a guard based on their assignments and rates for a given period.
                    </p>
                    <div className="space-y-1">
                      <Label>Guard <span className="text-destructive">*</span></Label>
                      <Select value={calcGuardId} onValueChange={setCalcGuardId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select guard" />
                        </SelectTrigger>
                        <SelectContent>
                          {guards.map((g) => (
                            <SelectItem key={g.id} value={g.id.toString()}>{g.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
                      disabled={calcLoading || !calcGuardId || !calcStart || !calcEnd}
                    >
                      {calcLoading ? 'Calculating...' : 'Calculate & Save Payroll'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Summary cards */}
          {filtered.length > 0 && (
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
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search ? 'No records match your search.' : 'No payroll records yet. Use "Calculate Payroll" to generate records.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Guard</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead>Rate</TableHead>
                        <TableHead>Bank</TableHead>
                        <TableHead>Cash</TableHead>
                        <TableHead>Allowances</TableHead>
                        <TableHead>Payment Mode</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {guardMap.get(p.guard_id) ?? `Guard #${p.guard_id}`}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {p.period_start} – {p.period_end}
                          </TableCell>
                          <TableCell>{p.total_hours.toFixed(2)}h</TableCell>
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
