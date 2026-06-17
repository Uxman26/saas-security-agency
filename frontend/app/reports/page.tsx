'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { ReportsHubCharts } from '@/components/reports/hub-charts';
import { ReportCard } from '@/components/reports/report-card';
import { ReportGenerateDialog } from '@/components/reports/report-generate-dialog';
import { api, ApiError } from '@/lib/api';
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
  Users,
  Calendar,
  Receipt,
  MessageSquare,
  CreditCard,
  Activity,
  LogIn,
  FileText,
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
  noExport?: boolean;
};

const REPORTS: ReportDef[] = [
  { id: 'attendance', title: 'Attendance', desc: 'Shift attendance with on-time, late, and absent status per employee.', category: 'staff', icon: Clock, exportType: 'attendance' },
  { id: 'shifts', title: 'Shift hours', desc: 'Individual staff shift and hours breakdown for any date range.', category: 'staff', icon: Calendar, exportType: 'shift-hours' },
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
    api.reports.hub(start, end).then(setHub).catch(() => {});
  }, [start, end]);

  useEffect(() => {
    loadHub();
    api.guards.list().then(setGuards).catch(() => {});
  }, [loadHub]);

  const filtered = useMemo(() => {
    if (category === 'all') return REPORTS;
    return REPORTS.filter((r) => r.category === category);
  }, [category]);

  const openReport = (r: ReportDef) => {
    setSelected(r);
    setResult(null);
    setGuardId('');
    setStartDate(start);
    setEndDate(end);
  };

  const generate = async () => {
    if (!selected) return;
    if (selected.id === 'expenses') {
      window.location.href = '/expenses';
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      let view: ReportView | null = null;
      if (selected.id === 'shifts' && guardId) {
        const data = await api.reports.staffIndividual(parseInt(guardId), startDate, endDate);
        view = { kind: 'individual', data };
      } else if (selected.id === 'shifts') {
        const data = await api.reports.staffMonthly(startDate, endDate);
        view = { kind: 'monthly', data };
      } else if (selected.id === 'sms-logs') {
        const data = await api.sms.logs();
        view = {
          kind: 'rows',
          columns: [
            { key: 'sent_at', label: 'Sent', fmt: (v) => (v ? new Date(String(v)).toLocaleString() : '—') },
            { key: 'recipient', label: 'Recipient' },
            { key: 'status', label: 'Status' },
            { key: 'body', label: 'Message' },
          ],
          rows: data as unknown as Record<string, unknown>[],
        };
      } else if (selected.id === 'attendance') {
        const data = await api.reports.attendance(startDate, endDate, guardId ? parseInt(guardId) : undefined);
        view = {
          kind: 'rows',
          columns: [
            { key: 'guard', label: 'Guard' },
            { key: 'site', label: 'Site' },
            { key: 'date', label: 'Date' },
            { key: 'hours', label: 'Hours' },
            { key: 'status', label: 'Status' },
          ],
          rows: data,
        };
      } else if (selected.id === 'invoices') {
        const data = await api.reports.financialInvoices(startDate, endDate);
        view = {
          kind: 'rows',
          columns: [
            { key: 'invoice_id', label: 'Invoice' },
            { key: 'total', label: 'Total', fmt: (v) => gbp(Number(v)) },
            { key: 'amount_paid', label: 'Paid', fmt: (v) => gbp(Number(v)) },
            { key: 'balance', label: 'Balance', fmt: (v) => gbp(Number(v)) },
            { key: 'status', label: 'Status' },
          ],
          rows: data,
        };
      } else if (selected.id === 'subscription' || selected.id === 'subscription-active') {
        const [summary, rows] = await Promise.all([
          api.reports.subscriptionSummary(),
          selected.id === 'subscription' ? api.reports.subscriptionInvoices(startDate, endDate) : Promise.resolve([]),
        ]);
        view = { kind: 'subscription', summary, rows };
      } else if (selected.id === 'login-logs') {
        const data = await api.reports.usageLogins(startDate, endDate);
        view = {
          kind: 'rows',
          columns: [
            { key: 'login_at', label: 'Login at', fmt: (v) => (v ? new Date(String(v)).toLocaleString() : '—') },
            { key: 'email', label: 'Email' },
            { key: 'full_name', label: 'Name' },
            { key: 'status', label: 'Status' },
            { key: 'ip_address', label: 'IP' },
          ],
          rows: data,
        };
      } else if (selected.id === 'usage-summary') {
        const data = await api.reports.usageSummary(startDate, endDate);
        view = { kind: 'usage', data };
      } else if (selected.id === 'overtime' || selected.id === 'staff-monthly') {
        const data = await api.reports.staffMonthly(startDate, endDate);
        view = { kind: 'monthly', data };
      }
      if (view) {
        setResult(view);
        toast.success('Report generated');
      }
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Failed to generate report';
      toast.error(msg);
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
      toast.success('Export downloaded');
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'Export failed';
      toast.error(msg);
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
          <ModuleHeader title="Reports" />

          {hub && (
            <ReportsHubCharts monthly={monthlyChart} subscription={subChart} />
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
            <div className="space-y-4">
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-48"><SelectValue placeholder="All reports" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reports</SelectItem>
                  <SelectItem value="staff">Staff reports</SelectItem>
                  <SelectItem value="financial">Financial</SelectItem>
                  <SelectItem value="subscription">Subscription</SelectItem>
                  <SelectItem value="usage">Resource usage</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid gap-4 sm:grid-cols-2">
                {filtered.map((r) => (
                  <ReportCard key={r.id} title={r.title} desc={r.desc} icon={r.icon} onGenerate={() => openReport(r)} />
                ))}
              </div>
            </div>
          )}

          {tab === 'custom' && (
            <Card>
              <CardContent className="pt-6 text-sm text-muted-foreground">
                Pick a report from the library, set your date range in the dialog, then generate or export to CSV, Excel, or PDF.
              </CardContent>
            </Card>
          )}
        </ModulePage>

        <ReportGenerateDialog
          open={!!selected}
          report={selected}
          startDate={startDate}
          endDate={endDate}
          guardId={guardId}
          guards={guards}
          loading={loading}
          result={result}
          onClose={() => setSelected(null)}
          onStartDate={setStartDate}
          onEndDate={setEndDate}
          onGuardId={setGuardId}
          onGenerate={generate}
          onExport={exportFmt}
        />
      </AppShell>
    </ProtectedRoute>
  );
}
