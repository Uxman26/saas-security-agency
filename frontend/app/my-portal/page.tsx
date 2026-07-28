'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import type { PortalHours, RotaDetail, Site } from '@/lib/types';
import { CalendarDays, Clock, MapPin, UserCircle } from 'lucide-react';
import { toast } from '@/lib/toast';

type Tab = 'sites' | 'current' | 'upcoming' | 'previous' | 'hours';

export default function MyPortalPage() {
  const { user } = useAuth();
  const canUpcoming = can(user, 'portal.rota.upcoming');
  const canPrevious = can(user, 'portal.rota.previous');
  const isStaff = (user?.role || '').toLowerCase() === 'staff' || canUpcoming;

  const tabs = useMemo(
    () =>
      [
        { id: 'sites' as const, label: 'My sites' },
        { id: 'current' as const, label: 'Current rota' },
        ...(canUpcoming ? [{ id: 'upcoming' as const, label: 'Upcoming rota' }] : []),
        ...(canPrevious ? [{ id: 'previous' as const, label: 'Previous rota' }] : []),
        { id: 'hours' as const, label: 'Working hours' },
      ],
    [canUpcoming, canPrevious]
  );

  const [tab, setTab] = useState<Tab>('sites');
  const [sites, setSites] = useState<Site[]>([]);
  const [rota, setRota] = useState<RotaDetail[]>([]);
  const [hours, setHours] = useState<PortalHours | null>(null);
  const [period, setPeriod] = useState<'week' | 'month' | 'custom'>('week');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [loading, setLoading] = useState(false);

  const loadTab = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      if (tab === 'sites') {
        setSites(await api.portal.sites());
      } else if (tab === 'current') {
        setRota(await api.portal.rotaCurrent());
      } else if (tab === 'upcoming') {
        setRota(await api.portal.rotaUpcoming());
      } else if (tab === 'previous') {
        setRota(await api.portal.rotaPrevious());
      } else if (tab === 'hours') {
        setHours(
          await api.portal.hours(
            period === 'custom'
              ? { period: 'custom', start_date: customStart, end_date: customEnd }
              : { period }
          )
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [tab, user, period, customStart, customEnd]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title={
              <span className="flex items-center gap-2">
                <UserCircle className="size-7 text-primary" />
                {isStaff ? 'Staff portal' : 'Client portal'}
              </span>
            }
            description="View only your assigned sites, rotas, and working hours."
          />

          <ModuleTabs tabs={tabs} value={tab} onChange={setTab} />

          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : null}

          {tab === 'sites' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="size-5 text-primary" />
                  Assigned sites
                </CardTitle>
              </CardHeader>
              <CardContent>
                {sites.length === 0 ? (
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
                        {sites.map((s) => (
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
                  <Button
                    size="sm"
                    variant={period === 'week' ? 'default' : 'outline'}
                    onClick={() => setPeriod('week')}
                  >
                    This week
                  </Button>
                  <Button
                    size="sm"
                    variant={period === 'month' ? 'default' : 'outline'}
                    onClick={() => setPeriod('month')}
                  >
                    This month
                  </Button>
                  <Button
                    size="sm"
                    variant={period === 'custom' ? 'default' : 'outline'}
                    onClick={() => setPeriod('custom')}
                  >
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
                    <p className="text-2xl font-semibold tabular-nums">{hours.total_hours.toFixed(2)} hrs</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {hours.shifts_count} shift{hours.shifts_count === 1 ? '' : 's'} · {hours.start_date} to {hours.end_date}
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          )}
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
