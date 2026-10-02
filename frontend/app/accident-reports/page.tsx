'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleGuard } from '@/components/module-guard';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { api } from '@/lib/api';
import type { AccidentReport, Site } from '@/lib/types';
import { ClipboardCheck, Download, Plus, Printer, Trash2, Pencil, Search, AlertTriangle } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'under_review', label: 'Under review' },
  { value: 'closed', label: 'Closed' },
] as const;
const STATUS_LABELS: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));

const SERVICES = [
  { key: 'police', label: 'Police' },
  { key: 'fire', label: 'Fire Service' },
  { key: 'ambulance', label: 'Ambulance' },
] as const;

type FormState = Record<string, string | boolean>;

const EMPTY: FormState = {
  report_date: '',
  supervisor_name: '',
  site_id: '',
  sia_number: '',
  accident_type: '',
  accident_time: '',
  accident_location: '',
  persons_involved: '',
  comments: '',
  status: 'open',
  police_informed: false,
  police_time_informed: '',
  police_time_attended: '',
  police_time_left: '',
  fire_informed: false,
  fire_time_informed: '',
  fire_time_attended: '',
  fire_time_left: '',
  ambulance_informed: false,
  ambulance_time_informed: '',
  ambulance_time_attended: '',
  ambulance_time_left: '',
};

