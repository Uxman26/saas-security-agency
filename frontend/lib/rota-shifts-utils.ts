import { addDays, format, parseISO } from 'date-fns';
import type { AttStatus, ShiftRec } from './rota-shifts-types';

export function dateKey(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

export function parseDateKey(dk: string) {
  return parseISO(dk + 'T12:00:00');
}

export function buildDayRange(startStr: string, count: number) {
  const start = parseDateKey(startStr);
  return Array.from({ length: count }, (_, i) => dateKey(addDays(start, i)));
}

export function calcHours(s: ShiftRec, inclBreaks = false) {
  const [sh, sm] = s.start.split(':').map(Number);
  const [eh, em] = s.end.split(':').map(Number);
  let startM = sh * 60 + (sm || 0);
  let endM = eh * 60 + (em || 0);
  let span = endM - startM;
  if (span <= 0) span += 24 * 60;
  const breakMin = (s.breakH || 0) * 60 + (s.breakM || 0);
  const deduct = inclBreaks ? 0 : breakMin;
  return Math.max(0, span - deduct) / 60;
}

export function fmtShortDate(dk: string) {
  try {
    return format(parseDateKey(dk), 'EEE d MMM');
  } catch {
    return dk;
  }
}

export function fmtRotaDeleteDate(dk: string) {
  try {
    return format(parseDateKey(dk), 'do MMM yy');
  } catch {
    return dk;
  }
}

export function attKey(empId: string, dk: string, si: number) {
  return `${empId}:${dk}:${si}`;
}

export function initials(name: string) {
  const p = name.trim().split(/\s+/);
  if (p.length >= 2) return (p[0][0] + p[p.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function formatHoursDecimal(h: number) {
  const hrs = Math.floor(h);
  const m = Math.round((h - hrs) * 60);
  if (m <= 0) return `${hrs} hrs`;
  return `${hrs} hrs ${m} mins`;
}

export function shiftSiteLine(sh: ShiftRec) {
  return sh.site || sh.notes || 'One-off';
}

export function timeMins(t: string) {
  const parts = t.split(':');
  return (parseInt(parts[0], 10) || 0) * 60 + (parseInt(parts[1], 10) || 0);
}

export function minutesBetweenTimes(from: string, to: string): number {
  let d = timeMins(to) - timeMins(from);
  if (d < 0) d += 24 * 60;
  return Math.max(0, d);
}

/** e.g. 60 → "1 hour", 30 → "30 min" */
export function formatDurationMins(mins: number): string {
  const m = Math.max(0, Math.round(mins));
  if (m < 60) return m === 1 ? '1 min' : `${m} min`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  if (rem === 0) return h === 1 ? '1 hour' : `${h} hours`;
  return `${h}h ${rem}m`;
}

export function latestShiftAdjustment(
  sh: { adjustments?: { type: string; scheduledEnd: string; actualEnd: string; reason: string; at: string }[] },
  type: 'overtime' | 'early_finish'
) {
  const list = (sh.adjustments || []).filter((a) => a.type === type);
  if (!list.length) return null;
  return list[list.length - 1];
}

export function minsToTime(m: number) {
  const total = Math.max(0, Math.round(m)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function addMinutesToTime(t: string, mins: number) {
  return minsToTime(timeMins(t) + mins);
}

export function normalizeAttStatus(s: string | undefined | null): AttStatus | null {
  if (!s) return null;
  if (s === 'present') return 'on_time';
  if (s === 'on_time' || s === 'late' || s === 'absent' || s === 'no_show') return s;
  return null;
}

export function attStatusLabel(s: AttStatus | string | null | undefined): string {
  const n = normalizeAttStatus(s ?? null);
  switch (n) {
    case 'on_time':
      return 'On time';
    case 'late':
      return 'Late';
    case 'absent':
      return 'Absent';
    case 'no_show':
      return 'No show';
    default:
      return '—';
  }
}

export function attStatusBarColor(s: AttStatus | string | null | undefined): string {
  const n = normalizeAttStatus(s ?? null);
  switch (n) {
    case 'on_time':
      return '#22c55e';
    case 'late':
      return '#eab308';
    case 'absent':
      return '#f97316';
    case 'no_show':
      return '#ef4444';
    default:
      return '#64748b';
  }
}

export function shiftPayable(sh: ShiftRec, inclBreaks = false, rateOverride?: number | null): number {
  const rate = rateOverride != null && !Number.isNaN(Number(rateOverride))
    ? Number(rateOverride)
    : Number(sh.shiftRate) || 0;
  if (rate <= 0) return 0;
  return calcHours(sh, inclBreaks) * rate;
}

/** Hours that count toward totals: unmarked = scheduled; On time/Late = worked; Absent/No show = 0. */
export function countedHoursForAttendance(
  sh: ShiftRec,
  att: { status?: string; hours?: string } | null | undefined,
  inclBreaks = false
): number {
  const status = normalizeAttStatus(att?.status ?? null);
  if (status === 'absent' || status === 'no_show') return 0;
  if (status === 'on_time' || status === 'late') {
    const fromAtt = att?.hours != null && String(att.hours).trim() !== '' ? parseFloat(String(att.hours)) : NaN;
    if (!Number.isNaN(fromAtt) && fromAtt >= 0) return fromAtt;
  }
  return calcHours(sh, inclBreaks);
}

/** Payable hours for a shift: only On time / Late count; Absent / No show / unmarked = 0. */
export function payableHoursForAttendance(
  sh: ShiftRec,
  att: { status?: string; hours?: string } | null | undefined,
  inclBreaks = false
): number {
  const status = normalizeAttStatus(att?.status ?? null);
  if (status !== 'on_time' && status !== 'late') return 0;
  const fromAtt = att?.hours != null && String(att.hours).trim() !== '' ? parseFloat(String(att.hours)) : NaN;
  if (!Number.isNaN(fromAtt) && fromAtt >= 0) return fromAtt;
  return calcHours(sh, inclBreaks);
}

export function formatMoney(n: number): string {
  return `£${n.toFixed(2)}`;
}

export type ShiftConflictHit = {
  empId: string;
  dk: string;
  idx: number;
  label: string;
};

function padTime(t: string): string {
  const parts = String(t || '').trim().split(':');
  const h = Math.min(23, Math.max(0, parseInt(parts[0] || '0', 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1] || '0', 10) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** True when end is at/before start (overnight into the next calendar day). */
export function isOvernightShift(sh: { start: string; end: string }): boolean {
  return timeMins(padTime(sh.end)) <= timeMins(padTime(sh.start));
}

/** Absolute [start, end] ms for a shift on `dk` (overnight spans into the next day). */
export function shiftAbsoluteRange(
  dk: string,
  sh: { start: string; end: string }
): { start: number; end: number } | null {
  const startT = padTime(sh.start);
  const endT = padTime(sh.end);
  // Placeholder / unset times (identical start & end) are not conflicts yet
  if (startT === endT) return null;
  const start = Date.parse(`${dk}T${startT}:00`);
  let end = Date.parse(`${dk}T${endT}:00`);
  if (Number.isNaN(start) || Number.isNaN(end)) return null;
  if (end <= start) end += 24 * 60 * 60 * 1000;
  return { start, end };
}

/** Abutting times count as a conflict (e.g. ends 09:00 / starts 09:00). */
export function intervalsTouchOrOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number }
): boolean {
  return a.start <= b.end && b.start <= a.end;
}

export function formatShiftConflictLabel(dk: string, sh: { start: string; end: string }): string {
  const startT = padTime(sh.start);
  const endT = padTime(sh.end);
  const overnight = isOvernightShift({ start: startT, end: endT });
  const endDk = overnight ? dateKey(addDays(parseDateKey(dk), 1)) : dk;
  return `${fmtShortDate(dk)} ${startT} - ${fmtShortDate(endDk)} ${endT}`;
}

export function shiftConflictKey(empId: string, dk: string, idx: number): string {
  return `${empId}:${dk}:${idx}`;
}

/** Per-shift conflict targets for every employee in the planner. */
export function buildShiftConflictMap(
  shifts: Record<string, Record<string, ShiftRec[] | undefined> | undefined>
): Map<string, ShiftConflictHit[]> {
  const map = new Map<string, ShiftConflictHit[]>();
  for (const empId of Object.keys(shifts || {})) {
    const entries: {
      key: string;
      empId: string;
      dk: string;
      idx: number;
      range: { start: number; end: number };
      sh: ShiftRec;
    }[] = [];
    const byD = shifts[empId] || {};
    for (const dk of Object.keys(byD)) {
      (byD[dk] || []).forEach((sh, idx) => {
        const range = shiftAbsoluteRange(dk, sh);
        if (!range) return;
        entries.push({
          key: shiftConflictKey(empId, dk, idx),
          empId,
          dk,
          idx,
          range,
          sh,
        });
      });
    }
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        if (!intervalsTouchOrOverlap(entries[i].range, entries[j].range)) continue;
        const a = entries[i];
        const b = entries[j];
        const add = (
          from: (typeof entries)[number],
          to: (typeof entries)[number]
        ) => {
          const list = map.get(from.key) || [];
          list.push({
            empId: to.empId,
            dk: to.dk,
            idx: to.idx,
            label: formatShiftConflictLabel(to.dk, to.sh),
          });
          map.set(from.key, list);
        };
        add(a, b);
        add(b, a);
      }
    }
  }
  return map;
}

/** Live conflicts for a draft shift (e.g. while editing in the dialog). */
export function findConflictsForDraft(
  shifts: Record<string, Record<string, ShiftRec[] | undefined> | undefined>,
  empId: string,
  dk: string,
  draft: { start: string; end: string },
  excludeIdx?: number | null
): ShiftConflictHit[] {
  const range = shiftAbsoluteRange(dk, draft);
  if (!range || !empId) return [];
  const hits: ShiftConflictHit[] = [];
  const byD = shifts[empId] || {};
  for (const otherDk of Object.keys(byD)) {
    (byD[otherDk] || []).forEach((sh, idx) => {
      if (otherDk === dk && excludeIdx != null && idx === excludeIdx) return;
      const other = shiftAbsoluteRange(otherDk, sh);
      if (!other) return;
      if (!intervalsTouchOrOverlap(range, other)) return;
      hits.push({
        empId,
        dk: otherDk,
        idx,
        label: formatShiftConflictLabel(otherDk, sh),
      });
    });
  }
  return hits;
}
