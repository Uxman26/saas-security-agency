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
import type { IncidentSummaryRow } from '@/lib/types';
import { toast } from '@/lib/toast';
import { ArrowLeft, BarChart3 } from 'lucide-react';

export default function IncidentReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [start, setStart] = useState(monthAgo);
  const [end, setEnd] = useState(today);
  const [rows, setRows] = useState<IncidentSummaryRow[]>([]);

  const load = useCallback(async () => {
    try {
      setRows(await api.incidents.summary(start, end));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load summary');
    }
  }, [start, end]);

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
