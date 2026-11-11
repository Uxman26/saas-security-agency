const gbp0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const gbp2 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', minimumFractionDigits: 2 });
const gbpCompact = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const num = new Intl.NumberFormat('en-GB');

export const fmtGbp = (v: number, precise = false) => (precise ? gbp2 : gbp0).format(v || 0);
export const fmtGbpAxis = (v: number) => (Math.abs(v) < 1000 ? gbp0.format(v) : gbpCompact.format(v));
export const fmtNum = (v: number) => num.format(v || 0);
export const fmtPct = (v: number) => `${Math.round(v * 10) / 10}%`;

const parts = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const fmtDate = (iso: string) =>
  parts(iso).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

export const fmtDayShort = (iso: string, locale = 'en-GB') =>
  parts(iso).toLocaleDateString(locale === 'ar' ? 'ar' : 'en-GB', { day: 'numeric', month: 'short' });

export const fmtMonth = (ym: string, locale = 'en-GB') =>
  new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1, 1).toLocaleDateString(
    locale === 'ar' ? 'ar' : 'en-GB',
    { month: 'short' }
  );

export const fmtTime = (d: Date) => d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function fmtRelative(iso: string, locale: string, now = Date.now()) {
  const rtf = new Intl.RelativeTimeFormat(locale === 'ar' ? 'ar' : 'en-GB', { numeric: 'auto', style: 'short' });
  const secs = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(secs);
  if (abs < 60) return rtf.format(0, 'second');
  if (abs < 3600) return rtf.format(Math.round(secs / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(secs / 3600), 'hour');
  return rtf.format(Math.round(secs / 86400), 'day');
}

export const daysUntil = (iso: string, today = new Date()) => {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((parts(iso).getTime() - t.getTime()) / 86400000);
};

export function delta(value: number, previous: number | null | undefined) {
  if (previous == null) return null;
  const diff = value - previous;
  const pct = previous ? (diff / Math.abs(previous)) * 100 : null;
  return { diff, pct, dir: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat' } as const;
}
