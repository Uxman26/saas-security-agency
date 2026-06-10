import { buildDayRange } from './rota-shifts-utils';
import type { RotaJsState } from './rota-shifts-types';

export type PlannerPayload = {
  rotaView: RotaJsState['rotaView'];
  days: string[];
  employees: RotaJsState['employees'];
  shifts: RotaJsState['shifts'];
  attendance: RotaJsState['attendance'];
  budget: number;
  inclBreaks: boolean;
};

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
    const mapped: Record<string, PlannerPayload['shifts'][string][string]> = {};
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

  return { ...payload, days: newDays, shifts, attendance };
}

export function applyPlannerPayload(state: RotaJsState, raw: string | null | undefined, rotaName: string): RotaJsState {
  if (!raw) return { ...state, rotaName };
  try {
    const p = JSON.parse(raw) as PlannerPayload;
    return {
      ...state,
      rotaName,
      rotaView: p.rotaView ?? state.rotaView,
      days: p.days ?? [],
      employees: p.employees ?? [],
      shifts: p.shifts ?? {},
      attendance: p.attendance ?? {},
      budget: p.budget ?? 0,
      inclBreaks: p.inclBreaks ?? false,
      selectedColor: state.selectedColor,
    };
  } catch {
    return { ...state, rotaName };
  }
}
