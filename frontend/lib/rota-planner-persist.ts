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
