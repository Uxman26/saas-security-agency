export type RotaViewMode = 'table' | 'timeline' | 'dnd';

export type ShiftAdjustment = {
  type: 'overtime' | 'early_finish';
  scheduledEnd: string;
  actualEnd: string;
  reason: string;
  at: string;
  synced?: boolean;
};

export type ShiftRec = {
  start: string;
  end: string;
  site: string;
  notes: string;
  breakH: number;
  breakM: number;
  color: string;
  label: string;
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
};

export type AttStatus = 'present' | 'absent' | 'late';

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
