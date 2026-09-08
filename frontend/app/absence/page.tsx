'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { InlineTableSkeleton } from '@/components/skeletons';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import {
  DashboardHeader,
  FilterBar,
  FilterField,
  Pill,
  QuickLinks,
  RecordAvatar,
  ResultsCard,
  ShowingCount,
  StatCards,
  type BadgeTone,
  type StatCardSpec,
} from '@/components/module-dashboard';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { api } from '@/lib/api';
import type { AbsenceKind, AbsenceRecord, AbsenceStatus } from '@/lib/types';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
import { useGuards } from '@/hooks/use-guards';
import { CalendarOff, CheckCircle2, Clock, HeartPulse, Plane, Trash2, Users, X } from 'lucide-react';

/** Kept in step with the Absence tab on the employee profile, so the two read alike. */
const KINDS: { key: AbsenceKind; label: string }[] = [
  { key: 'annual_leave', label: 'Annual leave' },
  { key: 'sickness', label: 'Sickness' },
  { key: 'lateness', label: 'Lateness' },
  { key: 'other', label: 'Other' },
];
const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.key, k.label]));

const KIND_TONE: Record<AbsenceKind, BadgeTone> = {
  annual_leave: 'info',
  sickness: 'warning',
  lateness: 'danger',
  other: 'neutral',
};

const STATUS_TONE: Record<AbsenceStatus, BadgeTone> = {
  approved: 'positive',
  pending: 'warning',
  declined: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  approved: 'Approved',
  pending: 'Pending',
  declined: 'Declined',
};

