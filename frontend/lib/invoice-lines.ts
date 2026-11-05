import type { InvoiceLine } from './types';
import { formatDateUK } from './date-format';

/**
 * One row of the client-facing invoice table: one kind of shift on one day, e.g.
 * "27/10 · Night shift · 16:00 - 00:15 · 2 operatives". Identical shifts are merged.
 */
export type InvoiceDayRow = {
  key: string;
  /** Null on an allowance or any other charge that is not tied to a day. */
  shiftDate: string | null;
  label: string;
  /** What was supplied, e.g. "Night shift". */
  description: string;
  /** Distinct sites in this day's work, so a multi-site bill still says where. */
  siteNames: string[];
  /** Distinct shift timings that day ("07:00 - 19:00"), earliest start first. */
  timings: string[];
  /** Distinct people on that day. Null where the line names nobody. */
  operatives: number | null;
  hours: number;
  /** The agreed rate when every line that day shares one, otherwise amount ÷ hours. */
  rate: number | null;
  rateIsBlended: boolean;
  amount: number;
};

function lineTiming(ln: InvoiceLine): string | null {
  if (ln.shift_timing) return ln.shift_timing;
  const s = (ln.shift_start || '').trim();
  const e = (ln.shift_end || '').trim();
  if (s && e) return `${s} - ${e}`;
  return s || e || null;
}

function fmtDayLabel(iso: string) {
  return formatDateUK(iso) || iso;
}

export function groupInvoiceLines(lines: InvoiceLine[]): InvoiceDayRow[] {
  // One row per kind of shift on a day: same date, description, timing, rate and site.
  // Several operatives on the same shift share a row; a night shift and an afternoon
  // shift on the same day stay separate, so the bill shows what was actually worked.
  const groups = new Map<string, InvoiceLine[]>();
  const undated: InvoiceLine[] = [];

  for (const ln of lines) {
    if (ln.shift_date) {
      const key = [
        ln.shift_date,
        (ln.description || '').trim().toLowerCase(),
        lineTiming(ln) || '',
        Number(ln.rate || 0).toFixed(4),
        ln.site_id ?? '',
      ].join('|');
      const bucket = groups.get(key);
      if (bucket) bucket.push(ln);
      else groups.set(key, [ln]);
    } else {
      undated.push(ln);
    }
  }

  const rows: InvoiceDayRow[] = [];

  const ordered = [...groups.entries()].sort(([, a], [, b]) => {
    const d = a[0].shift_date!.localeCompare(b[0].shift_date!);
    if (d) return d;
    return (a[0].shift_start || '').localeCompare(b[0].shift_start || '');
  });

  for (const [key, group] of ordered) {
    const first = group[0];
    const iso = first.shift_date!;
    const hours = group.reduce((n, l) => n + (l.hours || 0), 0);
    const amount = group.reduce((n, l) => n + (l.amount || 0), 0);
    const guardIds = new Set(group.map((l) => l.guard_id).filter((id): id is number => id != null));
    const qty = group.reduce((n, l) => n + (Number(l.quantity) || 1), 0);
    const siteNames = [...new Set(group.map((l) => l.site_name).filter((s): s is string => !!s))];
    const timing = lineTiming(first);
    rows.push({
      key: `d:${key}`,
      shiftDate: iso,
      label: fmtDayLabel(iso),
      description: (first.description || '').trim() || 'Security services',
      siteNames,
      timings: timing ? [timing] : [],
      operatives: Math.max(guardIds.size, qty) || group.length,
      hours,
      rate: Number(first.rate || 0),
      rateIsBlended: false,
      amount,
    });
  }

  // Allowances and hand-entered charges keep their own row, after the work.
  for (const ln of undated) {
    rows.push({
      key: `u:${ln.id}`,
      shiftDate: null,
      label: ln.description ?? ((ln.allowance_amount ?? 0) > 0 ? 'Allowance' : 'Charge'),
      description: ln.description ?? ((ln.allowance_amount ?? 0) > 0 ? 'Allowance' : 'Charge'),
      siteNames: ln.site_name ? [ln.site_name] : [],
      timings: [lineTiming(ln)].filter((t): t is string => !!t),
      operatives: null,
      hours: ln.hours || 0,
      rate: ln.rate ? Number(ln.rate) : null,
      rateIsBlended: false,
      amount: ln.amount || 0,
    });
  }

  return rows;
}
