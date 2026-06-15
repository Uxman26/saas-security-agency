'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { ReportsHubCharts } from '@/components/reports/hub-charts';
import { ReportResultView } from '@/components/reports/report-result-view';
import { api } from '@/lib/api';
import type {
  Guard,
  ReportsHub,
  StaffIndividualReport,
  StaffMonthlyReport,
  SubscriptionReportSummary,
  UsageSummary,
} from '@/lib/types';
import {
  BarChart3,
  Clock,
  FileSpreadsheet,
  FileText,
  Users,
  Calendar,
  Receipt,
  MessageSquare,
  CreditCard,
  Activity,
  LogIn,
} from 'lucide-react';
import { toast } from '@/lib/toast';

const gbp = (n: number) => `£${n.toFixed(2)}`;

type ReportDef = {
  id: string;
  title: string;
  desc: string;
  category: string;
  icon: typeof Clock;
  exportType: string;
  needsGuard?: boolean;
  noExport?: boolean;
};

const REPORTS: ReportDef[] = [
  { id: 'attendance', title: 'Attendance', desc: 'Shift attendance with on-time, late, and absent status per employee.', category: 'staff', icon: Clock, exportType: 'attendance' },
  { id: 'shifts', title: 'Shift hours', desc: 'Individual staff shift and hours breakdown for any date range.', category: 'staff', icon: Calendar, exportType: 'attendance', needsGuard: true },
  { id: 'overtime', title: 'Overtime', desc: 'Overtime hours calculated against contracted weekly hours.', category: 'staff', icon: BarChart3, exportType: 'staff-monthly' },
  { id: 'staff-monthly', title: 'Monthly summary', desc: 'Total shifts and hours by employee, site, or client.', category: 'staff', icon: Users, exportType: 'staff-monthly' },
  { id: 'invoices', title: 'Invoice report', desc: 'All invoices with paid amounts, balances, and status.', category: 'financial', icon: FileText, exportType: 'invoices' },
  { id: 'expenses', title: 'Expense & VAT', desc: 'Business expenses and VAT breakdown by category or period.', category: 'financial', icon: Receipt, exportType: 'expenses', noExport: true },
  { id: 'subscription', title: 'Subscription billing', desc: 'Your platform subscription status, invoices, and outstanding balance.', category: 'subscription', icon: CreditCard, exportType: 'subscription' },
  { id: 'subscription-active', title: 'Active subscription', desc: 'Current plan, billing cycle, and renewal date.', category: 'subscription', icon: CreditCard, exportType: 'subscription', noExport: true },
  { id: 'login-logs', title: 'Login activity', desc: 'User login attempts with IP address and status.', category: 'usage', icon: LogIn, exportType: 'login-logs' },
  { id: 'usage-summary', title: 'Resource usage', desc: 'SMS, email, API requests, logins, and storage for the period.', category: 'usage', icon: Activity, exportType: 'usage', noExport: true },
  { id: 'sms-logs', title: 'SMS logs', desc: 'Outbound SMS delivery records and status.', category: 'usage', icon: MessageSquare, exportType: 'sms' },
];

type ReportView =
  | { kind: 'individual'; data: StaffIndividualReport }
  | { kind: 'monthly'; data: StaffMonthlyReport }
  | { kind: 'subscription'; summary: SubscriptionReportSummary; rows: Record<string, unknown>[] }
  | { kind: 'usage'; data: UsageSummary }
  | { kind: 'rows'; columns: { key: string; label: string; fmt?: (v: unknown) => string }[]; rows: Record<string, unknown>[] };

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: start.toISOString().split('T')[0], end: end.toISOString().split('T')[0] };
}

