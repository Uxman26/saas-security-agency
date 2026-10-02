'use client';

import { useCallback, useEffect, useState } from 'react';
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
import type { OccurrenceEntry, OccurrenceSheet, Site } from '@/lib/types';
import { NotebookPen, Plus, Printer, Download, Trash2, Pencil, Search } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'reported', label: 'Reported' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'closed', label: 'Closed' },
] as const;
const STATUS_LABELS: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s.label]));
STATUS_LABELS.submitted = 'Reported';

const BLANK_ROW: OccurrenceEntry = { start_time: '', finish_time: '', occurrence: '', action_taken: '' };
const STARTING_ROWS = 6;

function statusTone(status: string): 'muted' | 'info' | 'warning' | 'positive' {
  const s = status === 'submitted' ? 'reported' : status;
  if (s === 'closed') return 'positive';
  if (s === 'reviewed') return 'info';
  if (s === 'reported') return 'warning';
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

export default function OccurrenceSheetsPage() {
  const { user } = useAuth();
  const canCreate = canModule(user, 'occurrence_sheets', 'create');
  const canEdit = canModule(user, 'occurrence_sheets', 'edit');
  const canDelete = canModule(user, 'occurrence_sheets', 'delete');
  const canPdf = canModule(user, 'occurrence_sheets', 'pdf_download');
  const canBlank = canModule(user, 'occurrence_sheets', 'blank_form');

  const [rows, setRows] = useState<OccurrenceSheet[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<OccurrenceSheet | null>(null);
  const [header, setHeader] = useState({
    sheet_date: '', site_id: '', officer_names: '', shift_start: '', shift_end: '', signature_name: '', status: 'open',
  });
  const [entries, setEntries] = useState<OccurrenceEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const [statusBusyId, setStatusBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.occurrenceSheets
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

  const openNew = () => {
    setEditing(null);
    setHeader({
      sheet_date: new Date().toISOString().slice(0, 10),
      site_id: '', officer_names: '', shift_start: '', shift_end: '', signature_name: '', status: 'open',
    });
    setEntries(Array.from({ length: STARTING_ROWS }, () => ({ ...BLANK_ROW })));
    setOpen(true);
  };

  const openEdit = async (s: OccurrenceSheet) => {
    try {
      const full = await api.occurrenceSheets.get(s.id);
      setEditing(full);
      const status = full.status === 'submitted' ? 'reported' : full.status;
      setHeader({
        sheet_date: full.sheet_date,
        site_id: full.site_id ? String(full.site_id) : '',
        officer_names: full.officer_names ?? '',
        shift_start: full.shift_start ?? '',
        shift_end: full.shift_end ?? '',
        signature_name: full.signature_name ?? '',
        status: status || 'open',
      });
      const existing = full.entries.map((e) => ({
        start_time: e.start_time ?? '', finish_time: e.finish_time ?? '',
        occurrence: e.occurrence ?? '', action_taken: e.action_taken ?? '',
      }));
      setEntries([...existing, ...Array.from({ length: 3 }, () => ({ ...BLANK_ROW }))]);
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not open the sheet');
    }
  };

  const setEntry = (i: number, key: keyof OccurrenceEntry, value: string) =>
    setEntries((rs) => rs.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

  const save = async () => {
    if (!header.sheet_date) {
      toast.error('A sheet needs a date');
      return;
    }
    setSaving(true);
    const payload = {
      sheet_date: header.sheet_date,
      site_id: header.site_id ? parseInt(header.site_id, 10) : null,
      officer_names: header.officer_names || null,
      shift_start: header.shift_start || null,
      shift_end: header.shift_end || null,
      signature_name: header.signature_name || null,
      ...(editing && canEdit ? { status: header.status } : {}),
      entries: entries.map((e, i) => ({ ...e, serial_no: i + 1 })),
    };
    try {
      if (editing) await api.occurrenceSheets.update(editing.id, payload);
      else await api.occurrenceSheets.create(payload);
      toast.success(editing ? 'Sheet updated' : 'Occurrence sheet saved');
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the sheet');
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (s: OccurrenceSheet, next: string) => {
    if (!canEdit || next === s.status || (s.status === 'submitted' && next === 'reported')) return;
    setStatusBusyId(s.id);
    try {
      await api.occurrenceSheets.update(s.id, { status: next });
      toast.snack(`Status set to ${STATUS_LABELS[next] ?? next}`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update status');
    } finally {
      setStatusBusyId(null);
    }
  };

  const remove = (s: OccurrenceSheet) => {
    toast.confirm(`Delete ${s.reference ?? 'this sheet'}?`, async () => {
      try {
        await api.occurrenceSheets.remove(s.id);
        toast.snack('Sheet deleted');
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not delete');
      }
    }, { label: 'Delete', description: 'This cannot be undone.' });
  };

  const download = async (s: OccurrenceSheet) => {
    try {
      saveBlob(await api.occurrenceSheets.pdf(s.id), `${(s.reference ?? `occurrences-${s.id}`).toLowerCase()}.pdf`);
    } catch {
      toast.error('Could not download the PDF');
    }
  };

  const downloadBlank = async () => {
    try {
      saveBlob(await api.occurrenceSheets.blankPdf(), 'daily-occurrences-sheet-blank.pdf');
    } catch {
      toast.error('Could not download the blank form');
    }
  };

  const byStatus = (k: string) =>
    rows.filter((r) => (r.status === 'submitted' ? 'reported' : r.status) === k).length;

  const statCards: StatCardSpec[] = [
    { key: 'total', label: 'Sheets', value: rows.length, icon: NotebookPen, tone: 'neutral' },
    {
      key: 'open',
      label: 'Open',
      value: byStatus('open'),
      icon: Search,
      tone: 'muted',
      action: byStatus('open') ? { label: 'View', onClick: () => setStatusFilter('open') } : undefined,
    },
    {
      key: 'reported',
      label: 'Reported',
      value: byStatus('reported'),
      icon: Printer,
      tone: 'warning',
      action: byStatus('reported') ? { label: 'View', onClick: () => setStatusFilter('reported') } : undefined,
    },
    {
      key: 'closed',
      label: 'Closed',
      value: byStatus('closed'),
      icon: NotebookPen,
      tone: 'positive',
      action: byStatus('closed') ? { label: 'View', onClick: () => setStatusFilter('closed') } : undefined,
    },
  ];

  return (
    <ProtectedRoute>
      <AppShell>
        <ModuleGuard moduleKey="occurrence_sheets">
          <ModulePage>
            <DashboardHeader
              title="Occurrence sheets"
              hint="One sheet per shift per site. Fill it in here, or print a blank and key it in afterwards."
              description="The daily occurrences log — what happened on shift and what was done about it."
              actions={
                <div className="flex flex-wrap gap-2">
                  {canBlank ? (
                    <Button variant="outline" onClick={() => void downloadBlank()}>
                      <Printer className="size-4 mr-1.5" />
                      Print blank sheet
                    </Button>
                  ) : null}
                  {canCreate ? (
                    <Button onClick={openNew}>
                      <Plus className="size-4 mr-1.5" />
                      New sheet
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
              }}
            >
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

            <ResultsCard title="Occurrence sheets" count={loading ? undefined : rows.length}>
              <div className="p-4">
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Reference</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Site</TableHead>
                        <TableHead>Officers</TableHead>
                        <TableHead>Shift</TableHead>
                        <TableHead className="text-right">Lines</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 && !loading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No occurrence sheets for these dates.
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {rows.map((s) => {
                        const status = s.status === 'submitted' ? 'reported' : s.status;
                        return (
                          <TableRow key={s.id}>
                            <TableCell className="font-mono text-xs">{s.reference ?? '—'}</TableCell>
                            <TableCell className="whitespace-nowrap">{s.sheet_date}</TableCell>
                            <TableCell>{s.site_name ?? '—'}</TableCell>
                            <TableCell className="max-w-48 truncate">{s.officer_names ?? '—'}</TableCell>
                            <TableCell className="whitespace-nowrap tabular-nums text-xs">
                              {s.shift_start && s.shift_end ? `${s.shift_start}–${s.shift_end}` : '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{s.entry_count}</TableCell>
                            <TableCell>
                              {canEdit ? (
                                <Select
                                  value={status}
                                  onValueChange={(v) => void changeStatus(s, v)}
                                  disabled={statusBusyId === s.id}
                                >
                                  <SelectTrigger className="h-8 w-[130px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {STATUS_OPTIONS.map((opt) => (
                                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Pill dot tone={statusTone(status)}>
                                  {STATUS_LABELS[status] ?? status}
                                </Pill>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                {canPdf ? (
                                  <Button variant="ghost" size="sm" onClick={() => void download(s)} title="Download PDF">
                                    <Download className="size-4" />
                                  </Button>
                                ) : null}
                                {canEdit ? (
                                  <Button variant="ghost" size="sm" onClick={() => void openEdit(s)} title="Edit sheet">
                                    <Pencil className="size-4" />
                                  </Button>
                                ) : null}
                                {canDelete ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => remove(s)}
                                    title="Delete sheet"
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
                {rows.length > 0 ? (
                  <div className="mt-3 border-t pt-3">
                    <ShowingCount rangeStart={1} rangeEnd={rows.length} total={rows.length} noun="sheets" />
                  </div>
                ) : null}
              </div>
            </ResultsCard>

            <QuickLinks
              links={[
                {
                  key: 'incidents',
                  title: 'Incidents',
                  description: 'Anything on a sheet that became a formal incident.',
                  icon: NotebookPen,
                  tone: 'warning',
                  action: { label: 'View incidents', href: '/incidents' },
                },
                {
                  key: 'accidents',
                  title: 'Accident reports',
                  description: 'Injuries and near misses recorded on X-FORM-077.',
                  icon: Printer,
                  tone: 'danger',
                  action: { label: 'View accident reports', href: '/accident-reports' },
                },
                {
                  key: 'sites',
                  title: 'Sites',
                  description: 'The sites these sheets were kept at.',
                  icon: Search,
                  tone: 'neutral',
                  action: { label: 'View sites', href: '/sites' },
                },
              ]}
            />

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="sm:max-w-5xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>{editing ? `Edit ${editing.reference ?? 'sheet'}` : 'Daily occurrences sheet'}</DialogTitle>
                </DialogHeader>

                <div className="space-y-5 py-2">
                  <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    <div className="space-y-1">
                      <Label>Date <span className="text-destructive">*</span></Label>
                      <Input type="date" value={header.sheet_date} onChange={(e) => setHeader((h) => ({ ...h, sheet_date: e.target.value }))} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Site</Label>
                      <SearchableSelect
                        value={header.site_id}
                        onChange={(v) => setHeader((h) => ({ ...h, site_id: v }))}
                        options={sites.map((s) => ({ value: String(s.id), label: s.name }))}
                        noneOption={{ value: '', label: 'No site' }}
                        placeholder="Select site"
                        searchPlaceholder="Search sites…"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Start shift time</Label>
                      <Input type="time" value={header.shift_start} onChange={(e) => setHeader((h) => ({ ...h, shift_start: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>End shift time</Label>
                      <Input type="time" value={header.shift_end} onChange={(e) => setHeader((h) => ({ ...h, shift_end: e.target.value }))} />
                    </div>
                    <div className="space-y-1 sm:col-span-3">
                      <Label>Security officer names</Label>
                      <Input value={header.officer_names} onChange={(e) => setHeader((h) => ({ ...h, officer_names: e.target.value }))} maxLength={300} />
                    </div>
                    <div className="space-y-1 sm:col-span-1">
                      <Label>Security name (signature)</Label>
                      <Input value={header.signature_name} onChange={(e) => setHeader((h) => ({ ...h, signature_name: e.target.value }))} maxLength={100} />
                    </div>
                    {editing ? (
                      <div className="space-y-1">
                        <Label>Status</Label>
                        <Select value={header.status} onValueChange={(v) => setHeader((h) => ({ ...h, status: v }))} disabled={!canEdit}>
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

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Occurrences &amp; patrols</Label>
                      <Button variant="outline" size="sm" onClick={() => setEntries((r) => [...r, { ...BLANK_ROW }])}>
                        <Plus className="size-3.5 mr-1" />
                        Add line
                      </Button>
                    </div>
                    <div className="overflow-x-auto rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">No</TableHead>
                            <TableHead className="w-28">Start</TableHead>
                            <TableHead className="w-28">Finish</TableHead>
                            <TableHead>Occurrences &amp; patrols</TableHead>
                            <TableHead className="w-64">Actions taken</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entries.map((row, i) => (
                            <TableRow key={i}>
                              <TableCell className="tabular-nums text-muted-foreground text-sm">{i + 1}</TableCell>
                              <TableCell>
                                <Input type="time" className="w-24" value={row.start_time ?? ''} onChange={(e) => setEntry(i, 'start_time', e.target.value)} />
                              </TableCell>
                              <TableCell>
                                <Input type="time" className="w-24" value={row.finish_time ?? ''} onChange={(e) => setEntry(i, 'finish_time', e.target.value)} />
                              </TableCell>
                              <TableCell>
                                <Textarea rows={2} value={row.occurrence ?? ''} onChange={(e) => setEntry(i, 'occurrence', e.target.value)} maxLength={2000} />
                              </TableCell>
                              <TableCell>
                                <Textarea rows={2} value={row.action_taken ?? ''} onChange={(e) => setEntry(i, 'action_taken', e.target.value)} maxLength={2000} />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <p className="text-xs text-muted-foreground">Blank lines are ignored — leave spare rows if you like.</p>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={() => void save()} disabled={saving}>
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Save sheet'}
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
