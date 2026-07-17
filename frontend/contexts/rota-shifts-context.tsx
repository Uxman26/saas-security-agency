'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { guardsToEmployees } from '@/lib/rota-guards-pool';
import { applyPlannerPayload, serializePlannerState } from '@/lib/rota-planner-persist';
import { buildDayRange, attKey, calcHours, shiftPayable } from '@/lib/rota-shifts-utils';
import type { AttendanceRec, EmployeeRec, RotaJsState, RotaViewMode, ShiftRec } from '@/lib/rota-shifts-types';
import { SHIFT_COLOR_OPTS } from '@/lib/rota-shifts-types';
import type { RotaPlanDetail } from '@/lib/types';

type InitPayload = {
  name: string;
  view: RotaViewMode;
  startDate: string;
  dayCount: number;
  budget: number;
  copySeed?: boolean;
  includeAllStaff?: boolean;
  staffIds?: string[];
};

export type PublishRotaResult = {
  created: number;
  skipped: number;
  errors: string[];
};

function emptyShifts() {
  return {} as RotaJsState['shifts'];
}

function seedSampleShifts(days: string[], pool: EmployeeRec[], siteNames: string[]): RotaJsState['shifts'] {
  const out = emptyShifts();
  if (pool.length < 3 || siteNames.length === 0) return out;
  const s0 = siteNames[0];
  const s1 = siteNames[1] ?? s0;
  const e0 = pool[0].id;
  const e1 = pool[1].id;
  const e2 = pool[2].id;
  if (days[0]) {
    out[e0] = { ...out[e0], [days[0]]: [mkShift('09:00', '17:00', s0, '#f59e0b')] };
  }
  if (days[2]) {
    out[e2] = { ...out[e2], [days[2]]: [mkShift('09:00', '17:00', s0, '#10b981')] };
  }
  if (days[4]) {
    out[e2] = {
      ...out[e2],
      [days[4]]: [...(out[e2]?.[days[4]] || []), mkShift('09:00', '17:00', s1, '#3b82f6')],
    };
  }
  if (days[1]) {
    out[e1] = { ...out[e1], [days[1]]: [mkShift('20:00', '08:00', s1, '#ec4899')] };
  }
  return out;
}

function mkShift(start: string, end: string, site: string, color: string): ShiftRec {
  return {
    start,
    end,
    site,
    notes: '',
    breakH: 0,
    breakM: 30,
    color,
    label: '',
    shiftRate: null,
  };
}

const defaultState = (): RotaJsState => ({
  rotaName: '',
  rotaView: 'table',
  days: [],
  employees: [],
  shifts: emptyShifts(),
  attendance: {},
  budget: 0,
  selectedColor: SHIFT_COLOR_OPTS[0],
  ctxShift: null,
  ctxEmp: null,
  copyShift: null,
  empModal_selected: new Set<string>(),
  orderDragIdx: null,
  inclBreaks: false,
});

type Ctx = {
  state: RotaJsState;
  rotaPlanId: number | null;
  pool: EmployeeRec[];
  poolLoading: boolean;
  initRota: (p: InitPayload) => void;
  loadRotaPlan: (plan: RotaPlanDetail, bootstrap?: InitPayload) => void;
  setRotaPlanId: (id: number | null) => void;
  saveRotaPlan: () => Promise<void>;
  resetRota: () => void;
  setRotaView: (v: RotaViewMode) => void;
  setRotaName: (name: string) => void;
  setBudget: (n: number) => void;
  addDaysDelta: (delta: number) => void;
  setDayCount: (n: number) => void;
  addEmployeesById: (ids: string[]) => void;
  removeEmployee: (id: string) => void;
  reorderEmployees: (ids: string[]) => void;
  addShift: (empId: string, dk: string, s: ShiftRec) => void;
  updateShift: (empId: string, dk: string, idx: number, s: ShiftRec) => void;
  deleteShift: (empId: string, dk: string, idx: number) => void;
  copyShiftToDates: (empId: string, dk: string, idx: number, targets: string[]) => void;
  copyShiftToEmployee: (fromId: string, dk: string, idx: number, toId: string) => void;
  copyAllShiftsBetweenEmployees: (fromId: string, toId: string) => void;
  moveShiftToEmployee: (fromId: string, dk: string, idx: number, toId: string) => void;
  moveShiftToDay: (empId: string, fromDk: string, idx: number, toDk: string, toEmpId?: string) => void;
  clearEmployeeShifts: (empId: string) => void;
  setAttendance: (key: string, a: AttendanceRec) => void;
  setCtxShift: (v: RotaJsState['ctxShift']) => void;
  setCtxEmp: (id: string | null) => void;
  setCopyShift: (v: RotaJsState['copyShift']) => void;
  setEmpModalSelected: (ids: string[]) => void;
  setOrderDragIdx: (n: number | null) => void;
  setSelectedColor: (c: string) => void;
  setInclBreaks: (v: boolean) => void;
  publishRota: () => Promise<PublishRotaResult>;
  totalRotaHours: number;
  empTotalHours: (empId: string) => number;
  dayTotalHours: (dk: string) => number;
  totalRotaPayable: number;
  empTotalPayable: (empId: string) => number;
};

