'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Attendance, Guard, Assignment } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { StatusPieChart } from '@/components/charts/status-chart';
import { Clock, Plus } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  on_time: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  late: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  absent: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  early_leave: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

export default function AttendancePage() {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookOpen, setBookOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'overview' | 'all' | 'late'>('all');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  // Book On/Off form
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
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const baseRows = useMemo(
    () => (tab === 'late' ? attendance.filter((a) => a.status === 'late') : attendance),
    [attendance, tab]
  );

  const getSearchText = useCallback(
    (a: Attendance) =>
      [
        guardMap.get(a.guard_id),
        String(a.assignment_id),
        a.status,
        a.booked_at,
        a.booked_off_at,
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

  const lateCount = useMemo(() => attendance.filter(a => a.status === 'late').length, [attendance]);
  const onTimeCount = useMemo(() => attendance.filter(a => a.status === 'on_time').length, [attendance]);

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
                        <SortableHead label="Assignment ID" colKey="assignment" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Booked On" colKey="on" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Booked Off" colKey="off" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Recorded" colKey="recorded" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium whitespace-nowrap">
                            {guardMap.get(a.guard_id) ?? `Guard #${a.guard_id}`}
                          </TableCell>
                          <TableCell className="text-muted-foreground">#{a.assignment_id}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {a.booked_at ? new Date(a.booked_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {a.booked_off_at ? new Date(a.booked_off_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell>
                            {a.status ? (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[a.status] ?? 'bg-secondary text-secondary-foreground'}`}>
                                {a.status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                Pending
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {a.created_at ? new Date(a.created_at).toLocaleDateString() : '—'}
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
        </ModulePage>
    </AppShell>
    </ProtectedRoute>
  );
}
