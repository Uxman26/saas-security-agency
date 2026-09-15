'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { AdminReportsSummary, AdminReportsTimeseries } from '@/lib/types';
import { toast } from '@/lib/toast';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-px h-16 w-full">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 min-w-0 rounded-t-sm"
          style={{ height: `${Math.max(2, (v / max) * 100)}%`, background: color }}
          title={String(v)}
        />
      ))}
    </div>
  );
}

export default function AdminReportsPage() {
  const { user } = useAuth();
  const [days, setDays] = useState('30');
  const [summary, setSummary] = useState<AdminReportsSummary | null>(null);
  const [series, setSeries] = useState<AdminReportsTimeseries | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    const d = parseInt(days, 10);
    Promise.all([api.admin.reportsSummary(d), api.admin.reportsTimeseries(d)])
      .then(([s, t]) => {
        setSummary(s);
        setSeries(t);
      })
      .catch(() => toast.error('Failed to load report'))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const blob = await api.admin.reportsExport(parseInt(days, 10));
      downloadBlob(blob, `platform-report-${days}d.csv`);
      toast.success('CSV downloaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const kpis = summary
    ? [
        { label: 'New tenants', value: summary.new_tenants },
        { label: 'Active tenants', value: summary.active_tenants },
        { label: 'Revenue collected', value: `£${summary.revenue_collected.toFixed(2)}` },
        { label: 'Refunds', value: `£${(summary.refunds_total ?? 0).toFixed(2)}` },
        { label: 'Net revenue', value: `£${(summary.net_revenue ?? summary.revenue_collected).toFixed(2)}` },
        { label: 'Invoices created', value: summary.invoices_created },
        { label: 'Logins', value: summary.logins },
        { label: 'Open tickets', value: summary.open_tickets },
        { label: 'Errors', value: summary.errors },
        { label: 'API calls', value: summary.api_calls },
      ]
    : [];

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
            <h1 className="text-3xl font-bold">Platform reports</h1>
            <div className="flex gap-2">
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="90">Last 90 days</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
              <Button size="sm" disabled={exporting} onClick={() => void exportCsv()}>
                {exporting ? 'Exporting...' : 'Export CSV'}
              </Button>
            </div>
          </div>
          {loading && !summary ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : summary ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {kpis.map((k) => (
                  <Card key={k.label}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">{k.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold tabular-nums">{k.value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <Card>
                <CardHeader><CardTitle>Tenants by plan</CardTitle></CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    {Object.entries(summary.tenants_by_tier).map(([tier, count]) => (
                      <div key={tier} className="flex justify-between rounded-md border px-3 py-2 text-sm">
                        <span className="capitalize">{tier}</span>
                        <span className="font-medium tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              {series && (
                <>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <Card>
                      <CardHeader><CardTitle>New tenants / day</CardTitle></CardHeader>
                      <CardContent>
                        <MiniBars values={series.new_tenants} color="hsl(var(--primary))" />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle>Logins / day</CardTitle></CardHeader>
                      <CardContent>
                        <MiniBars values={series.logins} color="#0ea5e9" />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle>Revenue / day</CardTitle></CardHeader>
                      <CardContent>
                        <MiniBars values={series.revenue} color="#16a34a" />
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader><CardTitle>Tickets / day</CardTitle></CardHeader>
                      <CardContent>
                        <MiniBars values={series.tickets} color="#f59e0b" />
                      </CardContent>
                    </Card>
                  </div>
                  <Card>
                    <CardHeader><CardTitle>Daily values</CardTitle></CardHeader>
                    <CardContent className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead className="text-end">Tenants</TableHead>
                            <TableHead className="text-end">Revenue</TableHead>
                            <TableHead className="text-end">Logins</TableHead>
                            <TableHead className="text-end">Tickets</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {series.labels.map((label, i) => (
                            <TableRow key={label}>
                              <TableCell className="text-sm whitespace-nowrap">{label}</TableCell>
                              <TableCell className="text-end tabular-nums">{series.new_tenants[i]}</TableCell>
                              <TableCell className="text-end tabular-nums">£{Number(series.revenue[i] || 0).toFixed(2)}</TableCell>
                              <TableCell className="text-end tabular-nums">{series.logins[i]}</TableCell>
                              <TableCell className="text-end tabular-nums">{series.tickets[i]}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">No data.</p>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
