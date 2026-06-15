'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { StaffIndividualReport, StaffMonthlyReport, SubscriptionReportSummary, UsageSummary } from '@/lib/types';

type Col = { key: string; label: string; fmt?: (v: unknown) => string };

type ReportView =
  | { kind: 'individual'; data: StaffIndividualReport }
  | { kind: 'monthly'; data: StaffMonthlyReport }
  | { kind: 'subscription'; summary: SubscriptionReportSummary; rows: Record<string, unknown>[] }
  | { kind: 'usage'; data: UsageSummary }
  | { kind: 'rows'; title?: string; columns: Col[]; rows: Record<string, unknown>[] };

function DataTable({ columns, rows }: { columns: Col[]; rows: Record<string, unknown>[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground">No records for this period.</p>;
  return (
    <div className="overflow-x-auto max-h-64 border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className="text-xs">{c.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, i) => (
            <TableRow key={i}>
              {columns.map((c) => (
                <TableCell key={c.key} className="text-xs whitespace-nowrap">
                  {c.fmt ? c.fmt(row[c.key]) : String(row[c.key] ?? '—')}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function ReportResultView({ view }: { view: ReportView }) {
  if (view.kind === 'individual') {
    const d = view.data;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Employee</span><p className="font-medium">{d.guard_name}</p></div>
          <div><span className="text-muted-foreground">Total hours</span><p className="font-medium">{d.total_hours}h</p></div>
          <div><span className="text-muted-foreground">Shifts</span><p className="font-medium">{d.total_shifts}</p></div>
          <div><span className="text-muted-foreground">Overtime</span><p className="font-medium">{d.overtime_hours}h</p></div>
        </div>
        <DataTable
          columns={[
            { key: 'date', label: 'Date' },
            { key: 'site_name', label: 'Site' },
            { key: 'hours', label: 'Hours' },
            { key: 'attendance_status', label: 'Status' },
          ]}
          rows={d.shifts as Record<string, unknown>[]}
        />
      </div>
    );
  }
  if (view.kind === 'monthly') {
    return (
      <DataTable
        columns={[
          { key: 'guard_name', label: 'Employee' },
          { key: 'total_hours', label: 'Hours' },
          { key: 'late_arrivals', label: 'Late' },
          { key: 'overtime_hours', label: 'Overtime' },
        ]}
        rows={view.data.by_employee as Record<string, unknown>[]}
      />
    );
  }
  if (view.kind === 'subscription') {
    const s = view.summary;
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-muted-foreground">Plan</span><p className="font-medium capitalize">{s.subscription_tier ?? '—'}</p></div>
          <div><span className="text-muted-foreground">Status</span><p className="font-medium capitalize">{s.subscription_status ?? '—'}</p></div>
          <div><span className="text-muted-foreground">Outstanding</span><p className="font-medium">£{s.outstanding.toFixed(2)}</p></div>
          <div><span className="text-muted-foreground">Expiring</span><p className="font-medium">{s.is_expiring ? `${s.days_until_expiry}d left` : 'No'}</p></div>
        </div>
        <DataTable
          columns={[
            { key: 'invoice_number', label: 'Invoice' },
            { key: 'tier', label: 'Plan' },
            { key: 'total', label: 'Total', fmt: (v) => `£${Number(v).toFixed(2)}` },
            { key: 'status', label: 'Status' },
          ]}
          rows={view.rows}
        />
      </div>
    );
  }
  if (view.kind === 'usage') {
    const u = view.data;
    return (
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-md border p-3"><p className="text-muted-foreground text-xs">Logins</p><p className="text-lg font-bold">{u.successful_logins}</p></div>
        <div className="rounded-md border p-3"><p className="text-muted-foreground text-xs">API requests</p><p className="text-lg font-bold">{u.api_requests}</p></div>
        <div className="rounded-md border p-3"><p className="text-muted-foreground text-xs">SMS sent</p><p className="text-lg font-bold">{u.sms_sent}</p></div>
        <div className="rounded-md border p-3"><p className="text-muted-foreground text-xs">Emails sent</p><p className="text-lg font-bold">{u.emails_sent}</p></div>
        <div className="rounded-md border p-3 col-span-2"><p className="text-muted-foreground text-xs">Storage</p><p className="text-lg font-bold">{u.storage_mb} MB</p></div>
      </div>
    );
  }
  return <DataTable columns={view.columns} rows={view.rows} />;
}
