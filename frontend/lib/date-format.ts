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

const COMPANY_TZ = 'Europe/London';

export function parseApiInstant(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const s = String(iso).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const normalized = s.includes('T') ? s : s.replace(' ', 'T');
  const hasZone = /Z|[+-]\d{2}:\d{2}$/i.test(normalized);
  const d = new Date(hasZone ? normalized : `${normalized}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Display date+time as DD/MM/YYYY HH:MM (24h) in Europe/London. Date-only values stay calendar dates. */
export function formatDateTimeUK(iso: string | undefined | null): string {
  if (!iso) return '';
  const s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatDateUK(s);
  const d = parseApiInstant(s);
  if (!d) return s;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: COMPANY_TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

function londonOffsetMs(instant: Date): number {
  const name =
    new Intl.DateTimeFormat('en-GB', {
      timeZone: COMPANY_TZ,
      timeZoneName: 'longOffset',
      hour: 'numeric',
    })
      .formatToParts(instant)
      .find((p) => p.type === 'timeZoneName')?.value ?? '';
  const m = /([+-])(\d{2}):?(\d{2})?/.exec(name);
  if (m) {
    const sign = m[1] === '-' ? -1 : 1;
    return sign * ((Number(m[2]) * 60 + (m[3] ? Number(m[3]) : 0)) * 60000);
  }
  return /BST/i.test(name) ? 3600000 : 0;
}

/** `datetime-local` value (YYYY-MM-DDTHH:MM) in Europe/London. */
export function formatDateTimeLocalInput(iso: string | undefined | null): string {
  const d = parseApiInstant(iso);
  if (!d) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: COMPANY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

/** Parse a London wall `datetime-local` value to a UTC ISO string. */
export function londonWallToIso(localInput: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(localInput).trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const asUtc = Date.UTC(y, mo - 1, d, h, mi);
  const offset = londonOffsetMs(new Date(asUtc));
  let utc = asUtc - offset;
  const offset2 = londonOffsetMs(new Date(utc));
  if (offset2 !== offset) utc = asUtc - offset2;
  return new Date(utc).toISOString();
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
