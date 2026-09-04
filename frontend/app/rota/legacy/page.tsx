'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { InlineTableSkeleton } from '@/components/skeletons';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  EMPTY_WORK_FILTERS,
  WorkFilterBar,
  toWorkFilterParams,
  useWorkFilterOptions,
  type WorkFilterValues,
} from '@/components/work-filter-bar';
import { useRotaDetail, useRotaSummary, useCreateAssignment, useUpdateAssignment, useDeleteAssignment, type RotaFilterParams } from '@/hooks/use-assignments';
import { useGuards } from '@/hooks/use-guards';
import { useSites } from '@/hooks/use-sites';
import { api } from '@/lib/api';
import { assignmentSchema, type AssignmentFormData } from '@/lib/validation';
import type { RotaDetail, RotaSummary } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { Calendar, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Plus, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { TimeHmField } from '@/components/ui/time-hm-field';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';

function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}

function mondayOf(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x;
}

function weekRange(anchor: Date) {
  const start = mondayOf(anchor);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: fmt(start), end: fmt(end) };
}

function monthRange(anchor: Date) {
  const start = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { start: fmt(start), end: fmt(end) };
}

function eachDay(startStr: string, endStr: string): string[] {
  const out: string[] = [];
  const cur = new Date(startStr + 'T12:00:00');
  const end = new Date(endStr + 'T12:00:00');
  while (cur <= end) {
    out.push(fmt(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

function shiftCellClass(d: RotaDetail) {
  if (d.attendance_status === 'absent') return 'bg-red-200/90 dark:bg-red-950/50 border-red-500/50';
  if (d.attendance_status === 'late') return 'bg-orange-200/90 dark:bg-orange-950/50 border-orange-500/50';
  if (d.attendance_status === 'pending') return 'bg-yellow-100/90 dark:bg-yellow-950/30 border-yellow-500/40';
  if (d.attendance_status === 'scheduled') return 'bg-slate-200/80 dark:bg-slate-800/50 border-slate-400/40';
  if (d.shift_type === 'night') return 'bg-indigo-200/70 dark:bg-indigo-950/40 border-indigo-400/40';
  if (d.shift_type === 'weekend') return 'bg-amber-200/70 dark:bg-amber-950/40 border-amber-400/40';
  return 'bg-sky-100/80 dark:bg-sky-950/30 border-sky-400/30';
}

export default function RotaPage() {
  // The API is the real boundary; these stop the UI offering actions it
  // already knows the role will be refused.
  const { user: permUser } = useAuth();
  const canCreateMod = canModule(permUser, 'rota', 'create');
  const canDeleteMod = canModule(permUser, 'rota', 'delete');
  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  // Client / Site / Contractor / Sub-contractor / Staff / Job title, in any combination.
  // The client covers every site assigned to it, resolved server-side.
  const [workFilters, setWorkFilters] = useState<WorkFilterValues>(EMPTY_WORK_FILTERS);
  const filterOptions = useWorkFilterOptions();
  const fGuard: number | '' = workFilters.guard ? parseInt(workFilters.guard, 10) : '';
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const range = useMemo(() => (view === 'week' ? weekRange(anchor) : monthRange(anchor)), [view, anchor]);
  const days = useMemo(() => eachDay(range.start, range.end), [range.start, range.end]);

  const filterParams: RotaFilterParams = useMemo(
    () => ({
      start_date: range.start,
      end_date: range.end,
      ...toWorkFilterParams(workFilters),
    }),
    [range.start, range.end, workFilters],
  );

  const { data: details = [], isLoading, refetch, isRefetching } = useRotaDetail(filterParams);
  const { data: summary = [] } = useRotaSummary(filterParams);
  const { data: guards = [] } = useGuards();
  const { data: sites = [] } = useSites();
  const [specialLabels, setSpecialLabels] = useState<Map<string, string>>(new Map());
  const [summarySearch, setSummarySearch] = useState('');
  const summarySort = useTableSort();
  const [summaryPage, setSummaryPage] = useState(1);
  const [summaryPageSize, setSummaryPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment();
  const deleteAssignment = useDeleteAssignment();

  const form = useForm<AssignmentFormData>({ resolver: zodResolver(assignmentSchema) });

  useEffect(() => {
    api.specialDays
      .list({ start_date: range.start, end_date: range.end })
      .then((rows) => {
        const m = new Map<string, string>();
        for (const r of rows) m.set(r.date, r.label);
        setSpecialLabels(m);
      })
      .catch(() => setSpecialLabels(new Map()));
  }, [range.start, range.end]);

  const byCell = useMemo(() => {
    const m = new Map<string, RotaDetail[]>();
    for (const r of details) {
      const k = `${r.guard_id}_${r.date}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(r);
    }
    return m;
  }, [details]);

  const guardRows = useMemo(() => {
    const m = new Map<number, string>();
    for (const d of details) m.set(d.guard_id, d.guard_name);
    let rows = [...m.entries()].map(([id, full_name]) => ({ id, full_name }));
    if (fGuard !== '') rows = rows.filter((r) => r.id === fGuard);
    return rows.sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [details, fGuard]);

  const nav = (dir: -1 | 1) => {
    const n = new Date(anchor);
    if (view === 'week') n.setDate(n.getDate() + dir * 7);
    else n.setMonth(n.getMonth() + dir);
    setAnchor(n);
  };

  const openCreate = (guardId?: number, dateStr?: string) => {
    setEditingId(null);
    form.reset({
      guard_id: guardId || 0,
      site_id: 0,
      date: dateStr || range.start,
      shift_start: '09:00',
      shift_end: '17:00',
      break_minutes: 0,
      shift_type: 'day',
    });
    setDialogOpen(true);
  };

  const openEdit = (row: RotaDetail) => {
    setEditingId(row.id);
    form.reset({
      guard_id: row.guard_id,
      site_id: row.site_id,
      date: row.date,
      shift_start: row.shift_start || '',
      shift_end: row.shift_end || '',
      break_minutes: row.break_minutes ?? 0,
      shift_type: (row.shift_type === 'holiday' ? 'weekend' : row.shift_type) as 'day' | 'night' | 'weekend',
    });
    setDialogOpen(true);
  };

  const onSubmit = async (data: AssignmentFormData) => {
    const payload = {
      guard_id: data.guard_id,
      site_id: data.site_id,
      date: data.date,
      shift_start: data.shift_start || undefined,
      shift_end: data.shift_end || undefined,
      break_minutes: data.break_minutes,
      shift_type: data.shift_type,
    };
    try {
      if (editingId) {
        await updateAssignment.mutateAsync({ id: editingId, data: payload });
      } else {
        await createAssignment.mutateAsync(payload);
      }
      setDialogOpen(false);
      refetch();
    } catch (e) {
      console.error(e);
    }
  };

  const handleDelete = (id: number) => {
    toast.confirm('Delete this shift?', async () => {
      await deleteAssignment.mutateAsync(id);
      refetch();
    }, { label: 'Delete' });
  };

  const exportFile = useCallback(
    async (format: 'xlsx' | 'pdf') => {
      try {
        const blob = await api.assignments.rotaExport({ ...filterParams, format });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = format === 'pdf' ? 'rota.pdf' : 'rota.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error(e);
      }
    },
    [filterParams],
  );

  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);

  const getSummarySearchText = useCallback(
    (s: RotaSummary) =>
      [s.guard_name, String(s.guard_id), s.total_hours.toFixed(1), String(s.late_arrivals), s.committed_hours.toFixed(1), s.overtime_hours.toFixed(1)].join(
        ' '
      ),
    []
  );
  const getSummarySortValue = useCallback((s: RotaSummary, key: string) => {
    switch (key) {
      case 'guard':
        return s.guard_name;
      case 'total':
        return s.total_hours;
      case 'late':
        return s.late_arrivals;
      case 'committed':
        return s.committed_hours;
      case 'ot':
        return s.overtime_hours;
      default:
        return '';
    }
  }, []);

  const summaryList = useTableList(
    summary,
    summarySearch,
    summarySort.sortKey,
    summarySort.sortDir,
    summaryPage,
    summaryPageSize,
    getSummarySearchText,
    getSummarySortValue
  );

  useEffect(() => {
    setSummaryPage(1);
  }, [summarySearch, range.start, range.end, workFilters]);
  useEffect(() => {
    setSummaryPage((x) => Math.min(x, summaryList.pageCount));
  }, [summaryList.pageCount]);

  return (
    <ProtectedRoute>
      <AppShell>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Calendar className="size-8 text-cyan-600" />
                Rota & scheduling
              </h1>
              <p className="text-muted-foreground mt-1">
                Weekly or monthly grid, filters, shift colours, and totals. Payroll and invoicing use these shift hours.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => exportFile('xlsx')}>
                <FileSpreadsheet className="size-4 mr-1" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportFile('pdf')}>
                <Download className="size-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing…' : 'Refresh'}
              </Button>
              <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                {canCreateMod ? (
                  <DialogTrigger asChild>
                    <Button onClick={() => openCreate()}>
                      <Plus className="size-4 mr-1" /> Add shift
                    </Button>
                  </DialogTrigger>
                ) : null}
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingId ? 'Edit shift' : 'New shift'}</DialogTitle>
                  </DialogHeader>
                  <form
                    onSubmit={form.handleSubmit(onSubmit)}
                    className="grid gap-3 sm:grid-cols-2"
                  >
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Guard</Label>
                      <Select
                        value={form.watch('guard_id')?.toString() || ''}
                        onValueChange={(v) => form.setValue('guard_id', parseInt(v, 10))}
                      >
                        <SelectTrigger><SelectValue placeholder="Guard" /></SelectTrigger>
                        <SelectContent>
                          {guards.map((g) => (
                            <SelectItem key={g.id} value={g.id.toString()}>{g.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Site</Label>
                      <Select
                        value={form.watch('site_id')?.toString() || ''}
                        onValueChange={(v) => form.setValue('site_id', parseInt(v, 10))}
                      >
                        <SelectTrigger><SelectValue placeholder="Site" /></SelectTrigger>
                        <SelectContent>
                          {sites.map((s) => (
                            <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Date</Label>
                      <Input type="date" {...form.register('date')} />
                    </div>
                    <div className="space-y-1">
                      <Label>Start</Label>
                      <TimeHmField
                        aria-label="Shift start"
                        value={form.watch('shift_start') || '00:00'}
                        onChange={(v) => form.setValue('shift_start', v, { shouldValidate: true })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>End</Label>
                      <TimeHmField
                        aria-label="Shift end"
                        value={form.watch('shift_end') || '00:00'}
                        onChange={(v) => form.setValue('shift_end', v, { shouldValidate: true })}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Break (min)</Label>
                      <Input type="number" min={0} {...form.register('break_minutes', { valueAsNumber: true })} />
                    </div>
                    <div className="space-y-1">
                      <Label>Shift type</Label>
                      <Select
                        value={form.watch('shift_type') || 'day'}
                        onValueChange={(v) => form.setValue('shift_type', v as 'day' | 'night' | 'weekend')}
                      >
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="day">Day</SelectItem>
                          <SelectItem value="night">Night</SelectItem>
                          <SelectItem value="weekend">Weekend</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="sm:col-span-2 flex gap-2 pt-2">
                      <Button type="submit" className="flex-1" disabled={createAssignment.isPending || updateAssignment.isPending}>
                        {editingId ? 'Save' : 'Create'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">View & period</CardTitle>
              <CardDescription>Switch week or month; arrows move the period.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <div className="flex rounded-md border p-0.5 bg-muted/40">
                <Button type="button" variant={view === 'week' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('week')}>Week</Button>
                <Button type="button" variant={view === 'month' ? 'secondary' : 'ghost'} size="sm" onClick={() => setView('month')}>Month</Button>
              </div>
              <Button type="button" variant="outline" size="icon" onClick={() => nav(-1)}><ChevronLeft className="size-4" /></Button>
              <span className="text-sm font-medium tabular-nums">{range.start} → {range.end}</span>
              <Button type="button" variant="outline" size="icon" onClick={() => nav(1)}><ChevronRight className="size-4" /></Button>
              <Input
                type="date"
                className="w-auto"
                value={fmt(anchor)}
                onChange={(e) => setAnchor(new Date(e.target.value + 'T12:00:00'))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Filters</CardTitle>
              <CardDescription>
                Client, site, contractor, sub-contractor, staff and job title &mdash; use any
                combination. Picking a client covers every site assigned to it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WorkFilterBar
                value={workFilters}
                onChange={setWorkFilters}
                options={filterOptions}
                className="flex flex-wrap items-center gap-2"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Schedule grid</CardTitle>
              <CardDescription>
                Colours: day (sky), night (indigo), weekend (amber), absent (red), late (orange), pending (yellow). Special
                days (bank holidays etc.) show an amber header.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {isLoading ? (
                <div className="py-12"><InlineTableSkeleton /></div>
              ) : guardRows.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">No shifts in this period. Add a shift or widen filters.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-card z-10 min-w-[140px]">Guard</TableHead>
                      {days.map((d) => {
                        const sp = specialLabels.get(d);
                        return (
                          <TableHead
                            key={d}
                            title={sp ? `${sp} (${d})` : d}
                            className={`text-xs text-center min-w-[100px] whitespace-nowrap ${
                              sp
                                ? 'bg-amber-200/90 dark:bg-amber-950/50 text-amber-950 dark:text-amber-100 font-semibold border-b-2 border-amber-500/60'
                                : ''
                            }`}
                          >
                            {d.slice(5)}
                            {sp ? <span className="block text-[9px] font-normal opacity-90 truncate max-w-[92px]">{sp}</span> : null}
                          </TableHead>
                        );
                      })}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guardRows.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="sticky left-0 bg-card z-10 font-medium">
                          <div className="flex flex-col gap-1">
                            <span>{g.full_name}</span>
                            <Button type="button" variant="ghost" size="sm" className="h-7 px-0 text-xs text-primary" onClick={() => openCreate(g.id)}>
                              + shift
                            </Button>
                          </div>
                        </TableCell>
                        {days.map((d) => {
                          const key = `${g.id}_${d}`;
                          const list = byCell.get(key) || [];
                          return (
                            <TableCell key={d} className="align-top p-1 border border-border/50">
                              <div className="flex flex-col gap-1 min-h-[48px]">
                                {list.map((row) => (
                                  <div
                                    key={row.id}
                                    className={`relative group text-[10px] sm:text-xs rounded border px-1 py-0.5 leading-tight ${shiftCellClass(row)}`}
                                  >
                                    <button type="button" className="text-left w-full" onClick={() => openEdit(row)}>
                                      <div className="font-medium truncate">{siteMap.get(row.site_id) || row.site_name}</div>
                                      <div className="opacity-90">
                                        {row.shift_start && row.shift_end ? `${row.shift_start}–${row.shift_end}` : '—'}
                                        {' · '}{row.hours}h
                                      </div>
                                      <div className="opacity-75 text-[9px]">{row.attendance_status}</div>
                                    </button>
                                    {canDeleteMod ? (
                                    <button
                                      type="button"
                                      className="absolute top-0 right-0 p-0.5 opacity-0 group-hover:opacity-100 text-destructive"
                                      onClick={(e) => { e.stopPropagation(); handleDelete(row.id); }}
                                      title="Delete shift"
                                    >
                                      <Trash2 className="size-3" />
                                    </button>
                                    ) : null}
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-[10px] text-muted-foreground"
                                  onClick={() => openCreate(g.id, d)}
                                >
                                  +
                                </Button>
                              </div>
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Hours & commitments</CardTitle>
              <CardDescription>Total hours, late arrivals, contracted hours for the period, and overtime (hours over contract prorated by days).</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto space-y-4">
              <Input
                placeholder="Search summary by guard..."
                value={summarySearch}
                onChange={(e) => setSummarySearch(e.target.value)}
                className="max-w-md"
              />
              {summary.length === 0 && !isLoading ? (
                <p className="text-sm text-muted-foreground py-4">No summary rows for this period.</p>
              ) : summaryList.total === 0 ? (
                <p className="text-sm text-muted-foreground py-4">No matches.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Guard" colKey="guard" sortKey={summarySort.sortKey} sortDir={summarySort.sortDir} onSort={summarySort.toggleSort} />
                        <SortableHead
                          label="Total hours"
                          colKey="total"
                          sortKey={summarySort.sortKey}
                          sortDir={summarySort.sortDir}
                          onSort={summarySort.toggleSort}
                          className="text-right"
                        />
                        <SortableHead
                          label="Late arrivals"
                          colKey="late"
                          sortKey={summarySort.sortKey}
                          sortDir={summarySort.sortDir}
                          onSort={summarySort.toggleSort}
                          className="text-right"
                        />
                        <SortableHead
                          label="Committed (period)"
                          colKey="committed"
                          sortKey={summarySort.sortKey}
                          sortDir={summarySort.sortDir}
                          onSort={summarySort.toggleSort}
                          className="text-right"
                        />
                        <SortableHead
                          label="Overtime"
                          colKey="ot"
                          sortKey={summarySort.sortKey}
                          sortDir={summarySort.sortDir}
                          onSort={summarySort.toggleSort}
                          className="text-right"
                        />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summaryList.pageRows.map((s) => (
                        <TableRow key={s.guard_id}>
                          <TableCell className="font-medium">{s.guard_name}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.total_hours.toFixed(1)}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.late_arrivals}</TableCell>
                          <TableCell className="text-right tabular-nums">{s.committed_hours.toFixed(1)}</TableCell>
                          <TableCell className="text-right tabular-nums text-emerald-700 dark:text-emerald-400">{s.overtime_hours.toFixed(1)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePaginationBar
                    safePage={summaryList.safePage}
                    pageCount={summaryList.pageCount}
                    total={summaryList.total}
                    pageSize={summaryPageSize}
                    rangeStart={summaryList.rangeStart}
                    rangeEnd={summaryList.rangeEnd}
                    onPageChange={setSummaryPage}
                    onPageSizeChange={(n) => {
                      setSummaryPageSize(n);
                      setSummaryPage(1);
                    }}
                  />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
    </ProtectedRoute>
  );
}
