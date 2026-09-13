import type { InvoiceLine } from './types';

/**
 * One row of the client-facing invoice table.
 *
 * The bill is read a day at a time — "on the 3rd you had 2 operatives for 16.5 hours" —
 * not shift by shift, so the lines are rolled up per date. The per-shift detail stays in
 * the edit screen, which is where it is actually checked.
 */
export type InvoiceDayRow = {
  key: string;
  /** Null on an allowance or any other charge that is not tied to a day. */
  shiftDate: string | null;
  label: string;
  /** Distinct sites in this day's work, so a multi-site bill still says where. */
  siteNames: string[];
  /** Distinct people on that day. Null where the line names nobody. */
  operatives: number | null;
  hours: number;
  /** The agreed rate when every line that day shares one, otherwise amount ÷ hours. */
  rate: number | null;
  rateIsBlended: boolean;
  amount: number;
};

function fmtDayLabel(iso: string) {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

export function groupInvoiceLines(lines: InvoiceLine[]): InvoiceDayRow[] {
  const byDate = new Map<string, InvoiceLine[]>();
  const undated: InvoiceLine[] = [];

  for (const ln of lines) {
    if (ln.shift_date) {
      const bucket = byDate.get(ln.shift_date);
      if (bucket) bucket.push(ln);
      else byDate.set(ln.shift_date, [ln]);
    } else {
      undated.push(ln);
    }
  }

  const rows: InvoiceDayRow[] = [];

  for (const iso of [...byDate.keys()].sort()) {
    const group = byDate.get(iso)!;
    const hours = group.reduce((n, l) => n + (l.hours || 0), 0);
    const amount = group.reduce((n, l) => n + (l.amount || 0), 0);
    const guardIds = new Set(group.map((l) => l.guard_id).filter((id): id is number => id != null));
    const rates = new Set(group.map((l) => Number(l.rate || 0).toFixed(4)));
    const uniformRate = rates.size === 1 ? Number(group[0].rate || 0) : null;
    const siteNames = [...new Set(group.map((l) => l.site_name).filter((s): s is string => !!s))];
    rows.push({
      key: `d:${iso}`,
      shiftDate: iso,
      label: fmtDayLabel(iso),
      siteNames,
      operatives: guardIds.size || null,
      hours,
      // A single rate cell must not imply an agreed rate that does not exist, so a mixed
      // day shows the blended figure and is flagged as such.
      rate: uniformRate ?? (hours > 0 ? amount / hours : null),
      rateIsBlended: uniformRate == null,
      amount,
    });
  }

  // Allowances and hand-entered charges keep their own row, after the work.
  for (const ln of undated) {
    rows.push({
      key: `u:${ln.id}`,
      shiftDate: null,
      label: ln.description ?? ((ln.allowance_amount ?? 0) > 0 ? 'Allowance' : 'Charge'),
      siteNames: ln.site_name ? [ln.site_name] : [],
      operatives: null,
      hours: ln.hours || 0,
      rate: ln.rate ? Number(ln.rate) : null,
      rateIsBlended: false,
      amount: ln.amount || 0,
    });
  }

  return rows;
}
