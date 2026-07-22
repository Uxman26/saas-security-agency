import { api } from '@/lib/api';
import {
  attKey,
  attStatusLabel,
  countedHoursForAttendance,
  normalizeAttStatus,
  payableHoursForAttendance,
  shiftSiteLine,
} from '@/lib/rota-shifts-utils';
import type { RotaJsState, ShiftRec } from '@/lib/rota-shifts-types';
import { serializePlannerState } from '@/lib/rota-planner-persist';

function csvCell(value: string | number | null | undefined) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rotaFilename(state: RotaJsState, ext: string) {
  const from = state.days[0] || 'start';
  const to = state.days[state.days.length - 1] || 'end';
  const safeName = (state.rotaName || 'rota').replace(/[^\w.-]+/g, '_').slice(0, 40);
  return `${safeName}_${from}_${to}.${ext}`;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadPlannerRotaCsv(
  state: RotaJsState,
  resolveShiftRate: (shift: ShiftRec, empId: string) => number
) {
  if (!state.days.length) return false;

  const header = [
    'Employee',
    'Role',
    'Date',
    'Start',
    'End',
    'Site',
    'Hours',
    'Status',
    'Rate',
    'Payable',
    'Note',
  ];
  const lines = [header.map(csvCell).join(',')];

  for (const emp of state.employees) {
    let wrote = false;
    for (const dk of state.days) {
      const list = state.shifts[emp.id]?.[dk] || [];
      list.forEach((sh, idx) => {
        wrote = true;
        const a = state.attendance[attKey(emp.id, dk, idx)];
        const status = normalizeAttStatus(a?.status);
        const hours = countedHoursForAttendance(sh, a, state.inclBreaks);
        const payableHrs = payableHoursForAttendance(sh, a, state.inclBreaks);
        const rate = resolveShiftRate(sh, emp.id);
        const payable = payableHrs * rate;
        lines.push(
          [
            emp.name,
            emp.role,
            dk,
            sh.start,
            sh.end,
            shiftSiteLine(sh) || sh.site || '',
            hours.toFixed(2),
            status ? attStatusLabel(status) : '',
            rate.toFixed(2),
            payable.toFixed(2),
            a?.note || '',
          ]
            .map(csvCell)
            .join(',')
        );
      });
    }
    if (!wrote) {
      lines.push([emp.name, emp.role, '', '', '', '', '0.00', '', '', '0.00', ''].map(csvCell).join(','));
    }
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  downloadBlob(blob, rotaFilename(state, 'csv'));
  return true;
}

export async function downloadPlannerRotaPdf(state: RotaJsState) {
  if (!state.days.length) return false;
  const payload = JSON.parse(serializePlannerState(state)) as Record<string, unknown>;
  payload.rotaName = state.rotaName;
  const blob = await api.rotaPlans.exportPlanner(JSON.stringify(payload), 'pdf');
  downloadBlob(blob, rotaFilename(state, 'pdf'));
  return true;
}
