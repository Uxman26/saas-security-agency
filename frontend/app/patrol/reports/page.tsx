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
import type { PatrolComplianceRow, PatrolLog } from '@/lib/types';
import { toast } from '@/lib/toast';
import { ArrowLeft, BarChart3 } from 'lucide-react';

export default function PatrolReportsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [start, setStart] = useState(weekAgo);
  const [end, setEnd] = useState(today);
  const [compliance, setCompliance] = useState<PatrolComplianceRow[]>([]);
  const [detail, setDetail] = useState<PatrolLog[]>([]);

  const load = useCallback(async () => {
    try {
      const [c, d] = await Promise.all([
        api.patrol.compliance(start, end),
        api.patrol.detail(start, end),
      ]);
      setCompliance(c);
      setDetail(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load reports');
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
                Patrol reports
              </span>
            }
            description="Compliance and detailed scan rows."
            actions={
              <Button variant="outline" asChild>
                <Link href="/patrol">
                  <ArrowLeft className="size-4 mr-1" />
                  Routes
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
            <CardHeader>
              <CardTitle className="text-base">Compliance</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Required</TableHead>
                    <TableHead>Done</TableHead>
                    <TableHead>Missed</TableHead>
                    <TableHead>Late</TableHead>
                    <TableHead>%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {compliance.map((c, i) => (
                    <TableRow key={`${c.route_id}-${c.date}-${i}`}>
                      <TableCell>{c.date}</TableCell>
                      <TableCell>{c.site_name}</TableCell>
                      <TableCell>{c.route_name}</TableCell>
                      <TableCell className="tabular-nums">{c.required_patrols}</TableCell>
                      <TableCell className="tabular-nums">{c.completed}</TableCell>
                      <TableCell className="tabular-nums">{c.missed}</TableCell>
                      <TableCell className="tabular-nums">{c.late}</TableCell>
                      <TableCell className="tabular-nums font-medium">{c.compliance_pct}%</TableCell>
                    </TableRow>
                  ))}
                  {compliance.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No compliance data.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detail</CardTitle>
            </CardHeader>
            <CardContent className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Checkpoint</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs tabular-nums">{new Date(l.scan_time).toLocaleString()}</TableCell>
                      <TableCell>{l.checkpoint_name}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {l.latitude != null && l.longitude != null
                          ? `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}`
                          : '—'}
                      </TableCell>
                      <TableCell className="capitalize text-xs">{l.status.replace(/_/g, ' ')}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
