export type RotaViewMode = 'table' | 'timeline' | 'dnd';

export type ShiftRec = {
  start: string;
  end: string;
  site: string;
  notes: string;
  breakH: number;
  breakM: number;
  color: string;
  label: string;
};

export type EmployeeRec = {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
};

export type AttStatus = 'present' | 'absent' | 'late';

export type AttendanceRec = {
  status: AttStatus;
  hours: string;
  note: string;
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
};

export const ROTA_SITES = [
  'The Hive',
  'Holiday Inn',
  'Central Office',
  'City Tower',
  'Airport Terminal',
] as const;

export const SHIFT_COLOR_OPTS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899'] as const;

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
