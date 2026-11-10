export type RotaViewMode = 'table' | 'timeline';

export type ShiftAdjustment = {
  type: 'overtime' | 'early_finish';
  scheduledEnd: string;
  actualEnd: string;
  reason: string;
  at: string;
  synced?: boolean;
  /** Early finish only: hours payroll pays, as entered. Absent on older records. */
  payableHours?: string;
  /** Early finish only: hours the client invoice bills, as entered. */
  chargeableHours?: string;
};

export type ShiftType = 'morning' | 'afternoon' | 'evening' | 'night';

/**
 * How a shift is paid. An hourly job pays `shiftRate` for each payable hour; a per-job
 * shift pays `shiftRate` once, however long the shift runs.
 */
export type PayType = 'hourly' | 'per_job';

export const PAY_TYPE_OPTS: ReadonlyArray<{ value: PayType; label: string }> = [
  { value: 'hourly', label: 'Hourly job' },
  { value: 'per_job', label: 'Per job' },
];

export function normalizePayType(value: unknown): PayType | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (v === 'per_job') return 'per_job';
  if (v === 'hourly') return 'hourly';
  return null;
}

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
  /** Unset on shifts saved before job types existed; they follow the staff profile. */
  payType?: PayType | null;
  /**
   * Bill the client for the full shift, ignoring the staff break. Staff are still paid net
   * of their break. Unset is treated as true.
   */
  invoiceWithoutBreak?: boolean;
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
  /** Profile rate for the profile's own job type (per hour, or per job for per-job staff). */
  hourlyRate?: number | null;
  /** Job type from Staff → Employment Details; new shifts start with it. */
  payType?: PayType;
  /** Profile rate for each job type, so switching type on a shift can autofill. */
  ratesByType?: { hourly: number | null; per_job: number | null };
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

export function shiftSiteBarColor(
  shift: Pick<ShiftRec, 'color' | 'site' | 'shiftType'>,
  sites?: Array<{ name?: string | null; color?: string | null }> | null,
  fallback = 'var(--shift-night)'
) {
  const siteName = (shift.site || '').trim().toLowerCase();
  const fromSite = siteName
    ? sites?.find((s) => (s.name || '').trim().toLowerCase() === siteName)?.color
    : undefined;
  return (fromSite || shift.color || shiftTypeOption(shift.shiftType)?.bar || fallback).trim();
}

/** Accepts anything stored on old shifts and returns a valid type or null. */
export function normalizeShiftType(value: unknown): ShiftType | null {
  const v = String(value ?? '').trim().toLowerCase();
  return SHIFT_TYPE_OPTS.some((o) => o.value === v) ? (v as ShiftType) : null;
}

/**
 * Classify a shift as Morning / Afternoon / Evening / Night from its clock times.
 *
 * Goes by start time only, matching rota_service.infer_shift_type_from_start, so a
 * 15:00–00:00 shift is Afternoon rather than Night just because it ends at midnight.
 * Same start and end is treated as unset so a blank new-shift form does not jump to a
 * type before times are chosen.
 */
export function classifyShiftType(start: string, end: string): ShiftType | null {
  const s = String(start || '').trim();
  const e = String(end || '').trim();
  if (!s || !e || s === e) return null;
  const hour = parseInt(s.split(':')[0] || '0', 10) || 0;
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
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
