'use client';
import { InlineKpiTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { api } from '@/lib/api';
import type { Attendance, Guard, Assignment, Site } from '@/lib/types';
import { attStatusLabel, normalizeAttStatus } from '@/lib/rota-shifts-utils';
import { isCancelledStatus } from '@/lib/rota-shifts-types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { ModulePage, ModuleTabs } from '@/components/module-layout';
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
import { StatusPieChart } from '@/components/charts/status-chart';
import { AlertTriangle, Calendar, Clock, Plus, Pencil, PoundSterling, Trash2, Users } from 'lucide-react';
import { toast } from '@/lib/toast';
import { TimeHmField, normalizeHm } from '@/components/ui/time-hm-field';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import {
  ATT_STATUS_FILTERS,
  EMPTY_ATT_FILTERS,
  bookingExceptions,
  computeAttMetrics,
  dueAndUpcoming,
  filterAttendance,
  groupBySite,
  groupByStaff,
  hasLateHighlight,
  lateCountFor,
  lateCountsByGuardMonth,
  shiftDateOf,
  type AttFilters,
  type AttStatusFilter,
} from '@/lib/attendance-dashboard';

const STATUS_OPTIONS = [
  { value: 'on_time', label: 'On Time' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'no_show', label: 'No Show' },
  { value: 'cancelled', label: 'Cancelled - Not Paid' },
  { value: 'cancelled_paid', label: 'Cancelled - Paid' },
];

function displayStatus(status?: string | null) {
  return attStatusLabel(normalizeAttStatus(status));
}

function statusTone(status?: string | null): 'positive' | 'danger' | 'warning' | 'muted' | 'info' {
  const s = normalizeAttStatus(status);
  if (s === 'on_time') return 'positive';
  if (s === 'late' || s === 'no_show') return 'danger';
  if (s === 'cancelled_paid') return 'info';
  if (s === 'cancelled' || s === 'absent') return 'warning';
  return 'muted';
}

function splitLocalInput(v: string): { date: string; time: string } {
  if (!v) return { date: '', time: '00:00' };
  const [date = '', timeRaw = '00:00'] = v.split('T');
  return { date, time: normalizeHm(timeRaw.slice(0, 5)) };
}

function joinLocalInput(date: string, time: string): string {
  if (!date) return '';
  return `${date}T${normalizeHm(time)}`;
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
  const { user: permUser } = useAuth();
  const canCreateMod = canModule(permUser, 'attendance', 'create');
  const canEditMod = canModule(permUser, 'attendance', 'edit');
  const canDeleteMod = canModule(permUser, 'attendance', 'delete');
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [bookOpen, setBookOpen] = useState(false);
  const [editRec, setEditRec] = useState<Attendance | null>(null);
  const [editStatus, setEditStatus] = useState('on_time');
  const [editNote, setEditNote] = useState('');
  const [editPaidHours, setEditPaidHours] = useState('');
  const [editBookedAt, setEditBookedAt] = useState('');
  const [editBookedOffAt, setEditBookedOffAt] = useState('');
  const [editDateError, setEditDateError] = useState('');
  const [filters, setFilters] = useState<AttFilters>(EMPTY_ATT_FILTERS);
  const [tab, setTab] = useState<'overview' | 'all' | 'exceptions'>('overview');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const [bookAssignmentId, setBookAssignmentId] = useState('');
  const [bookGuardId, setBookGuardId] = useState('');
  const [bookOff, setBookOff] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const guardMap = useMemo(() => new Map(guards.map((g) => [g.id, g.full_name])), [guards]);
  const guardOptions = useMemo(
    () => guards.map((g) => ({ value: String(g.id), label: g.full_name })),
    [guards]
  );
  const siteOptions = useMemo(
    () => sites.map((s) => ({ value: String(s.id), label: s.name })),
    [sites]
  );

  const loadAttendance = useCallback(() => {
    setLoading(true);
    const params: { guard_id?: number; site_id?: number; start_date?: string; end_date?: string } = {};
    if (filters.guardId) params.guard_id = parseInt(filters.guardId, 10);
    if (filters.siteId) params.site_id = parseInt(filters.siteId, 10);
    if (filters.dateFrom) params.start_date = filters.dateFrom;
    if (filters.dateTo) params.end_date = filters.dateTo;
    api.attendance
      .list(params)
      .then(setAttendance)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filters.guardId, filters.siteId, filters.dateFrom, filters.dateTo]);

  useEffect(() => {
    loadAttendance();
  }, [loadAttendance]);

  useEffect(() => {
    api.guards.list().then(setGuards).catch(() => {});
    api.sites.list().then(setSites).catch(() => {});
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 14);
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 3);
    const start = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;
    const end = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}`;
    api.assignments.list({ start_date: start, end_date: end }).then(setAssignments).catch(() => {});
  }, []);

  const dueUpcoming = useMemo(
    () => dueAndUpcoming(assignments, attendance, guards, sites, { siteId: filters.siteId, guardId: filters.guardId }),
    [assignments, attendance, guards, sites, filters.siteId, filters.guardId]
  );

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
    setEditPaidHours(a.paid_hours == null ? '' : String(a.paid_hours));
    setEditBookedAt(toLocalInput(a.booked_at));
    setEditBookedOffAt(toLocalInput(a.booked_off_at));
    setEditDateError('');
  };

  const handleEditSave = async () => {
    if (!editRec) return;
    if (editStatus !== 'on_time' && !editNote.trim()) {
      toast.error(
        isCancelledStatus(editStatus)
          ? 'A cancellation note is required'
          : 'Note is required for Late, Absent, and No show'
      );
      return;
    }
    let paidHours: number | null = null;
    if (editStatus === 'cancelled_paid') {
      const n = Number(editPaidHours.trim());
      if (!editPaidHours.trim() || !Number.isFinite(n) || n < 0 || n > 24) {
        toast.error('Enter the agreed paid hours (0\u201324) for this cancellation');
        return;
      }
      paidHours = Number(n.toFixed(2));
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
        paid_hours: paidHours,
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
    toast.confirm(
      'Delete this attendance record?',
      async () => {
        try {
          await api.attendance.delete(id);
          loadAttendance();
          toast.success('Attendance deleted');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Delete failed');
        }
      },
      { label: 'Delete', description: 'This cannot be undone.' }
    );
  };

  const filtered = useMemo(() => filterAttendance(attendance, filters), [attendance, filters]);

  const exceptions = useMemo(
    () =>
      bookingExceptions(assignments, attendance, guards, sites, {
        siteId: filters.siteId,
        guardId: filters.guardId,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      }),
    [assignments, attendance, guards, sites, filters.siteId, filters.guardId, filters.dateFrom, filters.dateTo]
  );

  const metrics = useMemo(
    () => computeAttMetrics(filtered, exceptions.notBookedOn.length, exceptions.notBookedOff.length),
    [filtered, exceptions]
  );

  const lateCounts = useMemo(() => lateCountsByGuardMonth(attendance), [attendance]);

  const siteGroups = useMemo(() => groupBySite(filtered), [filtered]);
  const staffGroups = useMemo(() => groupByStaff(filtered, guardMap), [filtered, guardMap]);

  const getSearchText = useCallback(() => '', []);
  const getSortValue = useCallback(
    (a: Attendance, key: string) => {
      switch (key) {
        case 'guard':
          return a.guard_name || guardMap.get(a.guard_id) || '';
        case 'site':
          return a.site_name || '';
        case 'date':
          return shiftDateOf(a);
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
    filtered,
    '',
    sortKey,
    sortDir,
    page,
    pageSize,
    getSearchText,
    getSortValue
  );

  useEffect(() => {
    setPage(1);
  }, [filters, tab]);
  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);

  const hasActiveFilters =
    !!filters.siteId ||
    !!filters.guardId ||
    !!filters.dateFrom ||
    !!filters.dateTo ||
    !!filters.status ||
    !!filters.search.trim();

  const setFilter = <K extends keyof AttFilters>(key: K, value: AttFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
  };

  const statCards: StatCardSpec[] = [
    { key: 'staff', label: 'Total Staff', value: metrics.totalStaff, icon: Users, tone: 'neutral' },
    { key: 'shifts', label: 'Total Shifts', value: metrics.totalShifts, icon: Calendar, tone: 'neutral' },
    { key: 'on_time', label: 'On Time', value: metrics.onTime, icon: Clock, tone: 'positive' },
    {
      key: 'late',
      label: 'Late',
      value: metrics.late,
      icon: Clock,
      tone: metrics.late ? 'danger' : 'muted',
    },
    {
      key: 'no_show',
      label: 'No Show',
      value: metrics.noShow,
      icon: AlertTriangle,
      tone: metrics.noShow ? 'danger' : 'muted',
    },
    { key: 'early', label: 'Finished Early', value: metrics.finishedEarly, icon: Clock, tone: 'warning' },
    { key: 'ot', label: 'Overtime', value: metrics.overtime, icon: Clock, tone: 'info' },
    { key: 'c_paid', label: 'Cancelled - Paid', value: metrics.cancelledPaid, icon: PoundSterling, tone: 'info' },
    {
      key: 'c_unpaid',
      label: 'Cancelled - Not Paid',
      value: metrics.cancelledNotPaid,
      icon: AlertTriangle,
      tone: metrics.cancelledNotPaid ? 'warning' : 'muted',
    },
    {
      key: 'not_on',
      label: 'Not Booked On',
      value: metrics.notBookedOn,
      icon: AlertTriangle,
      tone: metrics.notBookedOn ? 'danger' : 'muted',
      action: metrics.notBookedOn ? { label: 'View', onClick: () => setTab('exceptions') } : undefined,
    },
    {
      key: 'not_off',
      label: 'Not Booked Off',
      value: metrics.notBookedOff,
      icon: AlertTriangle,
      tone: metrics.notBookedOff ? 'warning' : 'muted',
      action: metrics.notBookedOff ? { label: 'View', onClick: () => setTab('exceptions') } : undefined,
    },
  ];

  const assignmentOptions = useMemo(() => {
    return assignments
      .filter((a) => !bookGuardId || a.guard_id === parseInt(bookGuardId, 10))
      .map((a) => ({
        value: String(a.id),
        label: `${guardMap.get(a.guard_id) ?? `Guard #${a.guard_id}`} — ${a.date} ${a.shift_start ?? '?'}–${a.shift_end ?? '?'}`,
      }));
  }, [assignments, bookGuardId, guardMap]);

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <DashboardHeader
            title="Attendance"
            hint="Booking on or off stamps the current time against an assignment. Late is decided against the shift's scheduled start."
            description="Who turned up, when they booked on and off, cancellations, and attendance exceptions."
            actions={
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadAttendance} disabled={loading}>
                  {loading ? 'Loading...' : 'Refresh'}
                </Button>
                <Dialog open={bookOpen} onOpenChange={setBookOpen}>
                  {canCreateMod ? (
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="size-4 mr-2" />
                        Book Attendance
                      </Button>
                    </DialogTrigger>
                  ) : null}
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
                        <SearchableSelect
                          value={bookGuardId || ''}
                          onChange={(v) => setBookGuardId(v)}
                          options={guardOptions}
                          noneOption={{ value: '', label: 'All staff' }}
                          placeholder="All staff"
                          searchPlaceholder="Search staff…"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>
                          Assignment <span className="text-destructive">*</span>
                        </Label>
                        <SearchableSelect
                          value={bookAssignmentId}
                          onChange={setBookAssignmentId}
                          options={assignmentOptions}
                          placeholder="Select assignment"
                          searchPlaceholder="Search assignment…"
                          emptyText="No assignments found"
                        />
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
                      <Button className="w-full" onClick={handleBook} disabled={submitting || !bookAssignmentId}>
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
              {
                id: 'exceptions',
                label: `Exceptions (${exceptions.notBookedOn.length + exceptions.notBookedOff.length + metrics.noShow})`,
              },
            ]}
            value={tab}
            onChange={setTab}
          />

          {(dueUpcoming.due.length > 0 || dueUpcoming.upcoming.length > 0) && (
            <div className="rounded-xl border bg-card p-4 space-y-4 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-base font-semibold tracking-tight">Today&apos;s due / upcoming</h2>
                  <p className="text-xs text-muted-foreground">
                    Live from today&apos;s rota — who needs booking on, and who is coming up.
                  </p>
                </div>
                <div className="flex gap-2 text-xs">
                  <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                    Due {dueUpcoming.due.length}
                  </span>
                  <span className="rounded-full bg-sky-100 px-2.5 py-1 font-medium text-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
                    Upcoming {dueUpcoming.upcoming.length}
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>When</TableHead>
                      <TableHead>Staff</TableHead>
                      <TableHead>Site</TableHead>
                      <TableHead>Shift</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-28" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...dueUpcoming.due, ...dueUpcoming.upcoming.slice(0, 8)].map((row) => (
                      <TableRow key={`${row.kind}-${row.assignment_id}`}>
                        <TableCell>
                          <Pill tone={row.kind === 'due' ? 'warning' : 'info'}>
                            {row.kind === 'due' ? 'Due' : 'Upcoming'}
                          </Pill>
                        </TableCell>
                        <TableCell className="font-medium">{row.guard_name}</TableCell>
                        <TableCell>{row.site_name}</TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {row.date} · {row.shift_start || '—'}–{row.shift_end || '—'}
                        </TableCell>
                        <TableCell>
                          {row.booked_on && !row.booked_off
                            ? 'Clocked in'
                            : row.booked_on && row.booked_off
                              ? 'Completed'
                              : row.status === 'not_booked_on'
                                ? 'Not booked on'
                                : displayStatus(row.status) || 'Scheduled'}
                        </TableCell>
                        <TableCell>
                          {canCreateMod && !row.booked_on ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7"
                              onClick={() => {
                                setBookAssignmentId(String(row.assignment_id));
                                setBookGuardId(String(row.guard_id));
                                setBookOff(false);
                                setBookOpen(true);
                              }}
                            >
                              Book on
                            </Button>
                          ) : canCreateMod && row.booked_on && !row.booked_off ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7"
                              onClick={() => {
                                setBookAssignmentId(String(row.assignment_id));
                                setBookGuardId(String(row.guard_id));
                                setBookOff(true);
                                setBookOpen(true);
                              }}
                            >
                              Book off
                            </Button>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <StatCards cards={statCards} />

          <FilterBar
            onClear={
              hasActiveFilters
                ? () => {
                    setFilters(EMPTY_ATT_FILTERS);
                  }
                : undefined
            }
          >
            <FilterField label="Site" className="min-w-[180px]">
              <SearchableSelect
                value={filters.siteId}
                onChange={(v) => setFilter('siteId', v)}
                options={siteOptions}
                noneOption={{ value: '', label: 'All sites' }}
                placeholder="All sites"
                searchPlaceholder="Search sites…"
              />
            </FilterField>
            <FilterField label="Staff" className="min-w-[180px]">
              <SearchableSelect
                value={filters.guardId}
                onChange={(v) => setFilter('guardId', v)}
                options={guardOptions}
                noneOption={{ value: '', label: 'All staff' }}
                placeholder="All staff"
                searchPlaceholder="Search staff…"
              />
            </FilterField>
            <FilterField label="From">
              <Input type="date" value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)} />
            </FilterField>
            <FilterField label="To">
              <Input type="date" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)} />
            </FilterField>
            <FilterField label="Status" className="min-w-[180px]">
              <Select
                value={filters.status || 'all'}
                onValueChange={(v) => setFilter('status', (v === 'all' ? '' : v) as AttStatusFilter)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  {ATT_STATUS_FILTERS.map((o) => (
                    <SelectItem key={o.value || 'all'} value={o.value || 'all'}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Search" className="min-w-[200px] flex-1">
              <Input
                placeholder="Staff, site, note…"
                value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)}
              />
            </FilterField>
          </FilterBar>

          {tab === 'overview' && (
            <div className="space-y-6">
              {filtered.length > 0 ? (
                <StatusPieChart
                  data={[
                    { name: 'On Time', value: metrics.onTime },
                    { name: 'Late', value: metrics.late },
                    { name: 'No Show', value: metrics.noShow },
                    { name: 'Cancelled - Paid', value: metrics.cancelledPaid },
                    { name: 'Cancelled - Not Paid', value: metrics.cancelledNotPaid },
                    { name: 'Finished Early', value: metrics.finishedEarly },
                    { name: 'Overtime', value: metrics.overtime },
                  ].filter((d) => d.value > 0)}
                  title="Attendance by status"
                />
              ) : null}

              <ResultsCard title="By site" count={siteGroups.length}>
                <div className="overflow-x-auto p-4">
                  {siteGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No attendance in this filter.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Site</TableHead>
                          <TableHead>Shifts</TableHead>
                          <TableHead>Staff</TableHead>
                          <TableHead>On Time</TableHead>
                          <TableHead>Late</TableHead>
                          <TableHead>No Show</TableHead>
                          <TableHead>Early</TableHead>
                          <TableHead>OT</TableHead>
                          <TableHead>Cancel Paid</TableHead>
                          <TableHead>Cancel Not Paid</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {siteGroups.map((g) => (
                          <TableRow key={g.key}>
                            <TableCell className="font-medium">{g.label}</TableCell>
                            <TableCell>{g.total}</TableCell>
                            <TableCell>{g.staff}</TableCell>
                            <TableCell>{g.onTime}</TableCell>
                            <TableCell className={g.late >= 3 ? 'text-destructive font-semibold' : ''}>{g.late}</TableCell>
                            <TableCell className={g.noShow ? 'text-destructive font-semibold' : ''}>{g.noShow}</TableCell>
                            <TableCell>{g.finishedEarly}</TableCell>
                            <TableCell>{g.overtime}</TableCell>
                            <TableCell>{g.cancelledPaid}</TableCell>
                            <TableCell>{g.cancelledNotPaid}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </ResultsCard>

              <ResultsCard title="By staff" count={staffGroups.length}>
                <div className="overflow-x-auto p-4">
                  {staffGroups.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No attendance in this filter.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Staff</TableHead>
                          <TableHead>Shifts</TableHead>
                          <TableHead>On Time</TableHead>
                          <TableHead>Late</TableHead>
                          <TableHead>No Show</TableHead>
                          <TableHead>Early</TableHead>
                          <TableHead>OT</TableHead>
                          <TableHead>Cancel Paid</TableHead>
                          <TableHead>Cancel Not Paid</TableHead>
                          <TableHead>Booked On</TableHead>
                          <TableHead>Booked Off</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {staffGroups.map((g) => {
                          const lateHighlight = g.late >= 3;
                          return (
                            <TableRow
                              key={g.key}
                              className={cn(lateHighlight && 'bg-destructive/5', g.noShow > 0 && 'bg-amber-500/5')}
                            >
                              <TableCell className="font-medium">
                                <div className="flex flex-col gap-0.5">
                                  <span>{g.label}</span>
                                  {lateHighlight ? (
                                    <span className="text-xs text-destructive font-medium">
                                      {g.late}+ lates in filtered period — review monthly pattern
                                    </span>
                                  ) : null}
                                </div>
                              </TableCell>
                              <TableCell>{g.total}</TableCell>
                              <TableCell>{g.onTime}</TableCell>
                              <TableCell className={lateHighlight ? 'text-destructive font-semibold' : ''}>{g.late}</TableCell>
                              <TableCell className={g.noShow ? 'text-destructive font-semibold' : ''}>{g.noShow}</TableCell>
                              <TableCell>{g.finishedEarly}</TableCell>
                              <TableCell>{g.overtime}</TableCell>
                              <TableCell>{g.cancelledPaid}</TableCell>
                              <TableCell>{g.cancelledNotPaid}</TableCell>
                              <TableCell>{g.bookedOn}</TableCell>
                              <TableCell>{g.bookedOff}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </ResultsCard>

              <ResultsCard title="By shift" count={filtered.length}>
                <div className="overflow-x-auto p-4">
                  {filtered.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No shifts match.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Site</TableHead>
                          <TableHead>Staff</TableHead>
                          <TableHead>Scheduled</TableHead>
                          <TableHead>Booked on</TableHead>
                          <TableHead>Booked off</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Flags</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.slice(0, 50).map((a) => {
                          const lateN = lateCountFor(a, lateCounts);
                          const highlight = hasLateHighlight(a, lateCounts);
                          const noShow = normalizeAttStatus(a.status) === 'no_show';
                          return (
                            <TableRow
                              key={a.id}
                              className={cn(
                                highlight && 'bg-destructive/5',
                                noShow && 'bg-amber-500/10',
                                isCancelledStatus(a.status) && 'bg-slate-500/5'
                              )}
                            >
                              <TableCell className="whitespace-nowrap">{shiftDateOf(a) || '—'}</TableCell>
                              <TableCell>{a.site_name || '—'}</TableCell>
                              <TableCell className="font-medium">
                                {a.guard_name || guardMap.get(a.guard_id) || `#${a.guard_id}`}
                                {highlight ? (
                                  <span className="ml-2 text-xs text-destructive font-medium">
                                    {lateN} lates this month
                                  </span>
                                ) : null}
                              </TableCell>
                              <TableCell className="whitespace-nowrap text-sm">
                                {a.shift_start || '?'}–{a.shift_end || '?'}
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap">
                                {a.booked_at ? new Date(a.booked_at).toLocaleString() : '—'}
                              </TableCell>
                              <TableCell className="text-sm whitespace-nowrap">
                                {a.booked_off_at ? new Date(a.booked_off_at).toLocaleString() : '—'}
                              </TableCell>
                              <TableCell>
                                <Pill dot tone={statusTone(a.status)}>
                                  {displayStatus(a.status)}
                                </Pill>
                                {a.status === 'cancelled_paid' && a.paid_hours != null ? (
                                  <span className="ml-2 text-xs text-muted-foreground">
                                    Agreed {Number(a.paid_hours).toFixed(2)} hrs
                                  </span>
                                ) : null}
                              </TableCell>
                              <TableCell className="text-xs space-x-1">
                                {a.has_early_finish ? <Pill tone="warning">Finished early</Pill> : null}
                                {a.has_overtime ? <Pill tone="info">Overtime</Pill> : null}
                                {a.late_minutes ? <Pill tone="danger">Late {a.late_minutes}m</Pill> : null}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                  {filtered.length > 50 ? (
                    <p className="text-xs text-muted-foreground mt-2">Showing first 50 of {filtered.length}. Use All records for the full list.</p>
                  ) : null}
                </div>
              </ResultsCard>
            </div>
          )}

          {tab === 'exceptions' && (
            <div className="space-y-6">
              <ResultsCard title="Not Booked On" count={exceptions.notBookedOn.length}>
                <div className="overflow-x-auto p-4">
                  {exceptions.notBookedOn.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">All started shifts have a book-on.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Staff</TableHead>
                          <TableHead>Site</TableHead>
                          <TableHead>Shift</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exceptions.notBookedOn.map((e) => (
                          <TableRow key={`on-${e.assignment_id}`} className="bg-destructive/5">
                            <TableCell>{e.date}</TableCell>
                            <TableCell className="font-medium">{e.guard_name}</TableCell>
                            <TableCell>{e.site_name}</TableCell>
                            <TableCell>
                              {e.shift_start || '?'}–{e.shift_end || '?'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </ResultsCard>

              <ResultsCard title="Not Booked Off" count={exceptions.notBookedOff.length}>
                <div className="overflow-x-auto p-4">
                  {exceptions.notBookedOff.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No open book-offs for ended shifts.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Staff</TableHead>
                          <TableHead>Site</TableHead>
                          <TableHead>Shift</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {exceptions.notBookedOff.map((e) => (
                          <TableRow key={`off-${e.assignment_id}`} className="bg-amber-500/10">
                            <TableCell>{e.date}</TableCell>
                            <TableCell className="font-medium">{e.guard_name}</TableCell>
                            <TableCell>{e.site_name}</TableCell>
                            <TableCell>
                              {e.shift_start || '?'}–{e.shift_end || '?'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </ResultsCard>

              <ResultsCard
                title="No Show"
                count={filtered.filter((a) => normalizeAttStatus(a.status) === 'no_show').length}
              >
                <div className="overflow-x-auto p-4">
                  {filtered.filter((a) => normalizeAttStatus(a.status) === 'no_show').length === 0 ? (
                    <p className="text-sm text-muted-foreground py-8 text-center">No no-show records in this filter.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Staff</TableHead>
                          <TableHead>Site</TableHead>
                          <TableHead>Note</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered
                          .filter((a) => normalizeAttStatus(a.status) === 'no_show')
                          .map((a) => (
                            <TableRow key={a.id} className="bg-destructive/5">
                              <TableCell>{shiftDateOf(a)}</TableCell>
                              <TableCell className="font-medium">
                                {a.guard_name || guardMap.get(a.guard_id) || `#${a.guard_id}`}
                              </TableCell>
                              <TableCell>{a.site_name || '—'}</TableCell>
                              <TableCell className="max-w-[240px] truncate">{a.note || '—'}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              </ResultsCard>
            </div>
          )}

          {tab === 'all' && (
            <>
              <ResultsCard
                title="Attendance records"
                count={total}
                pageSize={pageSize}
                onPageSizeChange={(n) => {
                  setPageSize(n);
                  setPage(1);
                }}
              >
                <div className="p-4">
                  {loading ? (
                    <InlineKpiTableSkeleton />
                  ) : total === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      {hasActiveFilters
                        ? 'No records match your filter.'
                        : 'No attendance records yet. Click "Book Attendance" to get started.'}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableHead label="Staff" colKey="guard" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Site" colKey="site" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Date" colKey="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <TableHead>Flags</TableHead>
                            <SortableHead label="Note" colKey="note" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Booked On" colKey="on" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Booked Off" colKey="off" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pageRows.map((a) => {
                            const lateN = lateCountFor(a, lateCounts);
                            const highlight = hasLateHighlight(a, lateCounts);
                            const noShow = normalizeAttStatus(a.status) === 'no_show';
                            return (
                              <TableRow
                                key={a.id}
                                className={cn(
                                  highlight && 'bg-destructive/5',
                                  noShow && 'bg-amber-500/10',
                                  isCancelledStatus(a.status) && 'bg-slate-500/5'
                                )}
                              >
                                <TableCell className="font-medium whitespace-nowrap">
                                  <div className="flex flex-col gap-0.5">
                                    <span>{a.guard_name || guardMap.get(a.guard_id) || `Guard #${a.guard_id}`}</span>
                                    {highlight ? (
                                      <span className="text-xs text-destructive font-medium">
                                        {lateN} lates in {shiftDateOf(a).slice(0, 7) || 'month'}
                                      </span>
                                    ) : null}
                                  </div>
                                </TableCell>
                                <TableCell className="whitespace-nowrap">{a.site_name || '—'}</TableCell>
                                <TableCell className="whitespace-nowrap text-sm">
                                  {shiftDateOf(a) || '—'}
                                  {a.shift_start ? (
                                    <span className="text-muted-foreground">
                                      {' '}
                                      {a.shift_start}–{a.shift_end || '?'}
                                    </span>
                                  ) : null}
                                </TableCell>
                                <TableCell>
                                  {a.status ? (
                                    <div className="flex flex-col gap-1">
                                      <Pill dot tone={statusTone(a.status)}>
                                        {displayStatus(a.status)}
                                      </Pill>
                                      {a.status === 'cancelled_paid' && a.paid_hours != null ? (
                                        <span className="text-[11px] text-muted-foreground">
                                          Agreed Paid Hours: {Number(a.paid_hours).toFixed(2)}
                                        </span>
                                      ) : null}
                                    </div>
                                  ) : (
                                    <Pill tone="muted">Pending</Pill>
                                  )}
                                </TableCell>
                                <TableCell className="text-xs space-y-1">
                                  {a.has_early_finish ? <div><Pill tone="warning">Finished early</Pill></div> : null}
                                  {a.has_overtime ? <div><Pill tone="info">Overtime</Pill></div> : null}
                                  {a.late_minutes ? <div><Pill tone="danger">Late {a.late_minutes}m</Pill></div> : null}
                                  {!a.has_early_finish && !a.has_overtime && !a.late_minutes ? '—' : null}
                                </TableCell>
                                <TableCell className="text-sm max-w-[180px] truncate" title={a.note ?? undefined}>
                                  {a.note?.trim() ? a.note : '—'}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-sm">
                                  {a.booked_at ? new Date(a.booked_at).toLocaleString() : '—'}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-sm">
                                  {a.booked_off_at ? new Date(a.booked_off_at).toLocaleString() : '—'}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    {canEditMod ? (
                                      <Button variant="ghost" size="sm" onClick={() => openEdit(a)} title="Edit">
                                        <Pencil className="size-4" />
                                      </Button>
                                    ) : null}
                                    {canDeleteMod ? (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => handleDelete(a.id)}
                                        title="Delete"
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
                  )}
                  {total > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                      <ShowingCount rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} noun="records" />
                      <TablePaginationBar
                        safePage={safePage}
                        pageCount={pageCount}
                        total={total}
                        pageSize={pageSize}
                        rangeStart={rangeStart}
                        rangeEnd={rangeEnd}
                        onPageChange={setPage}
                      />
                    </div>
                  ) : null}
                </div>
              </ResultsCard>

              <QuickLinks
                links={[
                  {
                    key: 'rota',
                    title: 'Rotas & shifts',
                    description: 'Attendance is marked against the shifts planned here.',
                    icon: Calendar,
                    tone: 'neutral',
                    action: { label: 'Open rotas', href: '/rota' },
                  },
                  {
                    key: 'payroll',
                    title: 'Payroll',
                    description: 'On time, Late, and Cancelled - Paid shifts feed payable hours.',
                    icon: PoundSterling,
                    tone: 'positive',
                    action: { label: 'Open payroll', href: '/payroll' },
                  },
                  {
                    key: 'staff',
                    title: 'Employee hub',
                    description: 'Absence, lateness and the rest of each person’s record.',
                    icon: Users,
                    tone: 'info',
                    action: { label: 'Open employees', href: '/guards' },
                  },
                ]}
              />
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
                    {editRec.guard_name || guardMap.get(editRec.guard_id) || `Guard #${editRec.guard_id}`} · Assignment #
                    {editRec.assignment_id}
                    {editRec.site_name ? ` · ${editRec.site_name}` : ''}
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
                  {editStatus === 'cancelled_paid' ? (
                    <div className="space-y-1">
                      <Label>
                        How many hours were agreed for payment?<span className="text-destructive"> *</span>
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        max={24}
                        step="0.25"
                        inputMode="decimal"
                        value={editPaidHours}
                        onChange={(e) => setEditPaidHours(e.target.value)}
                        placeholder="Agreed Paid Hours"
                      />
                    </div>
                  ) : null}
                  <div className="space-y-1">
                    <Label>
                      {isCancelledStatus(editStatus) ? 'Cancellation Note' : 'Note'}
                      {editStatus !== 'on_time' ? <span className="text-destructive"> *</span> : ' (optional)'}
                    </Label>
                    <Textarea
                      value={editNote}
                      onChange={(e) => setEditNote(e.target.value)}
                      placeholder={
                        isCancelledStatus(editStatus)
                          ? 'Enter cancellation reason or notes'
                          : editStatus === 'on_time'
                            ? 'Optional note'
                            : 'Required for Late / Absent / No show'
                      }
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Booked on (date)</Label>
                      <Input
                        type="date"
                        value={splitLocalInput(editBookedAt).date}
                        max={maxLocalDateTime().slice(0, 10)}
                        onChange={(e) => {
                          setEditBookedAt(joinLocalInput(e.target.value, splitLocalInput(editBookedAt).time));
                          if (editDateError) setEditDateError('');
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Booked on (time)</Label>
                      <TimeHmField
                        aria-label="Booked on time"
                        value={splitLocalInput(editBookedAt).time}
                        onChange={(time) => {
                          const date = splitLocalInput(editBookedAt).date || maxLocalDateTime().slice(0, 10);
                          setEditBookedAt(joinLocalInput(date, time));
                          if (editDateError) setEditDateError('');
                        }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Booked off (date)</Label>
                      <Input
                        type="date"
                        value={splitLocalInput(editBookedOffAt).date}
                        max={maxLocalDateTime().slice(0, 10)}
                        onChange={(e) => {
                          setEditBookedOffAt(joinLocalInput(e.target.value, splitLocalInput(editBookedOffAt).time));
                          if (editDateError) setEditDateError('');
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Booked off (time)</Label>
                      <TimeHmField
                        aria-label="Booked off time"
                        value={splitLocalInput(editBookedOffAt).time}
                        onChange={(time) => {
                          const date = splitLocalInput(editBookedOffAt).date || maxLocalDateTime().slice(0, 10);
                          setEditBookedOffAt(joinLocalInput(date, time));
                          if (editDateError) setEditDateError('');
                        }}
                      />
                    </div>
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
