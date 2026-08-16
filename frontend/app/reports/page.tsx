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
  Site,
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
  History,
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
  { id: 'shifts', title: 'Shift hours', desc: 'Shift and hours breakdown by employee, site, and date range.', category: 'staff', icon: Calendar, exportType: 'shift-hours' },
  { id: 'shift-overtime', title: 'Overtime report', desc: 'Shift extensions with reasons recorded from the rota.', category: 'staff', icon: BarChart3, exportType: 'shift-overtime' },
  { id: 'shift-early-finish', title: 'Finished early report', desc: 'Shifts ended before schedule with recorded reasons.', category: 'staff', icon: Clock, exportType: 'shift-early-finish' },
  { id: 'shift-lateness', title: 'Lateness report', desc: 'Late arrivals with scheduled vs actual start times per employee.', category: 'staff', icon: Clock, exportType: 'shift-lateness' },
  { id: 'overtime', title: 'Contract overtime', desc: 'Overtime hours calculated against contracted weekly hours.', category: 'staff', icon: BarChart3, exportType: 'staff-monthly' },
  { id: 'staff-monthly', title: 'Monthly summary', desc: 'Total shifts and hours by employee, site, or client.', category: 'staff', icon: Users, exportType: 'staff-monthly' },
  { id: 'shift-history', title: 'Shift History', desc: 'Audit trail of every shift created, assigned, reassigned, re-timed, or deleted — with the user who did it and when.', category: 'audit', icon: History, exportType: 'shift-history' },
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
  const [sites, setSites] = useState<Site[]>([]);
  const [selected, setSelected] = useState<ReportDef | null>(null);
  const [guardId, setGuardId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [groupBy, setGroupBy] = useState('guard');
  const [action, setAction] = useState('');
  const [actionOptions, setActionOptions] = useState<{ value: string; label: string }[]>([]);
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
    api.sites.list().then(setSites).catch(() => {});
  }, [loadHub]);

  const filtered = useMemo(() => {
    if (category === 'all') return REPORTS;
    return REPORTS.filter((r) => r.category === category);
  }, [category]);

  const openReport = (r: ReportDef) => {
    setSelected(r);
    setResult(null);
    setGuardId('');
    setSiteId('');
    setGroupBy('guard');
    setAction('');
    setStartDate(start);
    setEndDate(end);
    // Action labels come from the server so the filter cannot drift from what is logged.
    if (r.id === 'shift-history' && actionOptions.length === 0) {
      api.reports.shiftHistoryActions().then(setActionOptions).catch(() => {});
    }
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
      if (selected.id === 'shifts') {
        const data = await api.reports.shiftHours(
          startDate,
          endDate,
          guardId ? parseInt(guardId, 10) : undefined,
          siteId ? parseInt(siteId, 10) : undefined
        );
        view = {
          kind: 'rows',
          columns: [
            { key: 'guard', label: 'Employee' },
            { key: 'site', label: 'Site' },
            { key: 'date', label: 'Date' },
            { key: 'shift_start', label: 'Start' },
            { key: 'shift_end', label: 'End' },
            { key: 'break_minutes', label: 'Break mins' },
            { key: 'hours', label: 'Hours' },
            { key: 'status', label: 'Status' },
          ],
          rows: (data.shifts || []) as Record<string, unknown>[],
        };
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
      } else if (selected.id === 'shift-overtime') {
        const data = await api.reports.shiftOvertime(startDate, endDate, guardId ? parseInt(guardId) : undefined);
        view = {
          kind: 'rows',
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'guard', label: 'Employee' },
            { key: 'site', label: 'Site' },
            { key: 'shift_start', label: 'Start' },
            { key: 'scheduled_end', label: 'Scheduled end' },
            { key: 'new_end', label: 'New end' },
            { key: 'extra_minutes', label: 'Extra mins' },
            { key: 'reason', label: 'Reason' },
            { key: 'recorded_by', label: 'Recorded by' },
          ],
          rows: data,
        };
      } else if (selected.id === 'shift-early-finish') {
        const data = await api.reports.shiftEarlyFinish(startDate, endDate, guardId ? parseInt(guardId) : undefined);
        view = {
          kind: 'rows',
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'guard', label: 'Employee' },
            { key: 'site', label: 'Site' },
            { key: 'shift_start', label: 'Start' },
            { key: 'scheduled_end', label: 'Scheduled end' },
            { key: 'actual_end', label: 'Actual end' },
            { key: 'early_minutes', label: 'Early mins' },
            { key: 'reason', label: 'Reason' },
            { key: 'recorded_by', label: 'Recorded by' },
          ],
          rows: data,
        };
      } else if (selected.id === 'shift-lateness') {
        const data = await api.reports.shiftLateness(startDate, endDate, guardId ? parseInt(guardId) : undefined);
        view = {
          kind: 'rows',
          columns: [
            { key: 'date', label: 'Date' },
            { key: 'guard', label: 'Employee' },
            { key: 'site', label: 'Site' },
            { key: 'scheduled_start', label: 'Scheduled start' },
            { key: 'actual_start', label: 'Actual start' },
            { key: 'late_minutes', label: 'Late mins' },
            { key: 'note', label: 'Note' },
            { key: 'recorded_by', label: 'Recorded by' },
          ],
          rows: data,
        };
      } else if (selected.id === 'shift-history') {
        const data = await api.reports.shiftHistory(startDate, endDate, {
          guard_id: guardId ? parseInt(guardId, 10) : undefined,
          site_id: siteId ? parseInt(siteId, 10) : undefined,
          action: action || undefined,
        });
        view = {
          kind: 'rows',
          columns: [
            { key: 'action_date', label: 'Date' },
            { key: 'action_time', label: 'Time' },
            { key: 'action_label', label: 'Action' },
            { key: 'shift_ref', label: 'Shift ref' },
            { key: 'rota_name', label: 'Rota' },
            { key: 'site', label: 'Site' },
            { key: 'guard', label: 'Staff' },
            { key: 'shift_date', label: 'Shift date' },
            { key: 'previous_values', label: 'Previous values' },
            { key: 'new_values', label: 'New values' },
            { key: 'user', label: 'Changed by' },
            { key: 'user_email', label: 'User email' },
            { key: 'user_role', label: 'Role' },
            { key: 'source', label: 'Source' },
          ],
          rows: data as unknown as Record<string, unknown>[],
        };
      } else if (selected.id === 'overtime' || selected.id === 'staff-monthly') {
        const data = await api.reports.staffMonthly(startDate, endDate, groupBy);
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
        guardId ? parseInt(guardId) : undefined,
        siteId ? parseInt(siteId) : undefined,
        selected.id === 'staff-monthly' || selected.id === 'overtime' ? groupBy : undefined
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
                  <SelectItem value="audit">Audit &amp; history</SelectItem>
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
          siteId={siteId}
          groupBy={groupBy}
          action={action}
          actionOptions={actionOptions}
          guards={guards}
          sites={sites}
          loading={loading}
          result={result}
          onClose={() => setSelected(null)}
          onStartDate={setStartDate}
          onEndDate={setEndDate}
          onGuardId={setGuardId}
          onSiteId={setSiteId}
          onGroupBy={setGroupBy}
          onAction={setAction}
          onGenerate={generate}
          onExport={exportFmt}
        />
      </AppShell>
    </ProtectedRoute>
  );
}
