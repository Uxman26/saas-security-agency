'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModulePage } from '@/components/module-layout';
import {
  DashboardHeader,
  FilterBar,
  FilterField,
  Pill,
  QuickLinks,
  ResultsCard,
  ShowingCount,
  StatCards,
  type StatCardSpec,
} from '@/components/module-dashboard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import type { IncidentCatalogue, Incident, Site } from '@/lib/types';
import { toast } from '@/lib/toast';
import { openAuthFile } from '@/lib/use-auth-blob-url';
import { AlertTriangle, BarChart3, Plus } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';

/** Attachments are served from an authenticated endpoint, so a plain link cannot load them. */
async function openAttachment(url: string) {
  if (!(await openAuthFile(url))) toast.error('Could not open attachment');
}

export default function IncidentsPage() {
  // The API is the real boundary; these stop the UI offering actions it
  // already knows the role will be refused.
  const { user: permUser } = useAuth();
  const canCreateMod = canModule(permUser, 'incidents', 'create');
  const canEditMod = canModule(permUser, 'incidents', 'edit');
  const canDeleteMod = canModule(permUser, 'incidents', 'delete');
  const [items, setItems] = useState<Incident[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Incident | null>(null);
  const [form, setForm] = useState({
    notes: '', site_id: '', latitude: '', longitude: '',
    category: 'other', police_called: false, ambulance_called: false, fire_brigade_called: false,
  });
  // Category list comes from the API so the incident form and the summary report can
  // never drift apart; a static copy here would be a second source of truth.
  const [catalogue, setCatalogue] = useState<IncidentCatalogue | null>(null);
  useEffect(() => {
    api.incidents.catalogue().then(setCatalogue).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([
        api.incidents.list(statusFilter === 'all' ? undefined : { status: statusFilter }),
        api.sites.list(),
      ]);
      setItems(list);
      setSites(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load incidents');
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!form.notes.trim()) {
      toast.warning('Notes are required');
      return;
    }
    try {
      await api.incidents.create({
        notes: form.notes.trim(),
        category: form.category,
        police_called: form.police_called,
        ambulance_called: form.ambulance_called,
        fire_brigade_called: form.fire_brigade_called,
        site_id: form.site_id ? Number(form.site_id) : undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
      });
      toast.success('Incident raised');
      setOpen(false);
      setForm({
        notes: '', site_id: '', latitude: '', longitude: '',
        category: 'other', police_called: false, ambulance_called: false, fire_brigade_called: false,
      });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const setStatus = async (id: number, status: string) => {
    try {
      await api.incidents.update(id, { status });
      toast.success('Status updated');
      setDetail(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const countBy = (status: string) => items.filter((i) => i.status === status).length;

  /** The cards along the top, in the shape every module dashboard uses. */
  const statCards: StatCardSpec[] = [
    { key: 'total', label: 'Incidents', value: items.length, icon: AlertTriangle, tone: 'neutral' },
    {
      key: 'open',
      label: 'Open',
      value: countBy('open'),
      icon: AlertTriangle,
      tone: 'danger',
      action: countBy('open') ? { label: 'View', onClick: () => setStatusFilter('open') } : undefined,
    },
    {
      key: 'reviewing',
      label: 'Reviewing',
      value: countBy('reviewing'),
      icon: BarChart3,
      tone: 'warning',
      action: countBy('reviewing') ? { label: 'View', onClick: () => setStatusFilter('reviewing') } : undefined,
    },
    {
      key: 'closed',
      label: 'Closed',
      value: countBy('closed'),
      icon: BarChart3,
      tone: 'positive',
      action: countBy('closed') ? { label: 'View', onClick: () => setStatusFilter('closed') } : undefined,
    },
  ];

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <DashboardHeader
            title="Incidents"
            hint="An incident stays open until someone reviews and closes it, so the open count is the queue rather than a total."
            description="Raise, review and close incident reports from across your sites."
            actions={
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link href="/incidents/reports">
                    <BarChart3 className="size-4 mr-1" />
                    Summary
                  </Link>
                </Button>
                {canCreateMod ? (
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="size-4 mr-1" />
                    Raise incident
                  </Button>
                ) : null}
              </div>
            }
          />

          <StatCards cards={statCards} />

          <FilterBar onClear={() => setStatusFilter('all')}>
            <FilterField label="Status">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="reviewing">Reviewing</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
          </FilterBar>

          <ResultsCard title="Incidents" count={items.length}>
            <div className="p-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Reporter</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Called</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((inc) => (
                    <TableRow key={inc.id}>
                      <TableCell className="text-xs tabular-nums whitespace-nowrap">
                        {new Date(inc.occurred_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{inc.site_name || '—'}</TableCell>
                      <TableCell className="text-xs">{inc.category_label || '—'}</TableCell>
                      <TableCell>{inc.reported_by_name || inc.reported_by_user_id}</TableCell>
                      <TableCell className="max-w-xs truncate">{inc.notes}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {[inc.police_called && 'Police', inc.ambulance_called && 'Ambulance', inc.fire_brigade_called && 'Fire']
                          .filter(Boolean).join(', ') || <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <Pill
                          dot
                          tone={
                            inc.status === 'closed' ? 'positive' : inc.status === 'reviewing' ? 'warning' : 'danger'
                          }
                        >
                          {inc.status.charAt(0).toUpperCase() + inc.status.slice(1)}
                        </Pill>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              setDetail(await api.incidents.get(inc.id));
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Load failed');
                            }
                          }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No incidents found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
              {items.length > 0 ? (
                <div className="mt-3 border-t pt-3">
                  <ShowingCount rangeStart={1} rangeEnd={items.length} total={items.length} noun="incidents" />
                </div>
              ) : null}
            </div>
          </ResultsCard>

          <QuickLinks
            links={[
              {
                key: 'accidents',
                title: 'Accident reports',
                description: 'RIDDOR-style records for injuries and near misses.',
                icon: AlertTriangle,
                tone: 'warning',
                action: { label: 'View accident reports', href: '/accident-reports' },
              },
              {
                key: 'occurrence',
                title: 'Occurrence sheets',
                description: 'The shift-by-shift log each site keeps.',
                icon: BarChart3,
                tone: 'neutral',
                action: { label: 'View occurrence sheets', href: '/occurrence-sheets' },
              },
              {
                key: 'summary',
                title: 'Incident summary',
                description: 'Trends by site, category and outcome.',
                icon: BarChart3,
                tone: 'info',
                action: { label: 'Open summary', href: '/incidents/reports' },
              },
            ]}
          />

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Raise incident</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {(catalogue?.categories ?? []).map((c) => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Drives the monthly Incident Reports Summary.</p>
                </div>
                <div className="space-y-1">
                  <Label>Emergency services called</Label>
                  <div className="flex flex-wrap gap-4 rounded-md border p-3">
                    {(catalogue?.services ?? []).map((svc) => (
                      <label key={svc.key} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="rounded border"
                          checked={Boolean(form[svc.key as 'police_called'])}
                          onChange={(e) => setForm((f) => ({ ...f, [svc.key]: e.target.checked }))}
                        />
                        {svc.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea rows={4} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Site (optional)</Label>
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
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Latitude</Label>
                    <Input value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Longitude</Label>
                    <Input value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={create}>
                  Submit
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Incident #{detail?.id}</DialogTitle>
              </DialogHeader>
              {detail ? (
                <div className="space-y-3 text-sm">
                  <p>
                    <span className="text-muted-foreground">Status:</span>{' '}
                    <span className="capitalize font-medium">{detail.status}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Occurred:</span>{' '}
                    {new Date(detail.occurred_at).toLocaleString()}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Site:</span> {detail.site_name || '—'}
                  </p>
                  <p className="whitespace-pre-wrap border rounded-md p-3 bg-muted/30">{detail.notes}</p>
                  {(detail.attachments || []).length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Attachments</p>
                      <ul className="list-disc pl-5">
                        {detail.attachments!.map((a) => (
                          <li key={a.id}>
                            {a.url ? (
                              <button
                                type="button"
                                onClick={() => void openAttachment(a.url!)}
                                className="text-primary underline"
                              >
                                View file
                              </button>
                            ) : (
                              a.file_path
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {detail.status !== 'reviewing' ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(detail.id, 'reviewing')}>
                        Mark reviewing
                      </Button>
                    ) : null}
                    {detail.status !== 'closed' ? (
                      <Button size="sm" onClick={() => setStatus(detail.id, 'closed')}>
                        Close
                      </Button>
                    ) : null}
                    {detail.status === 'closed' ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(detail.id, 'open')}>
                        Reopen
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
