/** Local calendar YYYY-MM-DD (avoids UTC day-shift from toISOString). */
export function localDateKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function localDateOffset(days: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return localDateKey(d);
}

/** Parse an ISO date/datetime into local calendar parts without day/month swap. */
export function parseIsoDateParts(iso: string | undefined | null): {
  y: number;
  m: number;
  d: number;
  hh?: number;
  mm?: number;
} | null {
  if (!iso) return null;
  const s = String(iso).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/.exec(s);
  if (m) {
    return {
      y: +m[1],
      m: +m[2],
      d: +m[3],
      ...(m[4] != null ? { hh: +m[4], mm: +m[5] } : {}),
    };
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return {
    y: d.getFullYear(),
    m: d.getMonth() + 1,
    d: d.getDate(),
    hh: d.getHours(),
    mm: d.getMinutes(),
  };
}

/** Display dates as DD/MM/YYYY. Storage/API remain YYYY-MM-DD. */
export function formatDateUK(iso: string | undefined | null): string {
  const p = parseIsoDateParts(iso);
  if (!p) return iso ? String(iso).trim() : '';
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`;
}

/** Display date+time as DD/MM/YYYY HH:MM (24h). */
export function formatDateTimeUK(iso: string | undefined | null): string {
  if (!iso) return '';
  const s = String(iso).trim();
  const p = parseIsoDateParts(s);
  if (!p) return s;
  const date = `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`;
  if (p.hh == null) {
    const d = /T|\d{2}:\d{2}/.test(s) ? new Date(s) : null;
    if (d && !Number.isNaN(d.getTime())) {
      return `${date} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    return date;
  }
  return `${date} ${String(p.hh).padStart(2, '0')}:${String(p.mm ?? 0).padStart(2, '0')}`;
}

/** Locale-aware display; en-GB resolves to DD/MM/YYYY. */
export function formatDateLocale(iso: string | undefined | null, locale = 'en-GB'): string {
  if (!iso) return '';
  if (locale === 'en-GB' || locale === 'en') return formatDateUK(iso);
  const p = parseIsoDateParts(iso);
  if (!p) return String(iso).trim();
  const d = new Date(Date.UTC(p.y, p.m - 1, p.d));
  if (Number.isNaN(d.getTime())) return String(iso).trim();
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : locale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(d);
  } catch {
    return formatDateUK(iso);
  }
}