function statusTone(status: string): 'muted' | 'warning' | 'positive' | 'info' {
  if (status === 'closed') return 'positive';
  if (status === 'under_review') return 'warning';
  return 'muted';
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AccidentReportsPage() {
  const { user } = useAuth();
  const canCreate = canModule(user, 'accident_reports', 'create');
  const canEdit = canModule(user, 'accident_reports', 'edit');
  const canDelete = canModule(user, 'accident_reports', 'delete');
  const canPdf = canModule(user, 'accident_reports', 'pdf_download');
  const canBlank = canModule(user, 'accident_reports', 'blank_form');

  const [rows, setRows] = useState<AccidentReport[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [q, setQ] = useState('');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccidentReport | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.accidentReports
      .list({
        start_date: from || undefined,
        end_date: to || undefined,
        status: statusFilter === 'all' ? undefined : statusFilter,
      })
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [from, to, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.sites.list().then(setSites).catch(() => {}); }, []);

  const set = (key: string, value: string | boolean) => setForm((f) => ({ ...f, [key]: value }));

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY, report_date: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  };

  const openEdit = (r: AccidentReport) => {
    setEditing(r);
    const next: FormState = { ...EMPTY };
    Object.keys(EMPTY).forEach((k) => {
      const v = (r as unknown as Record<string, unknown>)[k];
      next[k] = typeof v === 'boolean' ? v : v == null ? '' : String(v);
    });
    next.site_id = r.site_id ? String(r.site_id) : '';
    next.status = r.status || 'open';
    setForm(next);
    setOpen(true);
  };

  const save = async () => {
    if (!form.report_date || !String(form.supervisor_name).trim()) {
      toast.error('Date and supervisor name are required');
      return;
    }
    setSaving(true);
    const payload: Record<string, unknown> = {};
    Object.entries(form).forEach(([k, v]) => {
      if (typeof v === 'boolean') payload[k] = v;
      else if (k === 'site_id') payload[k] = v ? parseInt(v, 10) : null;
      else if (k === 'status' && !editing) return;
      else payload[k] = v === '' ? null : v;
    });
    try {
      if (editing) await api.accidentReports.update(editing.id, payload);
      else await api.accidentReports.create(payload);
      toast.success(editing ? 'Report updated' : 'Accident report logged');
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the report');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (r: AccidentReport, next: string) => {
    if (!canEdit || next === r.status) return;
    setStatusBusyId(r.id);
    try {
      await api.accidentReports.update(r.id, { status: next });
      toast.snack(`Status set to ${STATUS_LABELS[next] ?? next}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update status');
    } finally {
      setStatusBusyId(null);
    }
  };

  const remove = (r: AccidentReport) => {
    toast.confirm(`Delete ${r.reference ?? 'this report'}?`, async () => {
      try {
        await api.accidentReports.remove(r.id);
        toast.snack('Report deleted');
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not delete');
      }
    }, { label: 'Delete', description: 'This cannot be undone.' });
  };

  const downloadPdf = async (r: AccidentReport) => {
    try {
      saveBlob(await api.accidentReports.pdf(r.id), `${(r.reference ?? `accident-${r.id}`).toLowerCase()}.pdf`);
    } catch {
      toast.error('Could not download the PDF');
    }
  };

  const downloadBlank = async () => {
    try {
      saveBlob(await api.accidentReports.blankPdf(), 'accident-report-log-blank.pdf');
    } catch {
      toast.error('Could not download the blank form');
    }
  };

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => {
      const hay = [
        r.reference,
        r.site_name,
        r.supervisor_name,
        r.accident_type,
        r.accident_location,
        r.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, q]);

  const byStatus = (k: string) => rows.filter((r) => r.status === k).length;

  const statCards: StatCardSpec[] = [
    { key: 'total', label: 'Reports', value: rows.length, icon: ClipboardCheck, tone: 'neutral' },
    {
      key: 'open',
      label: 'Open',
      value: byStatus('open'),
      icon: AlertTriangle,
      tone: 'muted',
      action: byStatus('open') ? { label: 'View', onClick: () => setStatusFilter('open') } : undefined,
    },
    {
      key: 'under_review',
      label: 'Under review',
      value: byStatus('under_review'),
      icon: Search,
      tone: 'warning',
      action: byStatus('under_review') ? { label: 'View', onClick: () => setStatusFilter('under_review') } : undefined,
    },
    {
      key: 'closed',
      label: 'Closed',
      value: byStatus('closed'),
      icon: ClipboardCheck,
      tone: 'positive',
      action: byStatus('closed') ? { label: 'View', onClick: () => setStatusFilter('closed') } : undefined,
    },
    {
      key: 'services',
      label: 'Services called',
      value: rows.filter((r) => r.police_informed || r.ambulance_informed || r.fire_informed).length,
      icon: Printer,
      tone: 'danger',
      caption: 'police, ambulance or fire',
    },
  ];

  return (
    <ProtectedRoute>
      <AppShell>
        <ModuleGuard moduleKey="accident_reports">
          <ModulePage>
            <DashboardHeader
              title="Accident Report Log"
              hint="X-FORM-077. Complete digitally, or print a blank for paper sites and key it in afterwards."
              description="Corporate accident report log for injuries, near misses, and emergency services attendance — suitable for client submission and record-keeping."
              actions={
                <div className="flex flex-wrap gap-2">
                  {canBlank ? (
                    <Button variant="outline" onClick={() => void downloadBlank()}>
                      <Printer className="size-4 mr-1.5" />
                      Print blank form
                    </Button>
                  ) : null}
                  {canCreate ? (
                    <Button onClick={openNew}>
                      <Plus className="size-4 mr-1.5" />
                      New report
                    </Button>
                  ) : null}
                </div>
              }
            />

            <StatCards cards={statCards} />

            <FilterBar
              onSearch={load}
              searching={loading}
              onClear={() => {
                setFrom('');
                setTo('');
                setStatusFilter('all');
                setQ('');
              }}
            >
              <FilterField label="Search">
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Reference, site, supervisor…"
                />
              </FilterField>
              <FilterField label="From">
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </FilterField>
              <FilterField label="To">
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </FilterField>
              <FilterField label="Status">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            </FilterBar>

            <ResultsCard title="Accident reports" count={loading ? undefined : filtered.length}>
              <div className="p-4">
                <div className="overflow-x-auto rounded-md border bg-card">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Reference</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Site</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Supervisor</TableHead>
                        <TableHead>Services</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 && !loading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-10">
                            No accident reports match these filters.
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {filtered.map((r) => {
                        const called = [
                          r.police_informed ? 'Police' : null,
                          r.fire_informed ? 'Fire' : null,
                          r.ambulance_informed ? 'Ambulance' : null,
                        ].filter(Boolean);
                        return (
                          <TableRow key={r.id} className="align-middle">
                            <TableCell className="font-mono text-xs font-medium">{r.reference ?? '—'}</TableCell>
                            <TableCell className="whitespace-nowrap tabular-nums text-sm">{r.report_date}</TableCell>
                            <TableCell className="max-w-[10rem] truncate">{r.site_name ?? '—'}</TableCell>
                            <TableCell className="max-w-[12rem] truncate">{r.accident_type ?? '—'}</TableCell>
                            <TableCell className="max-w-[10rem] truncate">{r.supervisor_name}</TableCell>
                            <TableCell>
                              {called.length ? (
                                <div className="flex flex-wrap gap-1">
                                  {called.map((c) => (
                                    <Pill key={String(c)} tone="danger">{c}</Pill>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">None</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {canEdit ? (
                                <Select
                                  value={r.status}
                                  onValueChange={(v) => void changeStatus(r, v)}
                                  disabled={statusBusyId === r.id}
                                >
                                  <SelectTrigger className="h-8 w-[140px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {STATUS_OPTIONS.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Pill dot tone={statusTone(r.status)}>
                                  {STATUS_LABELS[r.status] ?? r.status}
                                </Pill>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                {canPdf ? (
                                  <Button variant="ghost" size="sm" onClick={() => void downloadPdf(r)} title="Download PDF">
                                    <Download className="size-4" />
                                  </Button>
                                ) : null}
                                {canEdit ? (
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(r)} title="Edit report">
                                    <Pencil className="size-4" />
                                  </Button>
                                ) : null}
                                {canDelete ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => remove(r)}
                                    title="Delete report"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {filtered.length > 0 ? (
                  <div className="mt-3 border-t pt-3">
                    <ShowingCount rangeStart={1} rangeEnd={filtered.length} total={filtered.length} noun="reports" />
                  </div>
                ) : null}
              </div>
            </ResultsCard>

            <QuickLinks
              links={[
                {
                  key: 'incidents',
                  title: 'Incidents',
                  description: 'The wider incident log this sits alongside.',
                  icon: ClipboardCheck,
                  tone: 'warning',
                  action: { label: 'View incidents', href: '/incidents' },
                },
                {
                  key: 'occurrence',
                  title: 'Occurrence sheets',
                  description: 'The shift-by-shift log kept at each site.',
                  icon: Search,
                  tone: 'neutral',
                  action: { label: 'View occurrence sheets', href: '/occurrence-sheets' },
                },
                {
                  key: 'sites',
                  title: 'Sites',
                  description: 'Where these reports were raised.',
                  icon: Printer,
                  tone: 'info',
                  action: { label: 'View sites', href: '/sites' },
                },
              ]}
            />

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editing ? `Edit ${editing.reference ?? 'report'}` : 'Accident report log'}</DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-2">
                  <div className="grid gap-4 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label>Date <span className="text-destructive">*</span></Label>
                      <Input type="date" value={String(form.report_date)} onChange={(e) => set('report_date', e.target.value)} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Name (supervisor completing report) <span className="text-destructive">*</span></Label>
                      <Input value={String(form.supervisor_name)} onChange={(e) => set('supervisor_name', e.target.value)} maxLength={100} />
                    </div>
                    <div className="space-y-1">
                      <Label>SIA no</Label>
                      <Input value={String(form.sia_number)} onChange={(e) => set('sia_number', e.target.value)} maxLength={40} />
                    </div>
                    <div className="space-y-1">
                      <Label>Accident time</Label>
                      <Input type="time" value={String(form.accident_time)} onChange={(e) => set('accident_time', e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Site</Label>
                      <SearchableSelect
                        value={String(form.site_id || '')}
                        onChange={(v) => set('site_id', v)}
                        options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
                        noneOption={{ value: '', label: 'No site' }}
                        placeholder="Select site"
                        searchPlaceholder="Search sites…"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-1">
                      <Label>Type of accident</Label>
                      <Input value={String(form.accident_type)} onChange={(e) => set('accident_type', e.target.value)} maxLength={200} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Accident location</Label>
                      <Input value={String(form.accident_location)} onChange={(e) => set('accident_location', e.target.value)} maxLength={300} />
                    </div>
                    {editing ? (
                      <div className="space-y-1">
                        <Label>Status</Label>
                        <Select
                          value={String(form.status || 'open')}
                          onValueChange={(v) => set('status', v)}
                          disabled={!canEdit}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-1">
                    <Label>Persons involved</Label>
                    <Textarea
                      rows={4}
                      value={String(form.persons_involved)}
                      onChange={(e) => set('persons_involved', e.target.value)}
                      maxLength={5000}
                      placeholder="Names, tel no, description of all persons involved including the person that informed you (race/build/age/clothing, injuries sustained and first aid given)"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Emergency services</Label>
                    <div className="rounded-md border divide-y bg-muted/20">
                      {SERVICES.map((svc) => {
                        const on = Boolean(form[`${svc.key}_informed`]);
                        return (
                          <div key={svc.key} className="p-3 flex flex-wrap items-end gap-3">
                            <label className="flex items-center gap-2 min-w-40 pb-2">
                              <input
                                type="checkbox"
                                className="rounded border"
                                checked={on}
                                onChange={(e) => set(`${svc.key}_informed`, e.target.checked)}
                              />
                              <span className="text-sm font-medium">{svc.label} informed</span>
                            </label>
                            {(['informed', 'attended', 'left'] as const).map((slot) => (
                              <div className="space-y-1" key={slot}>
                                <Label className="text-xs capitalize">
                                  {slot === 'informed' ? 'Time informed' : slot === 'attended' ? 'Time attended' : 'Time left'}
                                </Label>
                                <Input
                                  type="time"
                                  className="w-32"
                                  disabled={!on}
                                  value={String(form[`${svc.key}_time_${slot}`])}
                                  onChange={(e) => set(`${svc.key}_time_${slot}`, e.target.value)}
                                />
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Comments</Label>
                    <Textarea rows={3} value={String(form.comments)} onChange={(e) => set('comments', e.target.value)} maxLength={5000} />
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={() => void save()} disabled={saving}>
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Log accident report'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </ModulePage>
        </ModuleGuard>
      </AppShell>
    </ProtectedRoute>
  );
}