const RotaCtx = createContext<Ctx | null>(null);

export function RotaShiftsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RotaJsState>(defaultState);
  const [rotaPlanId, setRotaPlanId] = useState<number | null>(null);
  const [pool, setPool] = useState<EmployeeRec[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);
  const [siteNames, setSiteNames] = useState<string[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPoolLoading(true);
      try {
        const [guards, sites] = await Promise.all([api.guards.list(), api.sites.list()]);
        if (!cancelled) {
          setPool(guardsToEmployees(guards));
          setSiteNames(sites.map((s) => s.name));
        }
      } catch {
        if (!cancelled) {
          setPool([]);
          setSiteNames([]);
        }
      } finally {
        if (!cancelled) setPoolLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const initRota = useCallback(
    (p: InitPayload) => {
      const days = buildDayRange(p.startDate, p.dayCount);
      let employees: EmployeeRec[] = [];
      let shifts = emptyShifts();
      if (p.copySeed && pool.length > 0) {
        employees = pool.slice(0, Math.min(5, pool.length));
        shifts = seedSampleShifts(days, pool, siteNames);
      } else if (p.staffIds?.length && pool.length > 0) {
        const idSet = new Set(p.staffIds);
        employees = pool.filter((e) => idSet.has(e.id));
      } else if (p.includeAllStaff && pool.length > 0) {
        employees = [...pool];
      }
      setState({
        ...defaultState(),
        rotaName: p.name,
        rotaView: p.view,
        days,
        budget: p.budget,
        employees,
        shifts,
        selectedColor: SHIFT_COLOR_OPTS[0],
      });
    },
    [pool, siteNames]
  );

  const resetRota = useCallback(() => {
    setRotaPlanId(null);
    setState(defaultState());
  }, []);

  const saveRotaPlan = useCallback(async () => {
    if (!rotaPlanId || state.days.length === 0) return;
    await api.rotaPlans.update(rotaPlanId, {
      name: state.rotaName,
      view_mode: state.rotaView,
      budget: state.budget,
      planner_data: serializePlannerState(state),
    });
  }, [rotaPlanId, state]);

  useEffect(() => {
    if (!rotaPlanId || state.days.length === 0) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void api.rotaPlans
        .update(rotaPlanId, {
          name: state.rotaName,
          view_mode: state.rotaView,
          budget: state.budget,
          planner_data: serializePlannerState(state),
        })
        .catch(() => {});
    }, 1500);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [rotaPlanId, state]);

  const loadRotaPlan = useCallback(
    (plan: RotaPlanDetail, bootstrap?: InitPayload) => {
      setRotaPlanId(plan.id);
      if (plan.planner_data) {
        setState((s) => applyPlannerPayload(s, plan.planner_data, plan.name));
        return;
      }
      if (bootstrap) {
        const days = buildDayRange(bootstrap.startDate, bootstrap.dayCount);
        let employees: EmployeeRec[] = [];
        let shifts = emptyShifts();
        if (bootstrap.copySeed && pool.length > 0) {
          employees = pool.slice(0, Math.min(5, pool.length));
          shifts = seedSampleShifts(days, pool, siteNames);
        } else if (bootstrap.staffIds?.length && pool.length > 0) {
          const idSet = new Set(bootstrap.staffIds);
          employees = pool.filter((e) => idSet.has(e.id));
        } else if (bootstrap.includeAllStaff && pool.length > 0) {
          employees = [...pool];
        }
        setState({
          ...defaultState(),
          rotaName: plan.name,
          rotaView: (plan.view_mode as RotaViewMode) || bootstrap.view,
          days,
          budget: plan.budget ?? bootstrap.budget,
          employees,
          shifts,
          selectedColor: SHIFT_COLOR_OPTS[0],
        });
      } else {
        setState((s) => ({
          ...applyPlannerPayload(s, null, plan.name),
          rotaView: (plan.view_mode as RotaViewMode) || 'table',
          days: buildDayRange(plan.start_date, plan.day_count),
          budget: plan.budget ?? 0,
        }));
      }
    },
    [pool, siteNames]
  );

  const setRotaView = useCallback((rotaView: RotaViewMode) => {
    setState((s) => ({ ...s, rotaView }));
  }, []);

  const setRotaName = useCallback((rotaName: string) => {
    setState((s) => ({ ...s, rotaName }));
  }, []);

  const setBudget = useCallback((budget: number) => {
    setState((s) => ({ ...s, budget }));
  }, []);

  const addDaysDelta = useCallback((delta: number) => {
    setState((s) => {
      if (s.days.length === 0) return s;
      const start = s.days[0];
      const n = Math.max(1, s.days.length + delta);
      return { ...s, days: buildDayRange(start, n) };
    });
  }, []);

  const setDayCount = useCallback((n: number) => {
    setState((s) => {
      if (s.days.length === 0) return s;
      const start = s.days[0];
      return { ...s, days: buildDayRange(start, Math.max(1, n)) };
    });
  }, []);

  const addEmployeesById = useCallback(
    (ids: string[]) => {
      setState((s) => {
        const have = new Set(s.employees.map((e) => e.id));
        const add = ids
          .map((id) => pool.find((e) => e.id === id))
          .filter((e): e is EmployeeRec => !!e && !have.has(e.id));
        return { ...s, employees: [...s.employees, ...add] };
      });
    },
    [pool]
  );

  const removeEmployee = useCallback((id: string) => {
    setState((s) => {
      const shifts = { ...s.shifts };
      delete shifts[id];
      const attendance = { ...s.attendance };
      for (const k of Object.keys(attendance)) {
        if (k.startsWith(`${id}:`)) delete attendance[k];
      }
      return {
        ...s,
        employees: s.employees.filter((e) => e.id !== id),
        shifts,
        attendance,
      };
    });
  }, []);

  const reorderEmployees = useCallback((ids: string[]) => {
    setState((s) => {
      const map = new Map(s.employees.map((e) => [e.id, e]));
      const employees = ids.map((id) => map.get(id)).filter(Boolean) as EmployeeRec[];
      const rest = s.employees.filter((e) => !ids.includes(e.id));
      return { ...s, employees: [...employees, ...rest] };
    });
  }, []);

  const addShift = useCallback((empId: string, dk: string, sh: ShiftRec) => {
    setState((s) => {
      const emp = { ...s.shifts[empId] } as Record<string, ShiftRec[]>;
      const list = [...(emp[dk] || []), sh];
      emp[dk] = list;
      return { ...s, shifts: { ...s.shifts, [empId]: emp } };
    });
  }, []);

  const updateShift = useCallback((empId: string, dk: string, idx: number, sh: ShiftRec) => {
    setState((s) => {
      const emp = { ...s.shifts[empId] } as Record<string, ShiftRec[]>;
      const list = [...(emp[dk] || [])];
      list[idx] = sh;
      emp[dk] = list;
      return { ...s, shifts: { ...s.shifts, [empId]: emp } };
    });
  }, []);

  const deleteShift = useCallback((empId: string, dk: string, idx: number) => {
    setState((s) => {
      const emp = { ...s.shifts[empId] } as Record<string, ShiftRec[]>;
      const list = [...(emp[dk] || [])];
      const oldLen = list.length;
      list.splice(idx, 1);
      emp[dk] = list;
      const shifts = { ...s.shifts, [empId]: emp };
      const attendance = { ...s.attendance };
      for (let i = idx; i < oldLen - 1; i++) {
        const fromKey = attKey(empId, dk, i + 1);
        const toKey = attKey(empId, dk, i);
        if (attendance[fromKey]) {
          attendance[toKey] = { ...attendance[fromKey], si: i };
          delete attendance[fromKey];
        } else {
          delete attendance[toKey];
        }
      }
      delete attendance[attKey(empId, dk, oldLen - 1)];
      return { ...s, shifts, attendance };
    });
  }, []);

  const copyShiftToDates = useCallback((empId: string, dk: string, idx: number, targets: string[]) => {
    setState((s) => {
      const src = s.shifts[empId]?.[dk]?.[idx];
      if (!src) return s;
      const emp = { ...s.shifts[empId] } as Record<string, ShiftRec[]>;
      for (const t of targets) {
        if (!s.days.includes(t)) continue;
        const copy = { ...src };
        emp[t] = [...(emp[t] || []), copy];
      }
      return { ...s, shifts: { ...s.shifts, [empId]: emp } };
    });
  }, []);

  const copyShiftToEmployee = useCallback((fromId: string, dk: string, idx: number, toId: string) => {
    if (fromId === toId) return;
    setState((s) => {
      const src = s.shifts[fromId]?.[dk]?.[idx];
      if (!src) return s;
      const toEmp = { ...(s.shifts[toId] || {}) } as Record<string, ShiftRec[]>;
      toEmp[dk] = [...(toEmp[dk] || []), { ...src }];
      return { ...s, shifts: { ...s.shifts, [toId]: toEmp } };
    });
  }, []);

  const copyAllShiftsBetweenEmployees = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setState((s) => {
      const from = s.shifts[fromId];
      if (!from) return s;
      const toEmp = { ...(s.shifts[toId] || {}) } as Record<string, ShiftRec[]>;
      for (const dk of Object.keys(from)) {
        const blocks = from[dk] || [];
        toEmp[dk] = [...(toEmp[dk] || []), ...blocks.map((b) => ({ ...b }))];
      }
      return { ...s, shifts: { ...s.shifts, [toId]: toEmp } };
    });
  }, []);

  const moveShiftToEmployee = useCallback((fromId: string, dk: string, idx: number, toId: string) => {
    if (fromId === toId) return;
    setState((s) => {
      const fromEmp = s.shifts[fromId];
      const srcList = fromEmp?.[dk];
      if (!srcList?.[idx]) return s;
      const shift = { ...srcList[idx] };

      const fromCopy = { ...fromEmp } as Record<string, ShiftRec[]>;
      const fromList = [...(fromCopy[dk] || [])];
      const oldLen = fromList.length;
      fromList.splice(idx, 1);
      fromCopy[dk] = fromList;

      const toEmp = { ...(s.shifts[toId] || {}) } as Record<string, ShiftRec[]>;
      const toList = [...(toEmp[dk] || []), shift];
      toEmp[dk] = toList;
      const newIdx = toList.length - 1;

      const attendance = { ...s.attendance };
      const srcAttKey = attKey(fromId, dk, idx);
      if (attendance[srcAttKey]) {
        attendance[attKey(toId, dk, newIdx)] = { ...attendance[srcAttKey], si: newIdx };
        delete attendance[srcAttKey];
      }
      for (let i = idx; i < oldLen - 1; i++) {
        const fromKey = attKey(fromId, dk, i + 1);
        const toKey = attKey(fromId, dk, i);
        if (attendance[fromKey]) {
          attendance[toKey] = { ...attendance[fromKey], si: i };
          delete attendance[fromKey];
        } else {
          delete attendance[toKey];
        }
      }
      delete attendance[attKey(fromId, dk, oldLen - 1)];

      return {
        ...s,
        shifts: { ...s.shifts, [fromId]: fromCopy, [toId]: toEmp },
        attendance,
      };
    });
  }, []);

  /** Move a shift to another day (same employee by default), optionally to another employee. */
  const moveShiftToDay = useCallback((empId: string, fromDk: string, idx: number, toDk: string, toEmpId?: string) => {
    const destEmp = toEmpId || empId;
    if (empId === destEmp && fromDk === toDk) return;
    setState((s) => {
      const fromEmp = s.shifts[empId];
      const srcList = fromEmp?.[fromDk];
      if (!srcList?.[idx]) return s;
      const shift = { ...srcList[idx] };

      const fromCopy = { ...(fromEmp || {}) } as Record<string, ShiftRec[]>;
      const fromList = [...(fromCopy[fromDk] || [])];
      const oldLen = fromList.length;
      fromList.splice(idx, 1);
      fromCopy[fromDk] = fromList;

      const toEmp = empId === destEmp ? fromCopy : ({ ...(s.shifts[destEmp] || {}) } as Record<string, ShiftRec[]>);
      const toList = [...(toEmp[toDk] || []), shift];
      toEmp[toDk] = toList;
      const newIdx = toList.length - 1;

      const attendance = { ...s.attendance };
      const srcAttKey = attKey(empId, fromDk, idx);
      if (attendance[srcAttKey]) {
        attendance[attKey(destEmp, toDk, newIdx)] = {
          ...attendance[srcAttKey],
          empId: destEmp,
          dk: toDk,
          si: newIdx,
        };
        delete attendance[srcAttKey];
      }
      for (let i = idx; i < oldLen - 1; i++) {
        const fromKey = attKey(empId, fromDk, i + 1);
        const toKey = attKey(empId, fromDk, i);
        if (attendance[fromKey]) {
          attendance[toKey] = { ...attendance[fromKey], si: i };
          delete attendance[fromKey];
        } else {
          delete attendance[toKey];
        }
      }
      delete attendance[attKey(empId, fromDk, oldLen - 1)];

      const shifts = { ...s.shifts, [empId]: fromCopy };
      if (empId !== destEmp) shifts[destEmp] = toEmp;

      return { ...s, shifts, attendance };
    });
  }, []);

  const clearEmployeeShifts = useCallback((empId: string) => {
    setState((s) => {
      const shifts = { ...s.shifts };
      shifts[empId] = {};
      const attendance = { ...s.attendance };
      for (const k of Object.keys(attendance)) {
        if (k.startsWith(`${empId}:`)) delete attendance[k];
      }
      return { ...s, shifts, attendance };
    });
  }, []);

  const setAttendance = useCallback((key: string, a: AttendanceRec) => {
    setState((s) => ({ ...s, attendance: { ...s.attendance, [key]: a } }));
  }, []);

  const setCtxShift = useCallback((ctxShift: RotaJsState['ctxShift']) => {
    setState((s) => ({ ...s, ctxShift }));
  }, []);

  const setCtxEmp = useCallback((ctxEmp: string | null) => {
    setState((s) => ({ ...s, ctxEmp }));
  }, []);

  const setCopyShift = useCallback((copyShift: RotaJsState['copyShift']) => {
    setState((s) => ({ ...s, copyShift }));
  }, []);

  const setEmpModalSelected = useCallback((ids: string[]) => {
    setState((s) => ({ ...s, empModal_selected: new Set(ids) }));
  }, []);

  const setOrderDragIdx = useCallback((orderDragIdx: number | null) => {
    setState((s) => ({ ...s, orderDragIdx }));
  }, []);

  const setSelectedColor = useCallback((selectedColor: string) => {
    setState((s) => ({ ...s, selectedColor }));
  }, []);

  const setInclBreaks = useCallback((inclBreaks: boolean) => {
    setState((s) => ({ ...s, inclBreaks }));
  }, []);

  const publishRota = useCallback(async (): Promise<PublishRotaResult> => {
    if (rotaPlanId) {
      await saveRotaPlan();
      return api.rotaPlans.publish(rotaPlanId);
    }
    const sites = await api.sites.list();
    const siteByName = new Map(sites.map((s) => [s.name.trim().toLowerCase(), s.id]));
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];
    for (const empId of Object.keys(state.shifts)) {
      const guardId = parseInt(empId, 10);
      if (!guardId) continue;
      const byD = state.shifts[empId] || {};
      for (const dk of Object.keys(byD)) {
        for (const sh of byD[dk] || []) {
          const siteKey = (sh.site || '').trim().toLowerCase();
          const siteId = siteByName.get(siteKey);
          if (!siteId) {
            skipped++;
            errors.push(
              siteKey ? `No site named "${sh.site}" (${dk})` : `One-off shift on ${dk} (no site — skipped on publish)`
            );
            continue;
          }
          await api.assignments.create({
            guard_id: guardId,
            site_id: siteId,
            date: dk,
            shift_start: sh.start,
            shift_end: sh.end,
            break_minutes: (sh.breakH || 0) * 60 + (sh.breakM || 0),
            shift_type: 'day',
            ...(sh.shiftRate != null && !Number.isNaN(Number(sh.shiftRate)) ? { shift_rate: Number(sh.shiftRate) } : {}),
          });
          created++;
        }
      }
    }
    return { created, skipped, errors };
  }, [rotaPlanId, saveRotaPlan, state.shifts]);

  const totalRotaHours = useMemo(() => {
    let t = 0;
    for (const empId of Object.keys(state.shifts)) {
      const byD = state.shifts[empId];
      for (const dk of Object.keys(byD)) {
        for (const sh of byD[dk] || []) t += calcHours(sh, state.inclBreaks);
      }
    }
    return t;
  }, [state.shifts, state.inclBreaks]);

  const empTotalHours = useCallback(
    (empId: string) => {
      const byD = state.shifts[empId];
      if (!byD) return 0;
      let t = 0;
      for (const dk of Object.keys(byD)) {
        for (const sh of byD[dk] || []) t += calcHours(sh, state.inclBreaks);
      }
      return t;
    },
    [state.shifts, state.inclBreaks]
  );

  const dayTotalHours = useCallback(
    (dk: string) => {
      let t = 0;
      for (const empId of Object.keys(state.shifts)) {
        for (const sh of state.shifts[empId]?.[dk] || []) t += calcHours(sh, state.inclBreaks);
      }
      return t;
    },
    [state.shifts, state.inclBreaks]
  );

  const totalRotaPayable = useMemo(() => {
    let t = 0;
    for (const empId of Object.keys(state.shifts)) {
      const byD = state.shifts[empId];
      for (const dk of Object.keys(byD)) {
        for (const sh of byD[dk] || []) t += shiftPayable(sh, state.inclBreaks);
      }
    }
    return t;
  }, [state.shifts, state.inclBreaks]);

  const empTotalPayable = useCallback(
    (empId: string) => {
      const byD = state.shifts[empId];
      if (!byD) return 0;
      let t = 0;
      for (const dk of Object.keys(byD)) {
        for (const sh of byD[dk] || []) t += shiftPayable(sh, state.inclBreaks);
      }
      return t;
    },
    [state.shifts, state.inclBreaks]
  );

  const value = useMemo(
    () => ({
      state,
      rotaPlanId,
      pool,
      poolLoading,
      initRota,
      loadRotaPlan,
      setRotaPlanId,
      saveRotaPlan,
      resetRota,
      setRotaView,
      setRotaName,
      setBudget,
      addDaysDelta,
      setDayCount,
      addEmployeesById,
      removeEmployee,
      reorderEmployees,
      addShift,
      updateShift,
      deleteShift,
      copyShiftToDates,
      copyShiftToEmployee,
      copyAllShiftsBetweenEmployees,
      moveShiftToEmployee,
      moveShiftToDay,
      clearEmployeeShifts,
      setAttendance,
      setCtxShift,
      setCtxEmp,
      setCopyShift,
      setEmpModalSelected,
      setOrderDragIdx,
      setSelectedColor,
      setInclBreaks,
      publishRota,
      totalRotaHours,
      empTotalHours,
      dayTotalHours,
      totalRotaPayable,
      empTotalPayable,
    }),
    [
      state,
      rotaPlanId,
      pool,
      poolLoading,
      initRota,
      loadRotaPlan,
      saveRotaPlan,
      resetRota,
      setRotaView,
      setRotaName,
      setBudget,
      addDaysDelta,
      setDayCount,
      addEmployeesById,
      removeEmployee,
      reorderEmployees,
      addShift,
      updateShift,
      deleteShift,
      copyShiftToDates,
      copyShiftToEmployee,
      copyAllShiftsBetweenEmployees,
      moveShiftToEmployee,
      moveShiftToDay,
      clearEmployeeShifts,
      setAttendance,
      setCtxShift,
      setCtxEmp,
      setCopyShift,
      setEmpModalSelected,
      setOrderDragIdx,
      setSelectedColor,
      setInclBreaks,
      publishRota,
      totalRotaHours,
      empTotalHours,
      dayTotalHours,
      totalRotaPayable,
      empTotalPayable,
    ]
  );

  return <RotaCtx.Provider value={value}>{children}</RotaCtx.Provider>;
}

export function useRotaShifts() {
  const x = useContext(RotaCtx);
  if (!x) throw new Error('useRotaShifts requires provider');
  return x;
}
