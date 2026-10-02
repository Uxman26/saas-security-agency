import type { Assignment, Attendance, Guard, Site } from '@/lib/types';
import { normalizeAttStatus } from '@/lib/rota-shifts-utils';

export type AttStatusFilter =
  | ''
  | 'on_time'
  | 'late'
  | 'no_show'
  | 'finished_early'
  | 'overtime'
  | 'cancelled_paid'
  | 'cancelled'
  | 'not_booked_on'
  | 'not_booked_off';

export const ATT_STATUS_FILTERS: { value: AttStatusFilter; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'on_time', label: 'On Time' },
  { value: 'late', label: 'Late' },
  { value: 'no_show', label: 'No Show' },
  { value: 'finished_early', label: 'Finished Early' },
  { value: 'overtime', label: 'Overtime' },
  { value: 'cancelled_paid', label: 'Cancelled - Paid' },
  { value: 'cancelled', label: 'Cancelled - Not Paid' },
];

export type AttFilters = {
  siteId: string;
  guardId: string;
  dateFrom: string;
  dateTo: string;
  status: AttStatusFilter;
  search: string;
};

export const EMPTY_ATT_FILTERS: AttFilters = {
  siteId: '',
  guardId: '',
  dateFrom: '',
  dateTo: '',
  status: '',
  search: '',
};

export function shiftDateOf(a: Attendance): string {
  return (a.shift_date || a.booked_at || a.created_at || '').slice(0, 10);
}

export function matchesAttStatus(a: Attendance, status: AttStatusFilter): boolean {
  if (!status) return true;
  const s = normalizeAttStatus(a.status);
  if (status === 'finished_early') return !!a.has_early_finish;
  if (status === 'overtime') return !!a.has_overtime;
  return s === status;
}

