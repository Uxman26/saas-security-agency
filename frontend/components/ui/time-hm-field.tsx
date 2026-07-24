'use client';

import { cn } from '@/lib/utils';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function normalizeHm(value?: string | null): string {
  if (!value || !String(value).trim()) return '00:00';
  const parts = String(value).trim().split(':');
  const h = Math.min(23, Math.max(0, parseInt(parts[0] || '0', 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1] || '0', 10) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  /** Accessible name for the combined control */
  'aria-label'?: string;
};

/**
 * Inline hours + minutes in one field (no browser clock popup / modal).
 * Value format: HH:MM (24h).
 */
export function TimeHmField({
  value,
  onChange,
  disabled,
  id,
  className,
  'aria-label': ariaLabel = 'Time',
}: Props) {
  const hm = normalizeHm(value);
  const [hour, minute] = hm.split(':');

  const setHour = (h: string) => onChange(`${h}:${minute}`);
  const setMinute = (m: string) => onChange(`${hour}:${m}`);

  return (
    <div
      id={id}
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'flex h-9 w-full items-center gap-1 rounded-md border border-input bg-transparent px-2 shadow-xs',
        'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <select
        className="h-7 min-w-0 flex-1 appearance-none bg-transparent px-1 text-sm tabular-nums outline-none"
        value={hour}
        disabled={disabled}
        aria-label={`${ariaLabel} hour`}
        onChange={(e) => setHour(e.target.value)}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="shrink-0 text-sm font-semibold text-muted-foreground" aria-hidden>
        :
      </span>
      <select
        className="h-7 min-w-0 flex-1 appearance-none bg-transparent px-1 text-sm tabular-nums outline-none"
        value={minute}
        disabled={disabled}
        aria-label={`${ariaLabel} minute`}
        onChange={(e) => setMinute(e.target.value)}
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}

type DurationProps = {
  hours: number;
  minutes: number;
  onChange: (next: { hours: number; minutes: number }) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  maxHours?: number;
};

/** Inline duration hours + minutes in one field (e.g. lateness, break). */
export function DurationHmField({
  hours,
  minutes,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel = 'Duration',
  maxHours = 23,
}: DurationProps) {
  const hOpts = Array.from({ length: maxHours + 1 }, (_, i) => i);
  const safeH = Math.min(maxHours, Math.max(0, Number(hours) || 0));
  const safeM = Math.min(59, Math.max(0, Number(minutes) || 0));

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'flex h-9 w-full items-center gap-1 rounded-md border border-input bg-transparent px-2 shadow-xs',
        'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
        disabled && 'pointer-events-none opacity-50',
        className
      )}
    >
      <select
        className="h-7 min-w-0 flex-1 appearance-none bg-transparent px-1 text-sm tabular-nums outline-none"
        value={safeH}
        disabled={disabled}
        aria-label={`${ariaLabel} hours`}
        onChange={(e) => onChange({ hours: parseInt(e.target.value, 10) || 0, minutes: safeM })}
      >
        {hOpts.map((h) => (
          <option key={h} value={h}>
            {h} hr
          </option>
        ))}
      </select>
      <span className="shrink-0 text-muted-foreground text-xs" aria-hidden>
        ·
      </span>
      <select
        className="h-7 min-w-0 flex-1 appearance-none bg-transparent px-1 text-sm tabular-nums outline-none"
        value={safeM}
        disabled={disabled}
        aria-label={`${ariaLabel} minutes`}
        onChange={(e) => onChange({ hours: safeH, minutes: parseInt(e.target.value, 10) || 0 })}
      >
        {MINUTES.map((m) => (
          <option key={m} value={parseInt(m, 10)}>
            {m} min
          </option>
        ))}
      </select>
    </div>
  );
}
