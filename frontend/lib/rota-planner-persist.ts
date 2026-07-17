import { buildDayRange, normalizeAttStatus } from './rota-shifts-utils';
import type { AttendanceRec, RotaJsState, ShiftRec } from './rota-shifts-types';
import { SHIFT_COLOR_OPTS, AVATAR_PALETTE } from './rota-shifts-types';

export type PlannerPayload = {
  rotaView: RotaJsState['rotaView'];
  days: string[];
  employees: RotaJsState['employees'];
  shifts: RotaJsState['shifts'];
  attendance: RotaJsState['attendance'];
  budget: number;
  inclBreaks: boolean;
};

function normalizeShift(sh: Partial<ShiftRec>, idx: number): ShiftRec {
  const rate = sh.shiftRate;
  const shiftRate = rate != null && !Number.isNaN(Number(rate)) && Number(rate) >= 0 ? Number(rate) : null;
  const adjustments = (sh.adjustments || []).map((a) => ({
    type: a.type,
    scheduledEnd: a.scheduledEnd,
    actualEnd: a.actualEnd,
    reason: a.reason,
    at: a.at,
    synced: a.synced,
  }));
  return {
    start: sh.start ?? '09:00',
    end: sh.end ?? '17:00',
    site: sh.site ?? '',
    notes: sh.notes ?? '',
    breakH: sh.breakH ?? 0,
    breakM: sh.breakM ?? 0,
    color: sh.color?.trim() || SHIFT_COLOR_OPTS[idx % SHIFT_COLOR_OPTS.length],
    label: sh.label ?? '',
    shiftRate,
    scheduledEnd: sh.scheduledEnd || undefined,
    scheduledStart: sh.scheduledStart || undefined,
    adjustments: adjustments.length ? adjustments : undefined,
  };
}

function normalizeShifts(shifts: PlannerPayload['shifts']): PlannerPayload['shifts'] {
  const out: PlannerPayload['shifts'] = {};
  let idx = 0;
  for (const [empId, byD] of Object.entries(shifts || {})) {
    const mapped: Record<string, ShiftRec[]> = {};
    for (const [dk, blocks] of Object.entries(byD || {})) {
      mapped[dk] = (blocks || []).map((b) => normalizeShift(b, idx++));
    }
    if (Object.keys(mapped).length) out[empId] = mapped;
  }
  return out;
}

export function serializePlannerState(state: RotaJsState): string {
  const payload: PlannerPayload = {
    rotaView: state.rotaView,
    days: state.days,
    employees: state.employees,
    shifts: state.shifts,
    attendance: state.attendance,
    budget: state.budget,
    inclBreaks: state.inclBreaks,
  };
  return JSON.stringify(payload);
}

export function remapPlannerPayload(
  payload: PlannerPayload,
  oldStart: string,
  oldDayCount: number,
  newStart: string,
  newDayCount: number
): PlannerPayload {
  const oldDays = payload.days?.length ? payload.days : buildDayRange(oldStart, oldDayCount);
  const newDays = buildDayRange(newStart, newDayCount);
  const dayMap = Object.fromEntries(
    oldDays.slice(0, newDays.length).map((d, i) => [d, newDays[i]])
  );

  const shifts: PlannerPayload['shifts'] = {};
  for (const [empId, byD] of Object.entries(payload.shifts || {})) {
    const mapped: Record<string, ShiftRec[]> = {};
    for (const [oldDk, blocks] of Object.entries(byD || {})) {
      const newDk = dayMap[oldDk];
      if (newDk && blocks?.length) mapped[newDk] = blocks.map((b) => ({ ...b }));
    }
    if (Object.keys(mapped).length) shifts[empId] = mapped;
  }

  const attendance: PlannerPayload['attendance'] = {};
  for (const [key, rec] of Object.entries(payload.attendance || {})) {
    const [empId, oldDk, si] = key.split(':');
    const newDk = dayMap[oldDk];
    if (!newDk) continue;
    attendance[`${empId}:${newDk}:${si}`] = { ...rec, dk: newDk, empId };
  }

  return normalizePayload({ ...payload, days: newDays, shifts, attendance });
}

function normalizeAttendance(attendance: PlannerPayload['attendance']): PlannerPayload['attendance'] {
  const out: PlannerPayload['attendance'] = {};
  for (const [key, rec] of Object.entries(attendance || {})) {
    const status = normalizeAttStatus(rec.status) ?? 'on_time';
    out[key] = { ...rec, status };
  }
  return out;
}

function normalizePayload(p: PlannerPayload): PlannerPayload {
  return {
    rotaView: p.rotaView ?? 'table',
    days: p.days ?? [],
    employees: (p.employees ?? []).map((e, i) => ({
      id: e.id,
      name: e.name ?? '',
      role: e.role ?? 'Staff',
      avatarColor: e.avatarColor?.trim() || AVATAR_PALETTE[i % AVATAR_PALETTE.length],
      ...(e.photoUrl != null ? { photoUrl: e.photoUrl } : {}),
    })),
    shifts: normalizeShifts(p.shifts),
    attendance: normalizeAttendance(p.attendance),
    budget: p.budget ?? 0,
    inclBreaks: p.inclBreaks ?? false,
  };
}

export function applyPlannerPayload(state: RotaJsState, raw: string | null | undefined, rotaName: string): RotaJsState {
  if (!raw) return { ...state, rotaName };
  try {
    const p = normalizePayload(JSON.parse(raw) as PlannerPayload);
    return {
      ...state,
      rotaName,
      rotaView: p.rotaView,
      days: p.days,
      employees: p.employees,
      shifts: p.shifts,
      attendance: p.attendance,
      budget: p.budget,
      inclBreaks: p.inclBreaks,
      selectedColor: state.selectedColor,
    };
  } catch {
    return { ...state, rotaName };
  }
}