export function filterAttendance(rows: Attendance[], f: AttFilters): Attendance[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((a) => {
    if (f.siteId && String(a.site_id ?? '') !== f.siteId) return false;
    if (f.guardId && String(a.guard_id) !== f.guardId) return false;
    const dk = shiftDateOf(a);
    if (f.dateFrom && dk && dk < f.dateFrom) return false;
    if (f.dateTo && dk && dk > f.dateTo) return false;
    if (!matchesAttStatus(a, f.status)) return false;
    if (q) {
      const hay = [
        a.guard_name,
        a.site_name,
        a.status,
        a.note,
        a.updated_by_name,
        a.shift_start,
        a.shift_end,
        String(a.assignment_id),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

export type AttMetrics = {
  totalStaff: number;
  totalShifts: number;
  onTime: number;
  late: number;
  noShow: number;
  finishedEarly: number;
  overtime: number;
  cancelledPaid: number;
  cancelledNotPaid: number;
  notBookedOn: number;
  notBookedOff: number;
};

export function computeAttMetrics(rows: Attendance[], notOn: number, notOff: number): AttMetrics {
  const staff = new Set(rows.map((r) => r.guard_id));
  let onTime = 0;
  let late = 0;
  let noShow = 0;
  let finishedEarly = 0;
  let overtime = 0;
  let cancelledPaid = 0;
  let cancelledNotPaid = 0;
  for (const a of rows) {
    const s = normalizeAttStatus(a.status);
    if (s === 'on_time') onTime++;
    else if (s === 'late') late++;
    else if (s === 'no_show') noShow++;
    else if (s === 'cancelled_paid') cancelledPaid++;
    else if (s === 'cancelled') cancelledNotPaid++;
    if (a.has_early_finish) finishedEarly++;
    if (a.has_overtime) overtime++;
  }
  return {
    totalStaff: staff.size,
    totalShifts: rows.length,
    onTime,
    late,
    noShow,
    finishedEarly,
    overtime,
    cancelledPaid,
    cancelledNotPaid,
    notBookedOn: notOn,
    notBookedOff: notOff,
  };
}

/** Calendar-month late counts per guard from actual late attendance rows (deduped by id). */
export function lateCountsByGuardMonth(rows: Attendance[]): Map<string, number> {
  const map = new Map<string, number>();
  const seen = new Set<number>();
  for (const a of rows) {
    if (normalizeAttStatus(a.status) !== 'late') continue;
    if (seen.has(a.id)) continue;
    seen.add(a.id);
    const month = shiftDateOf(a).slice(0, 7);
    if (!month || month.length < 7) continue;
    const key = `${a.guard_id}:${month}`;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return map;
}

export function lateCountFor(a: Attendance, counts: Map<string, number>): number {
  const month = shiftDateOf(a).slice(0, 7);
  if (!month) return 0;
  return counts.get(`${a.guard_id}:${month}`) || 0;
}

export function hasLateHighlight(a: Attendance, counts: Map<string, number>): boolean {
  return lateCountFor(a, counts) >= 3;
}

export type GroupRow = {
  key: string;
  label: string;
  total: number;
  staff: number;
  onTime: number;
  late: number;
  noShow: number;
  finishedEarly: number;
  overtime: number;
  cancelledPaid: number;
  cancelledNotPaid: number;
  bookedOn: number;
  bookedOff: number;
};

function emptyGroup(key: string, label: string): GroupRow {
  return {
    key,
    label,
    total: 0,
    staff: 0,
    onTime: 0,
    late: 0,
    noShow: 0,
    finishedEarly: 0,
    overtime: 0,
    cancelledPaid: 0,
    cancelledNotPaid: 0,
    bookedOn: 0,
    bookedOff: 0,
  };
}

function bumpGroup(g: GroupRow, a: Attendance, staffSet: Set<number>) {
  g.total++;
  staffSet.add(a.guard_id);
  g.staff = staffSet.size;
  const s = normalizeAttStatus(a.status);
  if (s === 'on_time') g.onTime++;
  else if (s === 'late') g.late++;
  else if (s === 'no_show') g.noShow++;
  else if (s === 'cancelled_paid') g.cancelledPaid++;
  else if (s === 'cancelled') g.cancelledNotPaid++;
  if (a.has_early_finish) g.finishedEarly++;
  if (a.has_overtime) g.overtime++;
  if (a.booked_at) g.bookedOn++;
  if (a.booked_off_at) g.bookedOff++;
}

export function groupBySite(rows: Attendance[]): GroupRow[] {
  const map = new Map<string, { g: GroupRow; staff: Set<number> }>();
  for (const a of rows) {
    const key = String(a.site_id ?? 'none');
    const label = a.site_name?.trim() || (a.site_id ? `Site #${a.site_id}` : 'Unknown site');
    let entry = map.get(key);
    if (!entry) {
      entry = { g: emptyGroup(key, label), staff: new Set() };
      map.set(key, entry);
    }
    bumpGroup(entry.g, a, entry.staff);
  }
  return [...map.values()].map((x) => x.g).sort((a, b) => b.total - a.total);
}

export function groupByStaff(rows: Attendance[], guardMap: Map<number, string>): GroupRow[] {
  const map = new Map<string, { g: GroupRow; staff: Set<number> }>();
  for (const a of rows) {
    const key = String(a.guard_id);
    const label = a.guard_name?.trim() || guardMap.get(a.guard_id) || `Staff #${a.guard_id}`;
    let entry = map.get(key);
    if (!entry) {
      entry = { g: emptyGroup(key, label), staff: new Set() };
      map.set(key, entry);
    }
    bumpGroup(entry.g, a, entry.staff);
  }
  return [...map.values()].map((x) => x.g).sort((a, b) => b.late - a.late || b.total - a.total);
}

export type BookingException = {
  assignment_id: number;
  guard_id: number;
  guard_name: string;
  site_id: number;
  site_name: string;
  date: string;
  shift_start?: string;
  shift_end?: string;
  kind: 'not_booked_on' | 'not_booked_off';
};

function assignmentEnded(a: Assignment, now = new Date()): boolean {
  const end = (a.shift_end || '23:59').slice(0, 5);
  const start = (a.shift_start || '00:00').slice(0, 5);
  const [eh, em] = end.split(':').map((n) => parseInt(n, 10) || 0);
  const [sh, sm] = start.split(':').map((n) => parseInt(n, 10) || 0);
  const endMins = eh * 60 + em;
  const startMins = sh * 60 + sm;
  const overnight = endMins <= startMins;
  const endDate = new Date(`${a.date}T00:00:00`);
  if (overnight) endDate.setDate(endDate.getDate() + 1);
  endDate.setHours(eh, em, 0, 0);
  return now.getTime() > endDate.getTime();
}

function assignmentStarted(a: Assignment, now = new Date()): boolean {
  const start = (a.shift_start || '00:00').slice(0, 5);
  const [sh, sm] = start.split(':').map((n) => parseInt(n, 10) || 0);
  const startDate = new Date(`${a.date}T00:00:00`);
  startDate.setHours(sh, sm, 0, 0);
  return now.getTime() >= startDate.getTime();
}

export function bookingExceptions(
  assignments: Assignment[],
  attendance: Attendance[],
  guards: Guard[],
  sites: Site[],
  filters: Pick<AttFilters, 'siteId' | 'guardId' | 'dateFrom' | 'dateTo'>
): { notBookedOn: BookingException[]; notBookedOff: BookingException[] } {
  const byAssignment = new Map(attendance.map((a) => [a.assignment_id, a]));
  const guardName = new Map(guards.map((g) => [g.id, g.full_name]));
  const siteName = new Map(sites.map((s) => [s.id, s.name]));
  const notBookedOn: BookingException[] = [];
  const notBookedOff: BookingException[] = [];
  const now = new Date();

  for (const asg of assignments) {
    if (filters.siteId && String(asg.site_id) !== filters.siteId) continue;
    if (filters.guardId && String(asg.guard_id) !== filters.guardId) continue;
    if (filters.dateFrom && asg.date < filters.dateFrom) continue;
    if (filters.dateTo && asg.date > filters.dateTo) continue;
    if (!assignmentStarted(asg, now)) continue;

    const att = byAssignment.get(asg.id);
    const base = {
      assignment_id: asg.id,
      guard_id: asg.guard_id,
      guard_name: guardName.get(asg.guard_id) || `Staff #${asg.guard_id}`,
      site_id: asg.site_id,
      site_name: siteName.get(asg.site_id) || `Site #${asg.site_id}`,
      date: asg.date,
      shift_start: asg.shift_start,
      shift_end: asg.shift_end,
    };

    if (!att?.booked_at) {
      notBookedOn.push({ ...base, kind: 'not_booked_on' });
      continue;
    }
    if (att.booked_at && !att.booked_off_at && assignmentEnded(asg, now)) {
      notBookedOff.push({ ...base, kind: 'not_booked_off' });
    }
  }

  notBookedOn.sort((a, b) => b.date.localeCompare(a.date));
  notBookedOff.sort((a, b) => b.date.localeCompare(a.date));
  return { notBookedOn, notBookedOff };
}
