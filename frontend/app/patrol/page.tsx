'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { PatrolComplianceRow, PatrolLog, PatrolRoute, Site } from '@/lib/types';
import { toast } from '@/lib/toast';
import { MapPinned, Plus } from 'lucide-react';

export default function PatrolPage() {
  const [routes, setRoutes] = useState<PatrolRoute[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [logs, setLogs] = useState<PatrolLog[]>([]);
  const [compliance, setCompliance] = useState<PatrolComplianceRow[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    site_id: '',
    name: '',
    frequency_minutes: '60',
    start_time: '22:00',
    end_time: '06:00',
  });
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try {
      const [r, s, l, c] = await Promise.all([
        api.patrol.listRoutes(),
        api.sites.list(),
        api.patrol.logs({ start_date: weekAgo, end_date: today }),
        api.patrol.compliance(weekAgo, today),
      ]);
      setRoutes(r);
      setSites(s);
      setLogs(l);
      setCompliance(c);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load patrol data');
    }
  }, [today, weekAgo]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!form.site_id || !form.name.trim()) {
      toast.warning('Site and name are required');
      return;
    }
    try {
      await api.patrol.createRoute({
        site_id: Number(form.site_id),
        name: form.name.trim(),
        frequency_minutes: Number(form.frequency_minutes) || 60,
        start_time: form.start_time,
        end_time: form.end_time,
      });
      toast.success('Patrol route created');
      setOpen(false);
      setForm({ site_id: '', name: '', frequency_minutes: '60', start_time: '22:00', end_time: '06:00' });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title={
              <span className="flex items-center gap-2">
                <MapPinned className="size-7 text-primary" />
                Patrol Management
              </span>
            }
            description="Create routes, QR checkpoints, review scans and compliance."
            actions={
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link href="/patrol/logs">Logs</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/patrol/reports">Reports</Link>
                </Button>
                <Button onClick={() => setOpen(true)}>
                  <Plus className="size-4 mr-1" />
                  New route
                </Button>
              </div>
            }
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Routes</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Frequency</TableHead>
                    <TableHead>Checkpoints</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routes.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell>{r.site_name}</TableCell>
                      <TableCell className="tabular-nums">
                        {r.start_time} – {r.end_time}
                      </TableCell>
                      <TableCell>{r.frequency_minutes} mins</TableCell>
                      <TableCell>{r.checkpoint_count}</TableCell>
                      <TableCell>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/patrol/routes/${r.id}`}>Manage</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {routes.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No patrol routes yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent scans</CardTitle>
              </CardHeader>
              <CardContent className="max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Checkpoint</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.slice(0, 20).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs tabular-nums">
                          {new Date(l.scan_time).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">{l.checkpoint_name}</TableCell>
                        <TableCell className="text-xs capitalize">{l.status.replace('_', ' ')}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Compliance (7 days)</CardTitle>
              </CardHeader>
              <CardContent className="max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compliance.slice(0, 20).map((c, i) => (
                      <TableRow key={`${c.route_id}-${c.date}-${i}`}>
                        <TableCell className="text-xs">{c.date}</TableCell>
                        <TableCell className="text-sm">{c.route_name}</TableCell>
                        <TableCell className="tabular-nums">{c.compliance_pct}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create patrol route</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Site</Label>
                  <Select value={form.site_id || undefined} onValueChange={(v) => setForm((f) => ({ ...f, site_id: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Night Patrol" />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Frequency (mins)</Label>
                    <Input value={form.frequency_minutes} onChange={(e) => setForm((f) => ({ ...f, frequency_minutes: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Start</Label>
                    <Input value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>End</Label>
                    <Input value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={create}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
