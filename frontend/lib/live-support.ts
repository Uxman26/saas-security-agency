export const LIVE_CHAT_DAYS = [
  { v: 0, label: 'Monday' },
  { v: 1, label: 'Tuesday' },
  { v: 2, label: 'Wednesday' },
  { v: 3, label: 'Thursday' },
  { v: 4, label: 'Friday' },
  { v: 5, label: 'Saturday' },
  { v: 6, label: 'Sunday' },
] as const;

export const LIVE_CHAT_TIMEZONES = [
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Australia/Sydney',
];

export type DayHours = { enabled: boolean; start: string; end: string };

export function emptyDays(): Record<string, DayHours> {
  return Object.fromEntries(
    LIVE_CHAT_DAYS.map((d) => [
      String(d.v),
      { enabled: d.v < 5, start: '09:00', end: '17:30' },
    ])
  ) as Record<string, DayHours>;
}

export function daysFromAvailability(raw: Record<string, unknown> | null): Record<string, DayHours> {
  const base = emptyDays();
  if (!raw) return base;
  const incoming = raw.days;
  if (Array.isArray(incoming)) {
    for (const item of incoming) {
      if (!item || typeof item !== 'object') continue;
      const row = item as Record<string, unknown>;
      const key = String(row.weekday ?? row.day ?? '');
      if (!base[key]) continue;
      base[key] = {
        enabled: Boolean(row.enabled),
        start: String(row.start || base[key].start),
        end: String(row.end || base[key].end),
      };
    }
    return base;
  }
  if (incoming && typeof incoming === 'object') {
    for (const [k, v] of Object.entries(incoming as Record<string, unknown>)) {
      if (!base[k] || !v || typeof v !== 'object') continue;
      const row = v as Record<string, unknown>;
      base[k] = {
        enabled: Boolean(row.enabled),
        start: String(row.start || base[k].start),
        end: String(row.end || base[k].end),
      };
    }
    return base;
  }
  const working = Array.isArray(raw.working_days) ? (raw.working_days as number[]) : [0, 1, 2, 3, 4];
  const start = String(raw.start_time || '09:00');
  const end = String(raw.end_time || '17:30');
  for (const d of LIVE_CHAT_DAYS) {
    base[String(d.v)] = { enabled: working.includes(d.v), start, end };
  }
  return base;
}

export function formatChatStamp(value: unknown) {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