function fmtDate(d?: string | null) {
  if (!d) return '—';
  const parsed = new Date(`${d}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? d : parsed.toLocaleDateString('en-GB');
}

/** "3 Feb" or "3 Feb – 7 Feb" — a single-day absence should not read as a range. */
function fmtRange(r: AbsenceRecord) {
  const from = fmtDate(r.start_date);
  if (!r.end_date || r.end_date === r.start_date) return from;
  return `${from} – ${fmtDate(r.end_date)}`;
}

function fmtHours(h: number) {
  if (!h) return '—';
  return Number.isInteger(h) ? `${h} hrs` : `${h.toFixed(2).replace(/\.?0+$/, '')} hrs`;
}

export default function AbsencePage() {
  // The API is the real boundary; these stop the UI offering actions it already knows
  // the role will be refused.
  const { user: permUser } = useAuth();
  const canEdit = canModule(permUser, 'absence', 'edit');
  const canDelete = canModule(permUser, 'absence', 'delete');

  const [rows, setRows] = useState<AbsenceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [search, setSearch] = useState('');
  const [guardId, setGuardId] = useState('all');
  const [kind, setKind] = useState<'all' | AbsenceKind>('all');
  const [status, setStatus] = useState<'all' | AbsenceStatus>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const { data: guards } = useGuards();
  const guardOptions = useMemo(
    () => (guards ?? []).map((g) => ({ value: String(g.id), label: g.full_name })),
    [guards]
  );

  // The date window, employee and kind are narrowed by the API; free-text search and
  // sorting stay client-side, as on every other module dashboard.
  const load = useCallback(() => {
    setLoading(true);
    api.absence
      .list({
        guard_id: guardId === 'all' ? undefined : parseInt(guardId, 10),
        kind: kind === 'all' ? undefined : kind,
        start_date: from || undefined,
        end_date: to || undefined,
        status: status === 'all' ? undefined : status,
      })
      .then(setRows)
      .catch(() => toast.error('Could not load absences'))
      .finally(() => setLoading(false));
  }, [guardId, kind, from, to, status]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatusFor = async (row: AbsenceRecord, next: AbsenceStatus) => {
    setBusyId(row.id);
    try {
      const updated = await api.absence.update(row.id, { status: next });
      setRows((list) => list.map((r) => (r.id === row.id ? updated : r)));
      toast.success(`${KIND_LABEL[row.kind] ?? 'Absence'} ${STATUS_LABEL[next].toLowerCase()}`);
    } catch {
      toast.error('Could not update this absence');
    } finally {
      setBusyId(null);
    }
  };

  const remove = (row: AbsenceRecord) => {
    toast.confirm(
      `Delete this ${(KIND_LABEL[row.kind] ?? 'absence').toLowerCase()} for ${row.guard_name ?? 'this employee'}?`,
      async () => {
        setBusyId(row.id);
        try {
          await api.absence.delete(row.id);
          setRows((list) => list.filter((r) => r.id !== row.id));
          toast.success('Absence deleted');
        } catch {
          toast.error('Could not delete this absence');
        } finally {
          setBusyId(null);
        }
      },
      { label: 'Delete', description: 'The employee’s balance is recalculated straight away.' }
    );
  };

  const getSearchText = useCallback(
    (r: AbsenceRecord) =>
      [r.guard_name ?? '', KIND_LABEL[r.kind] ?? r.kind, r.status, r.reason ?? '', r.notes ?? '']
        .join(' ')
        .toLowerCase(),
    []
  );

  const getSortValue = useCallback((r: AbsenceRecord, key: string) => {
    switch (key) {
      case 'employee':
        return r.guard_name ?? '';
      case 'kind':
        return KIND_LABEL[r.kind] ?? r.kind;
      case 'from':
        return r.start_date;
      case 'to':
        return r.end_date || r.start_date;
      case 'hours':
        return r.hours ?? 0;
      case 'status':
        return r.status;
      default:
        return '';
    }
  }, []);

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    rows,
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
  }, [search, guardId, kind, status, from, to]);
  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);

  const hoursFor = (k: AbsenceKind) =>
    rows.filter((r) => r.kind === k && r.status !== 'declined').reduce((sum, r) => sum + (r.hours || 0), 0);
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  const statCards: StatCardSpec[] = [
    { key: 'total', label: 'Absences', value: rows.length, icon: CalendarOff, tone: 'neutral', caption: 'in this view' },
    {
      key: 'annual',
      label: 'Annual leave',
      value: fmtHours(hoursFor('annual_leave')),
      icon: Plane,
      tone: 'info',
    },
    { key: 'sickness', label: 'Sickness', value: fmtHours(hoursFor('sickness')), icon: HeartPulse, tone: 'warning' },
    { key: 'lateness', label: 'Lateness', value: fmtHours(hoursFor('lateness')), icon: Clock, tone: 'danger' },
    {
      key: 'pending',
      label: 'Awaiting approval',
      value: pendingCount,
      icon: CheckCircle2,
      tone: pendingCount > 0 ? 'warning' : 'positive',
    },
  ];

  return (
    <ProtectedRoute>
      <AppShell>
        <div>
          <div className="container mx-auto px-4 py-8">
            <DashboardHeader
              title="Absence"
              hint="Absences are recorded against an employee, where their entitlement and balance are shown. This register is every employee's absence in one place."
              description="Annual leave, sickness and lateness across the company. Review, approve and keep the record straight."
            />

            <div className="mb-6 mt-6">
              <StatCards cards={statCards} />
            </div>

            <div className="mb-4">
              <FilterBar
                onClear={() => {
                  setSearch('');
                  setGuardId('all');
                  setKind('all');
                  setStatus('all');
                  setFrom('');
                  setTo('');
                }}
              >
                <FilterField label="Search" className="min-w-[240px] flex-[2]">
                  <Input
                    placeholder="Employee, reason or notes…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </FilterField>
                <FilterField label="Employee" className="flex-1">
                  <SearchableSelect
                    value={guardId}
                    options={guardOptions}
                    noneOption={{ value: 'all', label: 'All employees' }}
                    placeholder="All employees"
                    searchPlaceholder="Search employees…"
                    emptyText="No matching employees"
                    onChange={setGuardId}
                  />
                </FilterField>
                <FilterField label="Type" className="flex-1">
                  <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      {KINDS.map((k) => (
                        <SelectItem key={k.key} value={k.key}>
                          {k.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FilterField>
                <FilterField label="Status" className="flex-1">
                  <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="declined">Declined</SelectItem>
                    </SelectContent>
                  </Select>
                </FilterField>
                <FilterField label="From" className="flex-1">
                  <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
                </FilterField>
                <FilterField label="To" className="flex-1">
                  <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
                </FilterField>
              </FilterBar>
            </div>

            <ResultsCard
              title="Absences"
              count={total}
              pageSize={pageSize}
              onPageSizeChange={(n) => {
                setPageSize(n);
                setPage(1);
              }}
            >
              <div className="p-4">
                {loading ? (
                  <InlineTableSkeleton />
                ) : rows.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    No absences recorded for these filters. Absences are added on an employee’s profile, under the
                    Absence tab.
                  </div>
                ) : total === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">No absences match your search.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableHead label="Employee" colKey="employee" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Type" colKey="kind" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Dates" colKey="from" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Hours" colKey="hours" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <TableHead>Reason</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pageRows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">
                              <Link
                                href={`/guards/${r.guard_id}?tab=absence`}
                                className="flex items-center gap-2 hover:underline underline-offset-2"
                                title="Open this employee’s absence tab"
                              >
                                <RecordAvatar name={r.guard_name || '—'} />
                                <span className="truncate">{r.guard_name || `Employee #${r.guard_id}`}</span>
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Pill tone={KIND_TONE[r.kind] ?? 'neutral'}>{KIND_LABEL[r.kind] ?? r.kind}</Pill>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">{fmtRange(r)}</TableCell>
                            <TableCell className="tabular-nums">{fmtHours(r.hours)}</TableCell>
                            <TableCell>
                              <Pill tone={STATUS_TONE[r.status] ?? 'muted'} dot>
                                {STATUS_LABEL[r.status] ?? r.status}
                              </Pill>
                            </TableCell>
                            <TableCell className="max-w-[260px] truncate text-muted-foreground" title={r.reason || ''}>
                              {r.reason || '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                {canEdit && r.status !== 'approved' ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busyId === r.id}
                                    onClick={() => setStatusFor(r, 'approved')}
                                    title="Approve"
                                  >
                                    <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
                                  </Button>
                                ) : null}
                                {canEdit && r.status !== 'declined' ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busyId === r.id}
                                    onClick={() => setStatusFor(r, 'declined')}
                                    title="Decline"
                                  >
                                    <X className="size-4 text-amber-600 dark:text-amber-400" />
                                  </Button>
                                ) : null}
                                {canDelete ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    disabled={busyId === r.id}
                                    onClick={() => remove(r)}
                                    title="Delete absence"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {total > 0 ? (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <ShowingCount rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} noun="absences" />
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

            <div className="mt-6">
              <QuickLinks
                links={[
                  {
                    key: 'staff',
                    title: 'Staff',
                    description: 'Record an absence and see entitlement and balance on the employee’s Absence tab.',
                    icon: Users,
                    tone: 'neutral',
                    action: { label: 'Open staff', href: '/guards' },
                  },
                  {
                    key: 'attendance',
                    title: 'Attendance',
                    description: 'Who turned up, who was late and who did not show.',
                    icon: Clock,
                    tone: 'info',
                    action: { label: 'Open attendance', href: '/attendance' },
                  },
                  {
                    key: 'requests',
                    title: 'Staff requests',
                    description: 'Leave and shift requests waiting on a decision.',
                    icon: CheckCircle2,
                    tone: 'positive',
                    action: { label: 'Open requests', href: '/requests' },
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
