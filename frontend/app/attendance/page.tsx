'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Attendance, Guard, Assignment } from '@/lib/types';
import { attStatusLabel, normalizeAttStatus } from '@/lib/rota-shifts-utils';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { StatusPieChart } from '@/components/charts/status-chart';
import { Clock, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';

const STATUS_STYLES: Record<string, string> = {
  on_time: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  late: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  absent: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  no_show: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_OPTIONS = [
  { value: 'on_time', label: 'On time' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'no_show', label: 'No show' },
];

function displayStatus(status?: string | null) {
  return attStatusLabel(normalizeAttStatus(status));
}

function toLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function maxLocalDateTime() {
  return toLocalInput(new Date().toISOString());
}

function isFutureLocalInput(v: string) {
  if (!v) return false;
  const d = new Date(v);
  return !Number.isNaN(d.getTime()) && d.getTime() > Date.now();
}

export default function AttendancePage() {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookOpen, setBookOpen] = useState(false);
  const [editRec, setEditRec] = useState<Attendance | null>(null);
  const [editStatus, setEditStatus] = useState('on_time');
  const [editNote, setEditNote] = useState('');
  const [editBookedAt, setEditBookedAt] = useState('');
  const [editBookedOffAt, setEditBookedOffAt] = useState('');
  const [editDateError, setEditDateError] = useState('');
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'overview' | 'all' | 'late'>('all');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const [bookAssignmentId, setBookAssignmentId] = useState('');
  const [bookGuardId, setBookGuardId] = useState('');
  const [bookOff, setBookOff] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const guardMap = useMemo(() => new Map(guards.map((g) => [g.id, g.full_name])), [guards]);

  const loadAttendance = () => {
    setLoading(true);
    api.attendance.list().then(setAttendance).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadAttendance();
    api.guards.list().then(setGuards).catch(() => {});
    api.assignments.list().then(setAssignments).catch(() => {});
  }, []);

  const handleBook = async () => {
    if (!bookAssignmentId) return;
    setSubmitting(true);
    try {
      if (bookOff) {
        await api.attendance.bookOff(parseInt(bookAssignmentId));
      } else {
        await api.attendance.bookOn(parseInt(bookAssignmentId));
      }
      setBookOpen(false);
      setBookAssignmentId('');
      setBookGuardId('');
      setBookOff(false);
      loadAttendance();
      toast.success(bookOff ? 'Booked off' : 'Booked on');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  };

  const openEdit = (a: Attendance) => {
    setEditRec(a);
    setEditStatus(normalizeAttStatus(a.status) ?? 'on_time');
    setEditNote(a.note ?? '');
    setEditBookedAt(toLocalInput(a.booked_at));
    setEditBookedOffAt(toLocalInput(a.booked_off_at));
    setEditDateError('');
  };

  const handleEditSave = async () => {
    if (!editRec) return;
    if (editStatus !== 'on_time' && !editNote.trim()) {
      toast.error('Note is required for Late, Absent, and No show');
      return;
    }
    if (isFutureLocalInput(editBookedAt)) {
      setEditDateError('Booked on cannot be in the future');
      return;
    }
    if (isFutureLocalInput(editBookedOffAt)) {
      setEditDateError('Booked off cannot be in the future');
      return;
    }
    setEditDateError('');
    setSubmitting(true);
    try {
      await api.attendance.update(editRec.id, {
        status: editStatus,
        note: editNote.trim() || null,
        booked_at: fromLocalInput(editBookedAt),
        booked_off_at: fromLocalInput(editBookedOffAt),
      });
      setEditRec(null);
      loadAttendance();
      toast.success('Attendance updated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: number) => {
    toast.confirm('Delete this attendance record?', async () => {
      try {
        await api.attendance.delete(id);
        loadAttendance();
        toast.success('Attendance deleted');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      }
    }, { label: 'Delete', description: 'This cannot be undone.' });
  };

  const baseRows = useMemo(
    () => (tab === 'late' ? attendance.filter((a) => normalizeAttStatus(a.status) === 'late') : attendance),
    [attendance, tab]
  );

  const getSearchText = useCallback(
    (a: Attendance) =>
      [
        guardMap.get(a.guard_id),
        String(a.assignment_id),
        a.status,
        a.note,
        a.updated_by_name,
        a.booked_at,
        a.booked_off_at,
        a.updated_at,
        a.created_at,
      ]
        .filter(Boolean)
        .join(' '),
    [guardMap]
  );
  const getSortValue = useCallback(
    (a: Attendance, key: string) => {
      switch (key) {
        case 'guard':
          return guardMap.get(a.guard_id) ?? '';
        case 'assignment':
          return a.assignment_id;
        case 'on':
          return a.booked_at || '';
        case 'off':
          return a.booked_off_at || '';
        case 'status':
          return a.status || '';
        case 'note':
          return a.note || '';
        case 'updated_by':
          return a.updated_by_name || '';
        case 'updated_at':
          return a.updated_at || '';
        case 'recorded':
          return a.created_at || '';
        default:
          return '';
      }
    },
    [guardMap]
  );

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    baseRows,
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
  }, [search, tab]);
  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);

  const lateCount = useMemo(() => attendance.filter((a) => normalizeAttStatus(a.status) === 'late').length, [attendance]);
  const onTimeCount = useMemo(() => attendance.filter((a) => normalizeAttStatus(a.status) === 'on_time').length, [attendance]);

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title={<span className="flex items-center gap-2"><Clock className="size-7" /> Attendance</span>}
            description={`${attendance.length} attendance record${attendance.length !== 1 ? 's' : ''}`}
            actions={
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadAttendance} disabled={loading}>
                  {loading ? 'Loading...' : 'Refresh'}
                </Button>
                <Dialog open={bookOpen} onOpenChange={setBookOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="size-4 mr-2" />
                      Book Attendance
                    </Button>
                  </DialogTrigger>
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Book staff attendance</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <p className="text-sm text-muted-foreground">
                      Records the current time as the book-on or book-off time for the selected assignment.
                    </p>
                    <div className="space-y-1">
                      <Label>Filter by staff</Label>
                      <Select value={bookGuardId || 'all'} onValueChange={(v) => setBookGuardId(v === 'all' ? '' : v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="All guards" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All staff</SelectItem>
                          {guards.map((g) => (
                            <SelectItem key={g.id} value={g.id.toString()}>{g.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Assignment <span className="text-destructive">*</span></Label>
                      <Select value={bookAssignmentId} onValueChange={setBookAssignmentId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select assignment" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignments
                            .filter(a => !bookGuardId || a.guard_id === parseInt(bookGuardId))
                            .map((a) => (
                              <SelectItem key={a.id} value={a.id.toString()}>
                                {guardMap.get(a.guard_id) ?? `Guard #${a.guard_id}`} — {a.date} {a.shift_start ?? '?'}–{a.shift_end ?? '?'}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Action</Label>
                      <div className="flex rounded-md border overflow-hidden">
                        <button
                          type="button"
                          className={`flex-1 py-2 text-sm font-medium transition-colors ${!bookOff ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
                          onClick={() => setBookOff(false)}
                        >
                          Book On
                        </button>
                        <button
                          type="button"
                          className={`flex-1 py-2 text-sm font-medium transition-colors ${bookOff ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-accent'}`}
                          onClick={() => setBookOff(true)}
                        >
                          Book Off
                        </button>
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleBook}
                      disabled={submitting || !bookAssignmentId}
                    >
                      {submitting ? 'Booking...' : `Book ${bookOff ? 'Off' : 'On'} Now`}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              </div>
            }
          />

          <ModuleTabs
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'all', label: 'All records' },
              { id: 'late', label: `Late (${lateCount})` },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'overview' && attendance.length > 0 && (
            <>
            <div className="grid gap-4 sm:grid-cols-3">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Records</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">{attendance.length}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">On Time</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold text-green-600">{onTimeCount}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Late Arrivals</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold text-red-600">{lateCount}</span>
                </CardContent>
              </Card>
            </div>
            <StatusPieChart
              data={[
                { name: 'On time', value: onTimeCount },
                { name: 'Late', value: lateCount },
                { name: 'Other', value: attendance.length - onTimeCount - lateCount },
              ]}
              title="Attendance breakdown"
            />
            </>
          )}

          {tab !== 'overview' && (
          <>
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Search by guard name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Attendance Records</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading attendance records...</div>
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search || tab === 'late' ? 'No records match your filter.' : 'No attendance records yet. Click "Book Attendance" to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Staff" colKey="guard" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Note" colKey="note" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Updated by" colKey="updated_by" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Updated at" colKey="updated_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Booked On" colKey="on" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Booked Off" colKey="off" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Assignment" colKey="assignment" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {guardMap.get(a.guard_id) ?? `Guard #${a.guard_id}`}
                          </TableCell>
                          <TableCell>
                            {a.status ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[normalizeAttStatus(a.status) ?? ''] ?? 'bg-secondary text-secondary-foreground'}`}>
                                {displayStatus(a.status)}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                Pending
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm max-w-[200px] truncate" title={a.note ?? undefined}>
                            {a.note?.trim() ? a.note : '—'}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {a.updated_by_name?.trim() ? a.updated_by_name : '—'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {a.updated_at ? new Date(a.updated_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {a.booked_at ? new Date(a.booked_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {a.booked_off_at ? new Date(a.booked_off_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell className="text-muted-foreground">#{a.assignment_id}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(a)} title="Edit">
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(a.id)}
                                title="Delete"
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
          </>
          )}

          <Dialog open={!!editRec} onOpenChange={(open) => !open && setEditRec(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Edit attendance</DialogTitle>
              </DialogHeader>
              {editRec && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {guardMap.get(editRec.guard_id) ?? `Guard #${editRec.guard_id}`} · Assignment #{editRec.assignment_id}
                  </p>
                  <div className="space-y-1">
                    <Label>Status</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label>
                      Note{editStatus !== 'on_time' ? <span className="text-destructive"> *</span> : ' (optional)'}
                    </Label>
                    <Textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder={editStatus === 'on_time' ? 'Optional note' : 'Required for Late / Absent / No show'}
                      rows={3}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Booked on</Label>
                    <Input
                      type="datetime-local"
                      value={editBookedAt}
                      max={maxLocalDateTime()}
                      onChange={(e) => {
                        setEditBookedAt(e.target.value);
                        if (editDateError) setEditDateError('');
                      }}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Booked off</Label>
                    <Input
                      type="datetime-local"
                      value={editBookedOffAt}
                      max={maxLocalDateTime()}
                      onChange={(e) => {
                        setEditBookedOffAt(e.target.value);
                        if (editDateError) setEditDateError('');
                      }}
                    />
                  </div>
                  {editDateError ? <p className="text-sm text-destructive">{editDateError}</p> : null}
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => setEditRec(null)}>
                      Cancel
                    </Button>
                    <Button type="button" onClick={() => void handleEditSave()} disabled={submitting}>
                      {submitting ? 'Saving…' : 'Save changes'}
                    </Button>
                  </DialogFooter>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </ModulePage>
    </AppShell>
    </ProtectedRoute>
  );
}
