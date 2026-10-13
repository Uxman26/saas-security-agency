'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { InlineFormSkeleton } from '@/components/skeletons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { can, canModule } from '@/lib/permissions';
import { localDateKey, localDateOffset } from '@/lib/date-format';
import type {
  Incident,
  PatrolComplianceRow,
  PatrolToday,
  PortalHours,
  RotaDetail,
  Site,
} from '@/lib/types';
import { AlertTriangle, CalendarDays, Clock, MapPin, MapPinned, UserCircle } from 'lucide-react';
import { toast } from '@/lib/toast';
import { PortalSiteSwitcher, usePortalSiteScope } from '@/components/portal-site-switcher';

type Tab = 'sites' | 'current' | 'upcoming' | 'previous' | 'hours' | 'patrol' | 'incidents';

export default function MyPortalPage() {
  const { user } = useAuth();
  const role = (user?.role || '').toLowerCase();
  // Role only — canUpcoming used to flip clients into the staff patrol UI.
  const isStaff = role === 'staff';

  const canRotaCurrent = canModule(user, 'my_portal', 'rota_current') || can(user, 'portal.rota.current');
  const canUpcoming = canModule(user, 'my_portal', 'rota_upcoming') || can(user, 'portal.rota.upcoming');
  const canPrevious = canModule(user, 'my_portal', 'rota_previous') || can(user, 'portal.rota.previous');
  const canHours = canModule(user, 'my_portal', 'hours_view') || can(user, 'portal.hours.read');
  const canPatrolToday =
    isStaff &&
    (canModule(user, 'my_portal', 'patrol_today') || can(user, 'patrol.read') || can(user, 'patrol.scan'));
  const canPatrolCompliance =
    !isStaff &&
    (canModule(user, 'my_portal', 'patrol_compliance') ||
      can(user, 'patrol.reports') ||
      can(user, 'patrol.read'));
  const canPatrol = canPatrolToday || canPatrolCompliance;
  const canStartPatrol =
    canModule(user, 'patrol', 'session_start') || canModule(user, 'patrol', 'edit');
  const canIncidentRead =
    canModule(user, 'my_portal', 'incidents_view') ||
    can(user, 'incident.read') ||
    canModule(user, 'incidents', 'view');
  const canIncidentWrite =
    canModule(user, 'my_portal', 'incidents_create') ||
    can(user, 'incident.write') ||
    canModule(user, 'incidents', 'create');
  const canClientPortal = canModule(user, 'client_portal', 'view') || canModule(user, 'client_portal', 'create');

  const tabs = useMemo(
    () =>
      [
        { id: 'sites' as const, label: 'My sites' },
        ...(canRotaCurrent ? [{ id: 'current' as const, label: 'Current rota' }] : []),
        ...(canUpcoming ? [{ id: 'upcoming' as const, label: 'Upcoming rota' }] : []),
        ...(canPrevious ? [{ id: 'previous' as const, label: 'Previous rota' }] : []),
        ...(canHours ? [{ id: 'hours' as const, label: 'Working hours' }] : []),
        ...(canPatrol
          ? [{ id: 'patrol' as const, label: canPatrolToday ? 'Today patrol' : 'Patrol compliance' }]
          : []),
        ...(canIncidentRead || canIncidentWrite ? [{ id: 'incidents' as const, label: 'Incidents' }] : []),
      ],
    [
      canRotaCurrent,
      canUpcoming,
      canPrevious,
      canHours,
      canPatrol,
      canPatrolToday,
      canIncidentRead,
      canIncidentWrite,
    ]
  );

  const [tab, setTab] = useState<Tab>('sites');
  const [sites, setSites] = useState<Site[]>([]);
  const [rota, setRota] = useState<RotaDetail[]>([]);
  const [hours, setHours] = useState<PortalHours | null>(null);
  const [period, setPeriod] = useState<'week' | 'month' | 'custom'>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(false);
  const [patrolToday, setPatrolToday] = useState<PatrolToday | null>(null);
  const [compliance, setCompliance] = useState<PatrolComplianceRow[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [incForm, setIncForm] = useState({ notes: '', site_id: '', latitude: '', longitude: '' });

  const today = localDateKey();
  const weekAgo = localDateOffset(-7);

  const { siteId, select: selectSite } = usePortalSiteScope(sites);

  const visibleSites = useMemo(
    () => (siteId == null ? sites : sites.filter((s) => s.id === siteId)),
    [sites, siteId]
  );
  const visibleIncidents = useMemo(
    () => (siteId == null ? incidents : incidents.filter((i) => i.site_id === siteId)),
    [incidents, siteId]
  );

  useEffect(() => {
    if (!tabs.some((t) => t.id === tab)) setTab((tabs[0]?.id as Tab) ?? 'sites');
  }, [tabs, tab]);

  useEffect(() => {
    if (!user) return;
    api.portal
      .sites()
      .then(setSites)
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load sites'));
  }, [user]);

  const loadTab = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (tab === 'sites') {
        // Header switcher loads sites once on mount; no second round-trip here.
      } else if (tab === 'current') {
        setRota(await api.portal.rotaCurrent(siteId ?? undefined));
      } else if (tab === 'upcoming') {
        setRota(await api.portal.rotaUpcoming(siteId ?? undefined));
      } else if (tab === 'previous') {
        setRota(await api.portal.rotaPrevious(siteId ?? undefined));
      } else if (tab === 'hours') {
        if (period === 'custom' && (!customStart || !customEnd)) {
          setHours(null);
        } else {
          setHours(
            await api.portal.hours(
              period === 'custom'
                ? {
                    period: 'custom',
                    start_date: customStart,
                    end_date: customEnd,
                    site_id: siteId ?? undefined,
                  }
                : { period, site_id: siteId ?? undefined }
            )
          );
        }
      } else if (tab === 'patrol') {
        if (canPatrolToday) {
          setPatrolToday(await api.portal.patrolToday());
        } else if (canPatrolCompliance) {
          setCompliance(await api.portal.patrolCompliance(weekAgo, today, siteId ?? undefined));
        }
      } else if (tab === 'incidents') {
        setIncidents(await api.portal.incidents({ site_id: siteId ?? undefined }));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [
    tab,
    user,
    period,
    customStart,
    customEnd,
    canPatrolToday,
    canPatrolCompliance,
    weekAgo,
    today,
    siteId,
  ]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const raiseIncident = async () => {
    if (!incForm.notes.trim()) {
      toast.warning('Notes are required');
      return;
    }
    try {
      await api.portal.createIncident({
        notes: incForm.notes.trim(),
        site_id: incForm.site_id ? Number(incForm.site_id) : undefined,
        latitude: incForm.latitude ? Number(incForm.latitude) : undefined,
        longitude: incForm.longitude ? Number(incForm.longitude) : undefined,
      });
      toast.success('Incident submitted');
      setRaiseOpen(false);
      setIncForm({ notes: '', site_id: '', latitude: '', longitude: '' });
      setIncidents(await api.portal.incidents({ site_id: siteId ?? undefined }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to raise incident');
    }
  };

  const startPatrol = async () => {
    if (!patrolToday?.route_id) {
      toast.warning('No active patrol route');
      return;
    }
    try {
      await api.patrol.startSession({ route_id: patrolToday.route_id });
      toast.success('Patrol session started');
      setPatrolToday(await api.portal.patrolToday());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start session');
    }
  };

  const openRaise = () => {
    setIncForm((f) => ({
      ...f,
      site_id: siteId != null ? String(siteId) : f.site_id || (visibleSites[0] ? String(visibleSites[0].id) : ''),
    }));
    setRaiseOpen(true);
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title={
              <span className="flex items-center gap-2">
                <UserCircle className="size-7 text-primary" />
                My workspace
              </span>
            }
            description={
              isStaff
                ? 'Your sites, rotas, patrol status, and incidents.'
                : 'Your sites, rotas, patrol compliance, and incidents.'
            }
            actions={
              <div className="flex flex-wrap items-center gap-2">
                {canClientPortal ? (
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/client-portal">Request staff</Link>
                  </Button>
                ) : null}
                <PortalSiteSwitcher sites={sites} siteId={siteId} onChange={selectSite} />
              </div>
            }
          />

          <ModuleTabs tabs={tabs} value={tab} onChange={(id) => setTab(id as Tab)} />

          {loading ? <InlineFormSkeleton /> : null}

          {tab === 'sites' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="size-5 text-primary" />
                  Assigned sites
                </CardTitle>
              </CardHeader>
              <CardContent>
                {visibleSites.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No sites assigned to your account.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Address</TableHead>
                          <TableHead>Postcode</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {visibleSites.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.name}</TableCell>
                            <TableCell>{s.address || '—'}</TableCell>
                            <TableCell>{s.postcode || '—'}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {(tab === 'current' || tab === 'upcoming' || tab === 'previous') && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="size-5 text-primary" />
                  {tab === 'current' ? 'Current week rota' : tab === 'upcoming' ? 'Upcoming shifts' : 'Previous shifts'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {rota.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No shifts in this view.</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          {!isStaff ? <TableHead>Staff</TableHead> : null}
                          <TableHead>Site</TableHead>
                          <TableHead>Shift</TableHead>
                          <TableHead className="text-right">Hours</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rota.map((r) => (
                          <TableRow key={`${r.id}-${r.date}-${r.shift_start}`}>
                            <TableCell>{r.date}</TableCell>
                            {!isStaff ? <TableCell>{r.guard_name}</TableCell> : null}
                            <TableCell>{r.site_name}</TableCell>
                            <TableCell>
                              {r.shift_start || '—'} – {r.shift_end || '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{r.hours.toFixed(2)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {tab === 'hours' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="size-5 text-primary" />
                  Total working hours
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={period === 'week' ? 'default' : 'outline'} onClick={() => setPeriod('week')}>
                    This week
                  </Button>
                  <Button size="sm" variant={period === 'month' ? 'default' : 'outline'} onClick={() => setPeriod('month')}>
                    This month
                  </Button>
                  <Button size="sm" variant={period === 'custom' ? 'default' : 'outline'} onClick={() => setPeriod('custom')}>
                    Custom range
                  </Button>
                </div>
                {period === 'custom' && (
                  <div className="grid gap-3 sm:grid-cols-2 max-w-md">
                    <div>
                      <Label htmlFor="start">Start date</Label>
                      <Input id="start" type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="mt-1" />
                    </div>
                    <div>
                      <Label htmlFor="end">End date</Label>
                      <Input id="end" type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="mt-1" />
                    </div>
                    <Button onClick={() => loadTab()} disabled={!customStart || !customEnd}>
                      Apply range
                    </Button>
                  </div>
                )}
                {hours ? (
                  <div className="rounded-lg border bg-muted/30 p-4">
                    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                      <p className="text-2xl font-semibold tabular-nums">{hours.total_hours.toFixed(2)} hrs</p>
                      {hours.total_pay != null ? (
                        <p className="text-2xl font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                          £{hours.total_pay.toFixed(2)}
                        </p>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {hours.shifts_count} shift{hours.shifts_count === 1 ? '' : 's'} · {hours.start_date} to {hours.end_date}
                    </p>
                    {hours.total_pay != null ? (
                      <p className="text-xs text-muted-foreground mt-1">
                        Estimated pay before deductions. Your payslip is the final figure.
                      </p>
                    ) : null}
                  </div>
                ) : period === 'custom' && (!customStart || !customEnd) ? (
                  <p className="text-sm text-muted-foreground">Choose a start and end date, then apply.</p>
                ) : null}
              </CardContent>
            </Card>
          )}

          {tab === 'patrol' && canPatrolToday && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPinned className="size-5 text-primary" />
                  Today&apos;s patrol
                </CardTitle>
                {canStartPatrol && patrolToday?.route_id && !patrolToday.session ? (
                  <Button size="sm" onClick={startPatrol}>
                    Start session
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent className="space-y-4">
                {patrolToday?.route_name ? (
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-1">
                    <p className="font-medium">{patrolToday.route_name}</p>
                    <p className="text-sm text-muted-foreground">{patrolToday.site_name}</p>
                    {patrolToday.session ? (
                      <p className="text-xs capitalize">Session: {patrolToday.session.status}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground">No active session</p>
                    )}
                    {patrolToday.next_checkpoint ? (
                      <p className="text-sm pt-2">
                        Next: <span className="font-medium">{patrolToday.next_checkpoint.name}</span>
                        <span className="ml-2 font-mono text-xs text-muted-foreground">
                          {patrolToday.next_checkpoint.code}
                        </span>
                      </p>
                    ) : null}
                    {patrolToday.due_at ? (
                      <p className="text-xs text-muted-foreground">Due: {patrolToday.due_at}</p>
                    ) : null}
                    <p className="text-xs text-muted-foreground pt-2">
                      Use the mobile app to scan checkpoint QR codes with GPS validation.
                    </p>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No patrol assigned for today.</p>
                )}
                {(patrolToday?.recent_logs || []).length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Time</TableHead>
                        <TableHead>Checkpoint</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {patrolToday!.recent_logs!.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs">{new Date(l.scan_time).toLocaleString()}</TableCell>
                          <TableCell>{l.checkpoint_name}</TableCell>
                          <TableCell className="capitalize text-xs">{l.status.replace(/_/g, ' ')}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : null}
              </CardContent>
            </Card>
          )}

          {tab === 'patrol' && canPatrolCompliance && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPinned className="size-5 text-primary" />
                  Patrol compliance (7 days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Done</TableHead>
                      <TableHead>Missed</TableHead>
                      <TableHead>%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {compliance.map((c, i) => (
                      <TableRow key={`${c.route_id}-${c.date}-${i}`}>
                        <TableCell>{c.date}</TableCell>
                        <TableCell>{c.site_name}</TableCell>
                        <TableCell>{c.route_name}</TableCell>
                        <TableCell className="tabular-nums">{c.completed}</TableCell>
                        <TableCell className="tabular-nums">{c.missed}</TableCell>
                        <TableCell className="tabular-nums font-medium">{c.compliance_pct}%</TableCell>
                      </TableRow>
                    ))}
                    {compliance.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                          No compliance data for your sites.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {tab === 'incidents' && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertTriangle className="size-5 text-primary" />
                  Incidents
                </CardTitle>
                {canIncidentWrite ? (
                  <Button size="sm" onClick={openRaise}>
                    Raise incident
                  </Button>
                ) : null}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleIncidents.map((inc) => (
                      <TableRow key={inc.id}>
                        <TableCell className="text-xs whitespace-nowrap">{new Date(inc.occurred_at).toLocaleString()}</TableCell>
                        <TableCell>{inc.site_name || '—'}</TableCell>
                        <TableCell className="max-w-xs truncate">{inc.notes}</TableCell>
                        <TableCell className="capitalize text-xs">{inc.status}</TableCell>
                      </TableRow>
                    ))}
                    {visibleIncidents.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                          No incidents yet.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Dialog open={raiseOpen} onOpenChange={setRaiseOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Raise incident</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea rows={4} value={incForm.notes} onChange={(e) => setIncForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Site</Label>
                  <Select value={incForm.site_id || undefined} onValueChange={(v) => setIncForm((f) => ({ ...f, site_id: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {visibleSites.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Latitude</Label>
                    <Input value={incForm.latitude} onChange={(e) => setIncForm((f) => ({ ...f, latitude: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Longitude</Label>
                    <Input value={incForm.longitude} onChange={(e) => setIncForm((f) => ({ ...f, longitude: e.target.value }))} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRaiseOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={raiseIncident}>
                  Submit
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
