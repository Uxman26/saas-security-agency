'use client';

import type { StaffIndividualReport, StaffMonthlyReport, SubscriptionReportSummary, UsageSummary } from '@/lib/types';

type Col = { key: string; label: string; fmt?: (v: unknown) => string };

type ReportView =
  | { kind: 'individual'; data: StaffIndividualReport }
  | { kind: 'monthly'; data: StaffMonthlyReport }
  | { kind: 'subscription'; summary: SubscriptionReportSummary; rows: Record<string, unknown>[] }
  | { kind: 'usage'; data: UsageSummary }
  | { kind: 'rows'; title?: string; columns: Col[]; rows: Record<string, unknown>[] };

const WRAP_KEYS = new Set(['reason', 'site', 'guard', 'body', 'recorded_by']);

function DataTable({ columns, rows }: { columns: Col[]; rows: Record<string, unknown>[] }) {
  if (!rows.length) return <p className="text-sm text-muted-foreground py-2">No records for this period.</p>;
  return (
    <div className="overflow-auto max-h-[min(50vh,420px)] rounded-md border bg-background">
      <table className="w-full min-w-[640px] text-xs">
        <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm border-b">
          <tr>
            {columns.map((c) => (
              <th key={c.key} className="h-9 px-2.5 text-left font-medium text-foreground whitespace-nowrap">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/40">
              {columns.map((c) => {
                const wrap = WRAP_KEYS.has(c.key);
                return (
                  <td
                    key={c.key}
                    className={`px-2.5 py-2 align-top ${wrap ? 'whitespace-normal min-w-[120px] max-w-[220px]' : 'whitespace-nowrap'}`}
                  >
                    {c.fmt ? c.fmt(row[c.key]) : String(row[c.key] ?? '—')}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
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
    const grouped = view.data.group_by && view.data.group_by !== 'guard';
    if (grouped && Array.isArray(view.data.grouped_summary) && view.data.grouped_summary.length > 0) {
      return (
        <DataTable
          columns={[
            { key: 'key', label: view.data.group_by === 'site_client' ? 'Client · Site' : 'Group' },
            { key: 'total_shifts', label: 'Shifts' },
            { key: 'total_hours', label: 'Hours' },
            { key: 'guard_count', label: 'Staff' },
          ]}
          rows={view.data.grouped_summary as Record<string, unknown>[]}
        />
      );
    }
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
