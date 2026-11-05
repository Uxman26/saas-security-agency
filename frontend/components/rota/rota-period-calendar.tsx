'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { RotaPlanListItem } from '@/lib/types';

/** Calendar-day arithmetic on YYYY-MM-DD keys, in UTC so a day never shifts. */
export function addDaysKey(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function addMonthsKey(key: string, n: number) {
  const d = new Date(`${key}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return key;
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week holding `key`. */
export function weekStartKey(key: string) {
  const d = new Date(`${key}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Mon = 0
  return addDaysKey(key, -dow);
}

function dayLabel(key: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', ...opts });
}

export function periodTitle(mode: 'week' | 'month', focus: string) {
  if (mode === 'month') return dayLabel(focus, { month: 'long', year: 'numeric' });
  const start = weekStartKey(focus);
  const end = addDaysKey(start, 6);
  return `${dayLabel(start, { day: 'numeric', month: 'short' })} – ${dayLabel(end, { day: 'numeric', month: 'short', year: 'numeric' })}`;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function chipClass(r: RotaPlanListItem, today: string) {
  if (r.status !== 'published') return 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200';
  if (r.start_date <= today && r.end_date >= today) return 'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200';
  return 'border-green-300 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950/40 dark:text-green-200';
}

/**
 * Rotas laid over a week or a month: each day lists the rotas running on it, so gaps in
 * cover and overlapping rotas are visible at a glance.
 */
export function RotaPeriodCalendar({
  rotas,
  mode,
  focus,
  today,
}: {
  rotas: RotaPlanListItem[];
  mode: 'week' | 'month';
  focus: string;
  today: string;
}) {
  let days: string[];
  let monthPrefix = '';
  if (mode === 'week') {
    const start = weekStartKey(focus);
    days = Array.from({ length: 7 }, (_, i) => addDaysKey(start, i));
  } else {
    monthPrefix = focus.slice(0, 7);
    const first = `${monthPrefix}-01`;
    const start = weekStartKey(first);
    const lastOfMonth = addDaysKey(addMonthsKey(first, 1), -1);
    const end = addDaysKey(weekStartKey(lastOfMonth), 6);
    days = [];
    for (let d = start; d <= end; d = addDaysKey(d, 1)) days.push(d);
  }
  const maxChips = mode === 'week' ? 12 : 3;

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[720px] grid-cols-7 overflow-hidden rounded-lg border">
        {WEEKDAYS.map((w) => (
          <div key={w} className="border-b bg-muted/50 px-2 py-1.5 text-center text-xs font-semibold text-muted-foreground">
            {w}
          </div>
        ))}
        {days.map((d, i) => {
          const running = rotas
            .filter((r) => r.start_date <= d && r.end_date >= d)
            .sort((a, b) => a.name.localeCompare(b.name));
          const outside = mode === 'month' && !d.startsWith(monthPrefix);
          return (
            <div
              key={d}
              className={cn(
                'space-y-1 border-b p-1.5',
                i % 7 !== 6 && 'border-r',
                mode === 'week' ? 'min-h-[220px]' : 'min-h-[104px]',
                outside && 'bg-muted/30',
                d === today && 'bg-orange-50/70 dark:bg-orange-950/20'
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'inline-flex size-6 items-center justify-center rounded-full text-xs font-medium',
                    d === today ? 'bg-primary text-primary-foreground' : outside ? 'text-muted-foreground/60' : 'text-foreground'
                  )}
                >
                  {Number(d.slice(8, 10))}
                </span>
                {running.length ? (
                  <span className="text-[10px] text-muted-foreground">{running.length} rota{running.length === 1 ? '' : 's'}</span>
                ) : null}
              </div>
              {running.slice(0, maxChips).map((r) => (
                <Link
                  key={r.id}
                  href={`/rota/calendar?id=${r.id}`}
                  title={`${r.name} · ${r.shift_count} shifts · ${r.staff_count} staff`}
                  className={cn('block truncate rounded border px-1.5 py-0.5 text-[11px] font-medium hover:underline', chipClass(r, today))}
                >
                  {r.name}
                </Link>
              ))}
              {running.length > maxChips ? (
                <p className="px-1 text-[10px] text-muted-foreground">+{running.length - maxChips} more</p>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-sky-400" /> Active now</span>
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-green-400" /> Published</span>
        <span className="inline-flex items-center gap-1"><span className="size-2.5 rounded-sm bg-amber-400" /> Draft</span>
      </div>
    </div>
  );
}
