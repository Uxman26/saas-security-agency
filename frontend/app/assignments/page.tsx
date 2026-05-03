'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAssignments, useCreateAssignment, useUpdateAssignment, useDeleteAssignment } from '@/hooks/use-assignments';
import { useGuards } from '@/hooks/use-guards';
import { useSites } from '@/hooks/use-sites';
import { assignmentSchema, type AssignmentFormData } from '@/lib/validation';
import type { Assignment } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { ClipboardList, Pencil, Trash2 } from 'lucide-react';

const SHIFT_TYPE_LABELS: Record<string, string> = {
  day: 'Day',
  night: 'Night',
  weekend: 'Weekend',
};

function AssignmentForm({
  form,
  guards,
  sites,
  onSubmit,
  isPending,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<AssignmentFormData>>;
  guards: { id: number; full_name: string }[];
  sites: { id: number; name: string }[];
  onSubmit: (data: AssignmentFormData) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = form;
  const guardId = watch('guard_id');
  const siteId = watch('site_id');
  const shiftType = watch('shift_type');

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label>Guard <span className="text-destructive">*</span></Label>
          <Select value={guardId?.toString() || ''} onValueChange={(v) => setValue('guard_id', parseInt(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Select guard" />
            </SelectTrigger>
            <SelectContent>
              {guards.map((g) => (
                <SelectItem key={g.id} value={g.id.toString()}>{g.full_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.guard_id && <p className="text-xs text-destructive">{errors.guard_id.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Site <span className="text-destructive">*</span></Label>
          <Select value={siteId?.toString() || ''} onValueChange={(v) => setValue('site_id', parseInt(v))}>
            <SelectTrigger>
              <SelectValue placeholder="Select site" />
            </SelectTrigger>
            <SelectContent>
              {sites.map((s) => (
                <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.site_id && <p className="text-xs text-destructive">{errors.site_id.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Date <span className="text-destructive">*</span></Label>
          <Input type="date" {...register('date')} />
          {errors.date && <p className="text-xs text-destructive">{errors.date.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Shift Type</Label>
          <Select value={shiftType || ''} onValueChange={(v) => setValue('shift_type', v as 'day' | 'night' | 'weekend')}>
            <SelectTrigger>
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Day</SelectItem>
              <SelectItem value="night">Night</SelectItem>
              <SelectItem value="weekend">Weekend</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Shift Start</Label>
          <Input type="time" {...register('shift_start')} />
          {errors.shift_start && <p className="text-xs text-destructive">{errors.shift_start.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Shift End</Label>
          <Input type="time" {...register('shift_end')} />
          {errors.shift_end && <p className="text-xs text-destructive">{errors.shift_end.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Break (minutes)</Label>
          <Input type="number" min="0" step="5" {...register('break_minutes', { valueAsNumber: true })} placeholder="30" />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Saving...' : submitLabel}
      </Button>
    </form>
  );
}

export default function AssignmentsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [shiftFilter, setShiftFilter] = useState<string>('all');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const { data: assignments = [], isLoading, refetch, isRefetching } = useAssignments();
  const { data: guards = [] } = useGuards();
  const { data: sites = [] } = useSites();
  const assignableGuards = useMemo(
    () => guards.filter((g) => Boolean(g.main_contractor_id || g.sub_contractor_id)),
    [guards],
  );
  const assignableSites = useMemo(
    () => sites.filter((s) => Boolean(s.main_contractor_id || s.sub_contractor_id)),
    [sites],
  );
  const canAssign = assignableGuards.length > 0 && assignableSites.length > 0;
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(null);
  const guardsForEdit = useMemo(() => {
    if (!editingAssignment) return assignableGuards;
    const g = guards.find((x) => x.id === editingAssignment.guard_id);
    if (!g || assignableGuards.some((x) => x.id === g.id)) return assignableGuards;
    return [...assignableGuards, g];
  }, [editingAssignment, assignableGuards, guards]);
  const sitesForEdit = useMemo(() => {
    if (!editingAssignment) return assignableSites;
    const s = sites.find((x) => x.id === editingAssignment.site_id);
    if (!s || assignableSites.some((x) => x.id === s.id)) return assignableSites;
    return [...assignableSites, s];
  }, [editingAssignment, assignableSites, sites]);
  const createAssignment = useCreateAssignment();
  const updateAssignment = useUpdateAssignment();
  const deleteAssignment = useDeleteAssignment();

  const addForm = useForm<AssignmentFormData>({ resolver: zodResolver(assignmentSchema) });
  const editForm = useForm<AssignmentFormData>({ resolver: zodResolver(assignmentSchema) });

  const guardMap = useMemo(() => new Map(guards.map((g) => [g.id, g.full_name])), [guards]);
  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);

  const handleCreate = async (data: AssignmentFormData) => {
    try {
      await createAssignment.mutateAsync(data);
      setAddOpen(false);
      addForm.reset();
    } catch (err) { console.error(err); }
  };

  const openEdit = (a: Assignment) => {
    setEditingAssignment(a);
    editForm.reset({
      guard_id: a.guard_id,
      site_id: a.site_id,
      date: a.date,
      shift_start: a.shift_start ?? '',
      shift_end: a.shift_end ?? '',
      break_minutes: a.break_minutes ?? undefined,
      shift_type: (a.shift_type === 'holiday' ? 'weekend' : a.shift_type) as 'day' | 'night' | 'weekend' | undefined,
    });
    setEditOpen(true);
  };

  const handleUpdate = async (data: AssignmentFormData) => {
    if (!editingAssignment) return;
    try {
      await updateAssignment.mutateAsync({ id: editingAssignment.id, data });
      setEditOpen(false);
      setEditingAssignment(null);
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this assignment? This cannot be undone.')) return;
    try { await deleteAssignment.mutateAsync(id); } catch (err) { console.error(err); }
  };

  const byShift = useMemo(() => {
    if (shiftFilter === 'all') return assignments;
    return assignments.filter((a) => (a.shift_type || 'day') === shiftFilter);
  }, [assignments, shiftFilter]);

  const getSearchText = useCallback(
    (a: Assignment) =>
      [
        guardMap.get(a.guard_id),
        siteMap.get(a.site_id),
        a.date,
        a.shift_type,
        a.shift_start,
        a.shift_end,
        String(a.break_minutes ?? ''),
      ]
        .filter(Boolean)
        .join(' '),
    [guardMap, siteMap]
  );

  const getSortValue = useCallback(
    (a: Assignment, key: string) => {
      switch (key) {
        case 'guard':
          return guardMap.get(a.guard_id) ?? '';
        case 'site':
          return siteMap.get(a.site_id) ?? '';
        case 'date':
          return a.date;
        case 'shift_type':
          return a.shift_type || '';
        case 'shift_hours':
          return `${a.shift_start ?? ''}${a.shift_end ?? ''}`;
        case 'break':
          return a.break_minutes ?? 0;
        default:
          return '';
      }
    },
    [guardMap, siteMap]
  );

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    byShift,
    search,
    sortKey,
    sortDir,
    page,
    pageSize,
    getSearchText,
    getSortValue
  );

  useEffect(() => {
    setPage(1);
  }, [search, shiftFilter]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  return (
    <ProtectedRoute>
      <AppShell>
      <div>
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><ClipboardList className="size-7" /> Assignments</h1>
              <p className="text-muted-foreground mt-1">{assignments.length} assignment{assignments.length !== 1 ? 's' : ''} scheduled</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button disabled={!canAssign} title={!canAssign ? 'Link contractors to guards and sites first' : undefined}>Add Assignment</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Assignment</DialogTitle>
                  </DialogHeader>
                  <AssignmentForm
                    form={addForm}
                    guards={assignableGuards}
                    sites={assignableSites}
                    onSubmit={handleCreate}
                    isPending={createAssignment.isPending}
                    submitLabel="Create Assignment"
                  />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mb-4 flex flex-col sm:flex-row gap-3 flex-wrap">
            <Input
              placeholder="Search by guard name, site or date..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <Select value={shiftFilter} onValueChange={setShiftFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Shift type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All shift types</SelectItem>
                <SelectItem value="day">Day</SelectItem>
                <SelectItem value="night">Night</SelectItem>
                <SelectItem value="weekend">Weekend</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!canAssign && (
            <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              Assignments need at least one guard and one site that each have a main or sub contractor linked. Add contractors, then link them on guard and site records.
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>All Assignments</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading assignments...</div>
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search || shiftFilter !== 'all'
                    ? 'No assignments match your filters.'
                    : 'No assignments yet. Click "Add Assignment" to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Guard" colKey="guard" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Site" colKey="site" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Date" colKey="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Shift Type" colKey="shift_type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Shift Hours" colKey="shift_hours" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Break" colKey="break" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium whitespace-nowrap">{guardMap.get(a.guard_id) || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap">{siteMap.get(a.site_id) || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap">{a.date}</TableCell>
                          <TableCell>
                            {a.shift_type ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                a.shift_type === 'night' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                a.shift_type === 'weekend' || a.shift_type === 'holiday' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                                'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                              }`}>
                                {SHIFT_TYPE_LABELS[a.shift_type] ?? a.shift_type}
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {a.shift_start && a.shift_end ? `${a.shift_start} – ${a.shift_end}` : '-'}
                          </TableCell>
                          <TableCell>{a.break_minutes != null ? `${a.break_minutes} min` : '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(a)} title="Edit assignment">
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(a.id)}
                                disabled={deleteAssignment.isPending}
                                title="Delete assignment"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePaginationBar
                    safePage={safePage}
                    pageCount={pageCount}
                    total={total}
                    pageSize={pageSize}
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    onPageChange={setPage}
                    onPageSizeChange={(n) => {
                      setPageSize(n);
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Assignment</DialogTitle>
            </DialogHeader>
            <AssignmentForm
              form={editForm}
              guards={guardsForEdit}
              sites={sitesForEdit}
              onSubmit={handleUpdate}
              isPending={updateAssignment.isPending}
              submitLabel="Save Changes"
            />
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
    </ProtectedRoute>
  );
}
