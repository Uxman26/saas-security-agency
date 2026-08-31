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

export type AttStatus = 'on_time' | 'late' | 'absent' | 'no_show';

export type AttendanceRec = {
  status: AttStatus;
  hours: string;
  note: string;
  lateMinutes?: number;
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
  { value: 'morning', label: 'MORNING', bar: '#06B6D4', bg: '#CFFAFE', text: '#0E7490' },
  { value: 'afternoon', label: 'AFTERNOON', bar: '#6366F1', bg: '#E0E7FF', text: '#3730A3' },
  { value: 'evening', label: 'EVENING', bar: '#F59E0B', bg: '#FEF3C7', text: '#B45309' },
  { value: 'night', label: 'NIGHT', bar: '#64748B', bg: '#E2E8F0', text: '#334155' },
];

/** A shift that needs attention (a clash, an unresolved conflict) — palette red. */
export const SHIFT_URGENT_COLOR = '#EF4444';

export function shiftTypeOption(value: ShiftType | null | undefined) {
  if (!value) return null;
  return SHIFT_TYPE_OPTS.find((o) => o.value === value) ?? null;
}

/** Accepts anything stored on old shifts and returns a valid type or null. */
export function normalizeShiftType(value: unknown): ShiftType | null {
  const v = String(value ?? '').trim().toLowerCase();
  return SHIFT_TYPE_OPTS.some((o) => o.value === v) ? (v as ShiftType) : null;
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
