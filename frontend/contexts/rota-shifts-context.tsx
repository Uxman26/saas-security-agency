'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import { guardsToEmployees } from '@/lib/rota-guards-pool';
import { buildDayRange, attKey, calcHours } from '@/lib/rota-shifts-utils';
import type { AttendanceRec, EmployeeRec, RotaJsState, RotaViewMode, ShiftRec } from '@/lib/rota-shifts-types';
import { SHIFT_COLOR_OPTS } from '@/lib/rota-shifts-types';

type InitPayload = {
  name: string;
  view: RotaViewMode;
  startDate: string;
  dayCount: number;
  budget: number;
  copySeed?: boolean;
};

function emptyShifts() {
  return {} as RotaJsState['shifts'];
}

function seedSampleShifts(days: string[], pool: EmployeeRec[]): RotaJsState['shifts'] {
  const out = emptyShifts();
  if (pool.length < 3) return out;
  const e0 = pool[0].id;
  const e1 = pool[1].id;
  const e2 = pool[2].id;
  if (days[0]) {
    out[e0] = { ...out[e0], [days[0]]: [mkShift('09:00', '17:00', 'The Hive', '#f59e0b')] };
  }
  if (days[2]) {
    out[e2] = { ...out[e2], [days[2]]: [mkShift('09:00', '17:00', 'The Hive', '#10b981')] };
  }
  if (days[4]) {
    out[e2] = {
      ...out[e2],
      [days[4]]: [...(out[e2]?.[days[4]] || []), mkShift('09:00', '17:00', 'Central Office', '#3b82f6')],
    };
  }
  if (days[1]) {
    out[e1] = { ...out[e1], [days[1]]: [mkShift('20:00', '08:00', 'Holiday Inn', '#ec4899')] };
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
});

type Ctx = {
  state: RotaJsState;
  pool: EmployeeRec[];
  poolLoading: boolean;
  initRota: (p: InitPayload) => void;
  resetRota: () => void;
  setRotaView: (v: RotaViewMode) => void;
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
  copyAllShiftsBetweenEmployees: (fromId: string, toId: string) => void;
  clearEmployeeShifts: (empId: string) => void;
  setAttendance: (key: string, a: AttendanceRec) => void;
  setCtxShift: (v: RotaJsState['ctxShift']) => void;
  setCtxEmp: (id: string | null) => void;
  setCopyShift: (v: RotaJsState['copyShift']) => void;
  setEmpModalSelected: (ids: string[]) => void;
  setOrderDragIdx: (n: number | null) => void;
  setSelectedColor: (c: string) => void;
  totalRotaHours: number;
  empTotalHours: (empId: string) => number;
  dayTotalHours: (dk: string) => number;
};

const RotaCtx = createContext<Ctx | null>(null);

export function RotaShiftsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RotaJsState>(defaultState);
  const [pool, setPool] = useState<EmployeeRec[]>([]);
  const [poolLoading, setPoolLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPoolLoading(true);
      try {
        const guards = await api.guards.list();
        if (!cancelled) setPool(guardsToEmployees(guards));
      } catch {
        if (!cancelled) setPool([]);
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
        shifts = seedSampleShifts(days, pool);
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
    [pool]
  );

  const resetRota = useCallback(() => setState(defaultState()), []);

  const setRotaView = useCallback((rotaView: RotaViewMode) => {
    setState((s) => ({ ...s, rotaView }));
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

  const totalRotaHours = useMemo(() => {
    let t = 0;
    for (const empId of Object.keys(state.shifts)) {
      const byD = state.shifts[empId];
      for (const dk of Object.keys(byD)) {
        for (const sh of byD[dk] || []) t += calcHours(sh);
      }
    }
    return t;
  }, [state.shifts]);

  const empTotalHours = useCallback(
    (empId: string) => {
      const byD = state.shifts[empId];
      if (!byD) return 0;
      let t = 0;
      for (const dk of Object.keys(byD)) {
        for (const sh of byD[dk] || []) t += calcHours(sh);
      }
      return t;
    },
    [state.shifts]
  );

  const dayTotalHours = useCallback(
    (dk: string) => {
      let t = 0;
      for (const empId of Object.keys(state.shifts)) {
        for (const sh of state.shifts[empId]?.[dk] || []) t += calcHours(sh);
      }
      return t;
    },
    [state.shifts]
  );

  const value = useMemo(
    () => ({
      state,
      pool,
      poolLoading,
      initRota,
      resetRota,
      setRotaView,
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
      copyAllShiftsBetweenEmployees,
      clearEmployeeShifts,
      setAttendance,
      setCtxShift,
      setCtxEmp,
      setCopyShift,
      setEmpModalSelected,
      setOrderDragIdx,
      setSelectedColor,
      totalRotaHours,
      empTotalHours,
      dayTotalHours,
    }),
    [
      state,
      pool,
      poolLoading,
      initRota,
      resetRota,
      setRotaView,
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
      copyAllShiftsBetweenEmployees,
      clearEmployeeShifts,
      setAttendance,
      setCtxShift,
      setCtxEmp,
      setCopyShift,
      setEmpModalSelected,
      setOrderDragIdx,
      setSelectedColor,
      totalRotaHours,
      empTotalHours,
      dayTotalHours,
    ]
  );

  return <RotaCtx.Provider value={value}>{children}</RotaCtx.Provider>;
}

export function useRotaShifts() {
  const x = useContext(RotaCtx);
  if (!x) throw new Error('useRotaShifts requires provider');
  return x;
}
