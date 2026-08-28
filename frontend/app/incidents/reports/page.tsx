'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { IncidentMatrixReport, IncidentSummaryRow } from '@/lib/types';
import { toast } from '@/lib/toast';
import { ArrowLeft, BarChart3, Download } from 'lucide-react';

export default function IncidentReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [rows, setRows] = useState<IncidentSummaryRow[]>([]);
  const [matrix, setMatrix] = useState<IncidentMatrixReport | null>(null);

  const load = useCallback(async () => {
    try {
      setRows(await api.incidents.summary(start, end));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load summary');
    }
    // The matrix needs its own permission, so a role with only incidents.view still
    // gets the status summary above rather than an error.
    try {
      setMatrix(await api.incidents.matrix(start, end));
    } catch {
      setMatrix(null);
    }
  }, [start, end]);

  const exportMatrixCsv = () => {
    if (!matrix) return;
    const head = ['Supplier', 'SiteName', ...matrix.category_columns.map((c) => c.label),
      'TotalInc', ...matrix.service_columns.map((c) => c.label)];
    const line = (r: IncidentMatrixReport['rows'][number]) => [
      r.supplier, r.site_name,
      ...matrix.category_columns.map((c) => r.categories[c.key] ?? 0),
      r.total_incidents,
      ...matrix.service_columns.map((c) => r.services[c.key] ?? 0),
    ];
    const csv = [head, ...matrix.rows.map(line), line({ ...matrix.totals, supplier: '', site_name: 'Total' })]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `incident-reports-summary-${start}-to-${end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title={
              <span className="flex items-center gap-2">
                <BarChart3 className="size-7 text-primary" />
                Incident summary
              </span>
            }
            description="Counts by status and site."
            actions={
              <Button variant="outline" asChild>
                <Link href="/incidents">
                  <ArrowLeft className="size-4 mr-1" />
                  Incidents
                </Link>
              </Button>
            }
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Date range</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label>Start</Label>
                <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>End</Label>
                <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
              </div>
              <Button onClick={load}>Apply</Button>
            </CardContent>
          </Card>

          {matrix ? (
            <Card>
              <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                <div>
                  <CardTitle className="text-base">Incident Reports Summary</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {matrix.company_name} &middot; {matrix.period_start} to {matrix.period_end} &middot; one row per site,
                    one column per category.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={exportMatrixCsv} disabled={!matrix.rows.length}>
                  <Download className="size-4 mr-1.5" />
                  Export CSV
                </Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10">Supplier</TableHead>
                        <TableHead className="whitespace-nowrap">Site</TableHead>
                        {matrix.category_columns.map((c) => (
                          <TableHead key={c.key} className="text-center align-bottom">
                            {/* Vertical headers keep 16 category columns readable, as on the paper sheet. */}
                            <span className="inline-block whitespace-nowrap text-[11px] font-medium"
                                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                              {c.label}
                            </span>
                          </TableHead>
                        ))}
                        <TableHead className="text-center text-[11px]">TotalInc</TableHead>
                        {matrix.service_columns.map((c) => (
                          <TableHead key={c.key} className="text-center align-bottom">
                            <span className="inline-block whitespace-nowrap text-[11px] font-medium"
                                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                              {c.label}
                            </span>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {matrix.rows.map((r) => (
                        <TableRow key={r.site_id ?? r.site_name}>
                          <TableCell className="sticky left-0 bg-background z-10 whitespace-nowrap">{r.supplier}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.site_name}</TableCell>
                          {matrix.category_columns.map((c) => (
                            <TableCell key={c.key} className="text-center tabular-nums text-xs">
                              {r.categories[c.key] || <span className="text-muted-foreground/40">0</span>}
                            </TableCell>
                          ))}
                          <TableCell className="text-center tabular-nums font-semibold text-xs">{r.total_incidents}</TableCell>
                          {matrix.service_columns.map((c) => (
                            <TableCell key={c.key} className="text-center tabular-nums text-xs">
                              {r.services[c.key] || <span className="text-muted-foreground/40">0</span>}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                      {matrix.rows.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={matrix.category_columns.length + matrix.service_columns.length + 3}
                                     className="text-center text-muted-foreground py-8">
                            No incidents in this period.
                          </TableCell>
                        </TableRow>
                      ) : (
                        <TableRow className="font-semibold border-t-2">
                          <TableCell className="sticky left-0 bg-background z-10" />
                          <TableCell>Total</TableCell>
                          {matrix.category_columns.map((c) => (
                            <TableCell key={c.key} className="text-center tabular-nums text-xs">
                              {matrix.totals.categories[c.key] || 0}
                            </TableCell>
                          ))}
                          <TableCell className="text-center tabular-nums text-xs">{matrix.totals.total_incidents}</TableCell>
                          {matrix.service_columns.map((c) => (
                            <TableCell key={c.key} className="text-center tabular-nums text-xs">
                              {matrix.totals.services[c.key] || 0}
                            </TableCell>
                          ))}
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Count</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, i) => (
                    <TableRow key={`${r.status}-${r.site_id ?? 'all'}-${i}`}>
                      <TableCell className="capitalize">{r.status}</TableCell>
                      <TableCell>{r.site_name || 'All / unassigned'}</TableCell>
                      <TableCell className="tabular-nums font-medium">{r.count}</TableCell>
                    </TableRow>
                  ))}
                  {rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        No summary data.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
