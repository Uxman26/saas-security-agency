export type RotaViewMode = 'table' | 'timeline';

export type ShiftAdjustment = {
  type: 'overtime' | 'early_finish';
  scheduledEnd: string;
  actualEnd: string;
  reason: string;
  at: string;
  synced?: boolean;
};

export type ShiftType = 'morning' | 'afternoon' | 'evening' | 'night';

export type ShiftRec = {
  start: string;
  end: string;
  site: string;
  notes: string;
  breakH: number;
  breakM: number;
  color: string;
  label: string;
  /** Optional time-of-day band shown as a badge on the rota shift tile */
  shiftType?: ShiftType | null;
  shiftRate?: number | null;
  scheduledEnd?: string;
  scheduledStart?: string;
  adjustments?: ShiftAdjustment[];
};

export type EmployeeRec = {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
  phone?: string;
  photoUrl?: string | null;
  /** Latest guard hourly rate (fallback for Payable when shift has no rate) */
  hourlyRate?: number | null;
  /** Manual “pending rota” highlight on the staff name cell */
  rotaPending?: boolean;
};

/**
 * A cancelled shift is two statuses rather than one status plus a paid flag, so that
 * every tally, colour and payable check that already branches on the status string keeps
 * telling paid and unpaid cancellations apart without consulting a second field.
 */
export type AttStatus = 'on_time' | 'late' | 'absent' | 'no_show' | 'cancelled' | 'cancelled_paid';

export const CANCELLED_STATUSES: readonly AttStatus[] = ['cancelled', 'cancelled_paid'];

export function isCancelledStatus(s: AttStatus | string | null | undefined): boolean {
  return s === 'cancelled' || s === 'cancelled_paid';
}

export type AttendanceRec = {
  status: AttStatus;
  hours: string;
  note: string;
  lateMinutes?: number;
  /** Hours agreed for payment on a paid cancellation. Unset on every other status. */
  paidHours?: string;
  /** Hours agreed with the client for billing on a paid cancellation. */
  clientHours?: string;
  synced?: boolean;
  empId: string;
  dk: string;
  si: number;
};

export type RotaJsState = {
  rotaName: string;
  rotaView: RotaViewMode;
  days: string[];
  employees: EmployeeRec[];
  shifts: Record<string, Record<string, ShiftRec[]>>;
  attendance: Record<string, AttendanceRec>;
  budget: number;
  selectedColor: string;
  ctxShift: { empId: string; dk: string; idx: number } | null;
  ctxEmp: string | null;
  copyShift: { empId: string; dk: string; idx: number } | null;
  empModal_selected: Set<string>;
  orderDragIdx: number | null;
  inclBreaks: boolean;
};

export const SHIFT_COLOR_OPTS = [
  '#3b82f6',
  '#8b5cf6',
  '#6366f1',
  '#06b6d4',
  '#0ea5e9',
  '#14b8a6',
  '#10b981',
  '#22c55e',
  '#84cc16',
  '#eab308',
  '#f59e0b',
  '#f97316',
  '#ef4444',
  '#ec4899',
  '#d946ef',
  '#a855f7',
  '#64748b',
  '#78716f',
] as const;

/**
 * Shift-period colours.
 *
 * `bar` is the strong hue drawn along the top of a shift card; `bg`/`text` are the
 * quieter pairing the badge uses so a cell full of shifts stays readable. The hues match
 * the --shift-* tokens in globals.css.
 */
export const SHIFT_TYPE_OPTS: ReadonlyArray<{
  value: ShiftType;
  label: string;
  bar: string;
  bg: string;
  text: string;
}> = [
  {
    value: 'morning',
    label: 'MORNING',
    bar: 'var(--shift-morning)',
    bg: 'color-mix(in srgb, var(--shift-morning) 42%, var(--card))',
    text: 'var(--shift-morning-fg)',
  },
  {
    value: 'afternoon',
    label: 'AFTERNOON',
    bar: 'var(--shift-afternoon)',
    bg: 'color-mix(in srgb, var(--shift-afternoon) 38%, var(--card))',
    text: 'var(--shift-afternoon-fg)',
  },
  {
    value: 'evening',
    label: 'EVENING',
    bar: 'var(--shift-evening)',
    bg: 'color-mix(in srgb, var(--shift-evening) 42%, var(--card))',
    text: 'var(--shift-evening-fg)',
  },
  {
    value: 'night',
    label: 'NIGHT',
    bar: 'var(--shift-night)',
    bg: 'var(--shift-night)',
    text: 'var(--shift-night-fg)',
  },
];

/** A shift that needs attention (a clash, an unresolved conflict) — palette red. */
export const SHIFT_URGENT_COLOR = 'var(--shift-urgent)';

export function shiftTypeOption(value: ShiftType | null | undefined) {
  if (!value) return null;
  return SHIFT_TYPE_OPTS.find((o) => o.value === value) ?? null;
}

/** Accepts anything stored on old shifts and returns a valid type or null. */
export function normalizeShiftType(value: unknown): ShiftType | null {
  const v = String(value ?? '').trim().toLowerCase();
  return SHIFT_TYPE_OPTS.some((o) => o.value === v) ? (v as ShiftType) : null;
}

/**
 * Classify a shift as Morning / Afternoon / Evening / Night from its clock times.
 *
 * Overnight (end at or before start) is Night. Same start and end is treated as unset
 * so a blank new-shift form does not jump to Night before times are chosen.
 */
export function classifyShiftType(start: string, end: string): ShiftType | null {
  const s = String(start || '').trim();
  const e = String(end || '').trim();
  if (!s || !e || s === e) return null;
  const startMins =
    (parseInt(s.split(':')[0] || '0', 10) || 0) * 60 + (parseInt(s.split(':')[1] || '0', 10) || 0);
  const endMins =
    (parseInt(e.split(':')[0] || '0', 10) || 0) * 60 + (parseInt(e.split(':')[1] || '0', 10) || 0);
  if (endMins <= startMins) return 'night';
  const hour = Math.floor(startMins / 60);
  if (hour < 11) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export const AVATAR_PALETTE = [
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#06b6d4',
  '#f97316',
];
