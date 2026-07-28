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
import type { PatrolLog } from '@/lib/types';
import { toast } from '@/lib/toast';
import { ArrowLeft, List } from 'lucide-react';

export default function PatrolLogsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  const [start, setStart] = useState(weekAgo);
  const [end, setEnd] = useState(today);
  const [logs, setLogs] = useState<PatrolLog[]>([]);

  const load = useCallback(async () => {
    try {
      setLogs(await api.patrol.logs({ start_date: start, end_date: end }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load logs');
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
                <List className="size-7 text-primary" />
                Patrol logs
              </span>
            }
            description="Scan history by date range."
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
              <CardTitle className="text-base">Filters</CardTitle>
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
                    <TableHead>Time</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Checkpoint</TableHead>
                    <TableHead>Guard</TableHead>
                    <TableHead>Distance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs tabular-nums">{new Date(l.scan_time).toLocaleString()}</TableCell>
                      <TableCell>{l.route_name}</TableCell>
                      <TableCell>
                        <span className="font-medium">{l.checkpoint_name}</span>
                        {l.checkpoint_code ? (
                          <span className="ml-1 text-xs text-muted-foreground font-mono">{l.checkpoint_code}</span>
                        ) : null}
                      </TableCell>
                      <TableCell>{l.guard_name || l.guard_id}</TableCell>
                      <TableCell className="tabular-nums">{l.distance_m != null ? `${l.distance_m.toFixed(1)}m` : '—'}</TableCell>
                      <TableCell className="capitalize text-xs">{l.status.replace(/_/g, ' ')}</TableCell>
                    </TableRow>
                  ))}
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No scans in this range.
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
