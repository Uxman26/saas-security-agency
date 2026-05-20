import { addDays, format, parseISO } from 'date-fns';
import type { ShiftRec } from './rota-shifts-types';

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