export default function ReportsPage() {
  const { start, end } = monthRange();
  const [startDate, setStartDate] = useState(start);
  const [endDate, setEndDate] = useState(end);
  const [hub, setHub] = useState<ReportsHub | null>(null);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [selected, setSelected] = useState<ReportDef | null>(null);
  const [guardId, setGuardId] = useState('');
  const [result, setResult] = useState<ReportView | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<'library' | 'custom'>('library');
  const [category, setCategory] = useState('all');

  const loadHub = useCallback(() => {
    api.reports.hub(startDate, endDate).then(setHub).catch(() => {});
  }, [startDate, endDate]);

  useEffect(() => {
    loadHub();
    api.guards.list().then(setGuards).catch(() => {});
  }, [loadHub]);

  const filtered = useMemo(() => {
    if (category === 'all') return REPORTS;
    return REPORTS.filter((r) => r.category === category);
  }, [category]);

  const generate = async () => {
    if (!selected) return;
    setLoading(true);
    setResult(null);
    try {
      if (selected.id === 'shifts' && !guardId) {
        toast.warning('Select a staff member for shift hours report');
        setLoading(false);
        return;
      }
      if (selected.id === 'expenses') {
        window.location.href = '/expenses';
        return;
      }
      if (selected.id === 'sms-logs') {
        const data = await api.sms.logs();
        setResult({
          kind: 'rows',
          columns: [
            { key: 'sent_at', label: 'Sent', fmt: (v) => (v ? new Date(String(v)).toLocaleString() : '—') },
            { key: 'recipient', label: 'Recipient' },
            { key: 'status', label: 'Status' },
            { key: 'body', label: 'Message' },
          ],
          rows: data as unknown as Record<string, unknown>[],
        });
      } else if (selected.id === 'shifts' && guardId) {
        const data = await api.reports.staffIndividual(parseInt(guardId), startDate, endDate);
        setResult({ kind: 'individual', data });
      } else if (selected.id === 'attendance') {
        const data = await api.reports.attendance(startDate, endDate, guardId ? parseInt(guardId) : undefined);
        setResult({
          kind: 'rows',
          columns: [
            { key: 'guard', label: 'Guard' },
            { key: 'site', label: 'Site' },
            { key: 'date', label: 'Date' },
            { key: 'hours', label: 'Hours' },
            { key: 'status', label: 'Status' },
          ],
          rows: data,
        });
      } else if (selected.id === 'invoices') {
        const data = await api.reports.financialInvoices(startDate, endDate);
        setResult({
          kind: 'rows',
          columns: [
            { key: 'invoice_id', label: 'Invoice' },
            { key: 'total', label: 'Total', fmt: (v) => gbp(Number(v)) },
            { key: 'amount_paid', label: 'Paid', fmt: (v) => gbp(Number(v)) },
            { key: 'balance', label: 'Balance', fmt: (v) => gbp(Number(v)) },
            { key: 'status', label: 'Status' },
          ],
          rows: data,
        });
      } else if (selected.id === 'subscription' || selected.id === 'subscription-active') {
        const [summary, rows] = await Promise.all([
          api.reports.subscriptionSummary(),
          selected.id === 'subscription' ? api.reports.subscriptionInvoices(startDate, endDate) : Promise.resolve([]),
        ]);
        setResult({ kind: 'subscription', summary, rows });
      } else if (selected.id === 'login-logs') {
        const data = await api.reports.usageLogins(startDate, endDate);
        setResult({
          kind: 'rows',
          columns: [
            { key: 'login_at', label: 'Login at', fmt: (v) => (v ? new Date(String(v)).toLocaleString() : '—') },
            { key: 'email', label: 'Email' },
            { key: 'full_name', label: 'Name' },
            { key: 'status', label: 'Status' },
            { key: 'ip_address', label: 'IP' },
          ],
          rows: data,
        });
      } else if (selected.id === 'usage-summary') {
        const data = await api.reports.usageSummary(startDate, endDate);
        setResult({ kind: 'usage', data });
      } else if (selected.id === 'overtime' || selected.id === 'staff-monthly') {
        const data = await api.reports.staffMonthly(startDate, endDate);
        setResult({ kind: 'monthly', data });
      }
      toast.success('Report generated');
    } catch {
      toast.error('Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const exportFmt = async (format: string) => {
    if (!selected?.exportType || selected.noExport || selected.exportType === 'expenses' || selected.exportType === 'usage') return;
    try {
      const blob = await api.reports.export(
        selected.exportType,
        startDate,
        endDate,
        format,
        guardId ? parseInt(guardId) : undefined
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${selected.exportType}-${startDate}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Export failed');
    }
  };

  const monthlyChart = useMemo(
    () => (hub?.monthly_trends ?? []).map((p) => ({ label: p.label, revenue: p.revenue, expenses: p.expenses, staff_hours: p.staff_hours })),
    [hub]
  );
  const subChart = useMemo(
    () => (hub?.subscription_trend ?? []).map((p) => ({ label: p.label, amount: p.amount, invoices: p.invoices })),
    [hub]
  );

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader title="Reports" description="Generate and export staff, financial, subscription, and usage reports" />
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
            </div>
            <Button variant="outline" size="sm" onClick={loadHub}>Refresh</Button>
          </div>

          {hub && (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Revenue collected</p><p className="text-xl font-bold">{gbp(hub.total_revenue)}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Outstanding</p><p className="text-xl font-bold text-red-600">{gbp(hub.outstanding_invoices)}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Staff hours</p><p className="text-xl font-bold">{hub.staff_hours}h</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Net VAT</p><p className="text-xl font-bold">{gbp(hub.net_vat)}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Expenses</p><p className="text-xl font-bold">{gbp(hub.total_expenses)}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Active users</p><p className="text-xl font-bold">{hub.active_users}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">SMS sent</p><p className="text-xl font-bold">{hub.sms_usage}</p></CardContent></Card>
                <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Email usage</p><p className="text-xl font-bold">{hub.email_usage}</p></CardContent></Card>
              </div>
              <ReportsHubCharts monthly={monthlyChart} subscription={subChart} />
            </>
          )}

          <ModuleTabs
            tabs={[
              { id: 'library', label: 'Report library' },
              { id: 'custom', label: 'Custom reports' },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'library' && (
            <>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reports</SelectItem>
                  <SelectItem value="staff">Staff reports</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                  <SelectItem value="usage">Resource usage</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid gap-4 sm:grid-cols-2">
                {filtered.map((r) => {
                  const Icon = r.icon;
                  return (
                    <Card key={r.id} className="hover:border-primary/40 transition-colors">
                      <CardContent className="pt-6 flex gap-4">
                        <div className="rounded-lg bg-primary/10 p-3 h-fit">
                          <Icon className="size-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold">{r.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{r.desc}</p>
                          <Button variant="link" className="px-0 mt-2 h-auto" onClick={() => { setSelected(r); setResult(null); setGuardId(''); }}>
                            Generate new report
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </>
          )}

          {tab === 'custom' && (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Use the report library to generate reports with date range and staff filters. Export to Excel, CSV, or PDF from the generate dialog.
              </CardContent>
            </Card>
          )}
        </ModulePage>

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{selected?.title}</DialogTitle></DialogHeader>
            {selected && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{selected.desc}</p>
                {(selected.needsGuard || selected.id === 'attendance') && (
                  <div>
                    <Label>Staff (optional)</Label>
                    <Select value={guardId || 'all'} onValueChange={(v) => setGuardId(v === 'all' ? '' : v)}>
                      <SelectTrigger className="mt-1"><SelectValue placeholder="All staff" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All staff</SelectItem>
                        {guards.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.full_name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={generate} disabled={loading}>{loading ? 'Generating…' : 'Generate'}</Button>
                  {!selected.noExport && selected.exportType !== 'expenses' && selected.exportType !== 'usage' && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => exportFmt('csv')}><FileSpreadsheet className="size-4 mr-1" />CSV</Button>
                      <Button variant="outline" size="sm" onClick={() => exportFmt('xlsx')}><FileSpreadsheet className="size-4 mr-1" />Excel</Button>
                      <Button variant="outline" size="sm" onClick={() => exportFmt('pdf')}><FileText className="size-4 mr-1" />PDF</Button>
                    </>
                  )}
                </div>
                {result && <ReportResultView view={result} />}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
