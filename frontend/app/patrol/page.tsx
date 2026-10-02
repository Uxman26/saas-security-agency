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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { PatrolDashboardKpis, PatrolLog, PatrolOccurrence, PatrolRoute, Site } from '@/lib/types';
import { toast } from '@/lib/toast';
import { MapPinned, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';

const emptyKpis: PatrolDashboardKpis = {
  total_scheduled: 0,
  completed: 0,
  on_time: 0,
  late: 0,
  missed: 0,
  pending: 0,
  average_lateness_minutes: 0,
  completion_rate_pct: 100,
  missed_by_site: [],
  missed_by_guard: [],
  late_by_site: [],
  late_by_guard: [],
};

function statusLabel(s: string) {
  if (s === 'completed') return 'On time';
  if (s === 'completed_late') return 'Late';
  if (s === 'reminder_sent') return 'Reminder sent';
  return s.replace(/_/g, ' ');
}

export default function PatrolPage() {
  const { user: permUser } = useAuth();
  const canCreateMod = canModule(permUser, 'patrol', 'create');
  const [routes, setRoutes] = useState<PatrolRoute[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [logs, setLogs] = useState<PatrolLog[]>([]);
  const [kpis, setKpis] = useState<PatrolDashboardKpis>(emptyKpis);
  const [occurrences, setOccurrences] = useState<PatrolOccurrence[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    site_id: '',
    name: '',
    frequency_minutes: '60',
    start_time: '22:00',
    end_time: '06:00',
    reminder_minutes: '10',
    grace_minutes: '15',
  });
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

  const load = useCallback(async () => {
    try {
      const [r, s, l, k, o] = await Promise.all([
        api.patrol.listRoutes(),
        api.sites.list(),
        api.patrol.logs({ start_date: weekAgo, end_date: today }),
        api.patrol.dashboardKpis(weekAgo, today),
        api.patrol.occurrences({ start_date: weekAgo, end_date: today }),
      ]);
      setRoutes(r);
      setSites(s);
      setLogs(l);
      setKpis(k);
      setOccurrences(o);
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
        reminder_minutes: Number(form.reminder_minutes) || 10,
        grace_minutes: Number(form.grace_minutes) || 15,
      });
      toast.success('Patrol route created');
      setOpen(false);
      setForm({
        site_id: '',
        name: '',
        frequency_minutes: '60',
        start_time: '22:00',
        end_time: '06:00',
        reminder_minutes: '10',
        grace_minutes: '15',
      });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const kpiCards = [
    { label: 'Scheduled', value: kpis.total_scheduled },
    { label: 'Completed', value: kpis.completed },
    { label: 'On time', value: kpis.on_time },
    { label: 'Late', value: kpis.late },
    { label: 'Missed', value: kpis.missed },
    { label: 'Pending', value: kpis.pending },
    { label: 'Avg lateness', value: `${kpis.average_lateness_minutes}m` },
    { label: 'Completion', value: `${kpis.completion_rate_pct}%` },
  ];

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
            description="Scheduled patrols, QR checkpoints, reminders, and compliance."
            actions={
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link href="/patrol/logs">Logs</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/patrol/reports">Reports</Link>
                </Button>
                {canCreateMod ? (
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="size-4 mr-1" />
                    New route
                  </Button>
                ) : null}
              </div>
            }
          />

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
            {kpiCards.map((c) => (
              <Card key={c.label}>
                <CardContent className="pt-4 pb-3">
                  <div className="text-xs text-muted-foreground">{c.label}</div>
                  <div className="text-xl font-semibold tabular-nums mt-1">{c.value}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Missed by site</CardTitle>
              </CardHeader>
              <CardContent className="max-h-48 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Site</TableHead>
                      <TableHead className="text-right">Missed</TableHead>
                      <TableHead className="text-right">Late</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {kpis.missed_by_site.filter((r) => r.missed > 0).slice(0, 8).map((r) => (
                      <TableRow key={r.site_id}>
                        <TableCell className="text-sm">{r.site_name || r.site_id}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.missed}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.late}</TableCell>
                      </TableRow>
                    ))}
                    {kpis.missed_by_site.every((r) => r.missed === 0) ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                          No missed patrols
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Missed / late by guard</CardTitle>
              </CardHeader>
              <CardContent className="max-h-48 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guard</TableHead>
                      <TableHead className="text-right">Missed</TableHead>
                      <TableHead className="text-right">Late</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...kpis.missed_by_guard]
                      .filter((r) => r.missed > 0 || r.late > 0)
                      .sort((a, b) => b.missed + b.late - (a.missed + a.late))
                      .slice(0, 8)
                      .map((r) => (
                        <TableRow key={r.guard_id}>
                          <TableCell className="text-sm">{r.guard_name || r.guard_id}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.missed}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.late}</TableCell>
                        </TableRow>
                      ))}
                    {kpis.missed_by_guard.every((r) => r.missed === 0 && r.late === 0) ? (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-muted-foreground py-6">
                          No missed or late patrols
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

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
                    <TableHead>Reminder / Grace</TableHead>
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
                      <TableCell className="text-xs tabular-nums">
                        {r.reminder_minutes ?? 10}m / {r.grace_minutes ?? 15}m
                      </TableCell>
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
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
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
                <CardTitle className="text-base">Scheduled occurrences</CardTitle>
              </CardHeader>
              <CardContent className="max-h-80 overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Scheduled</TableHead>
                      <TableHead>Point</TableHead>
                      <TableHead>Guard</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {occurrences.slice(0, 30).map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="text-xs tabular-nums">
                          {new Date(o.scheduled_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-sm">{o.checkpoint_name}</TableCell>
                        <TableCell className="text-sm">{o.guard_name}</TableCell>
                        <TableCell className="text-xs capitalize">{statusLabel(o.status)}</TableCell>
                      </TableRow>
                    ))}
                    {occurrences.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No scheduled occurrences yet. Start a session or assign staff to a site.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
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
                        <TableCell className="text-xs capitalize">{statusLabel(l.status)}</TableCell>
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
                  <SearchableSelect
                    value={form.site_id || ''}
                    onChange={(v) => setForm((f) => ({ ...f, site_id: v }))}
                    options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
                    placeholder="Select site"
                    searchPlaceholder="Search sites…"
                    emptyText="No sites found"
                  />
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
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label>Reminder (mins before)</Label>
                    <Input value={form.reminder_minutes} onChange={(e) => setForm((f) => ({ ...f, reminder_minutes: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Late window / grace (mins)</Label>
                    <Input value={form.grace_minutes} onChange={(e) => setForm((f) => ({ ...f, grace_minutes: e.target.value }))} />
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
