'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  attKey,
  attStatusLabel,
  calcHours,
  fmtShortDate,
  formatHoursDecimal,
  formatMoney,
  normalizeAttStatus,
  payableHoursForAttendance,
  shiftSiteLine,
} from '@/lib/rota-shifts-utils';
import type { EmployeeRec, RotaJsState, ShiftRec } from '@/lib/rota-shifts-types';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeRec | null;
  state: RotaJsState;
  resolveShiftRate: (sh: { site?: string; shiftRate?: number | null }, empId?: string) => number;
  rotaName?: string;
};

function rateSourceLabel(
  sh: ShiftRec,
  emp: EmployeeRec,
  resolved: number
): string {
  if (resolved <= 0) return 'No rate set';
  if (sh.shiftRate != null && !Number.isNaN(Number(sh.shiftRate)) && Number(sh.shiftRate) > 0) {
    return 'Shift rate';
  }
  if (emp.hourlyRate != null && emp.hourlyRate > 0 && Math.abs(emp.hourlyRate - resolved) < 0.005) {
    return 'Staff rate';
  }
  return 'Site / staff rate';
}

export function RatePreviewDialog({
  open,
  onOpenChange,
  employee,
  state,
  resolveShiftRate,
  rotaName,
}: Props) {
  if (!employee) return null;

  const shiftsByDay = state.days
    .map((dk) => ({ dk, shifts: (state.shifts[employee.id]?.[dk] || []) as ShiftRec[] }))
    .filter((row) => row.shifts.length > 0);

  let totalHours = 0;
  let totalScheduled = 0;
  let totalPayable = 0;

  const dayRows = shiftsByDay.map(({ dk, shifts }) => {
    const lines = shifts.map((sh, i) => {
      const hrs = calcHours(sh, state.inclBreaks);
      const rate = resolveShiftRate(sh, employee.id);
      const scheduledPay = hrs * rate;
      const att = state.attendance[attKey(employee.id, dk, i)];
      const payHrs = payableHoursForAttendance(sh, att, state.inclBreaks);
      const payable = payHrs * rate;
      totalHours += hrs;
      totalScheduled += scheduledPay;
      totalPayable += payable;
      const status = normalizeAttStatus(att?.status ?? null);
      return {
        i,
        sh,
        hrs,
        rate,
        scheduledPay,
        payable,
        status,
        source: rateSourceLabel(sh, employee, rate),
      };
    });
    return { dk, lines };
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words">Rate preview · {employee.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground break-words">
            {rotaName || state.rotaName || 'Rota'}
            {employee.hourlyRate != null && employee.hourlyRate > 0
              ? ` · Staff rate ${formatMoney(employee.hourlyRate)}/hr`
              : ''}
            {state.inclBreaks ? ' · Hours include breaks' : ' · Hours exclude breaks'}
          </p>
          {dayRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No shifts scheduled for this employee.</p>
          ) : (
            <div className="space-y-3">
              {dayRows.map(({ dk, lines }) => (
                <div key={dk} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-sm font-semibold">{fmtShortDate(dk)}</p>
                  {lines.map(({ i, sh, hrs, rate, scheduledPay, payable, status, source }) => {
                    const siteName = shiftSiteLine(sh);
                    return (
                      <div key={i} className="flex items-start gap-2 text-sm min-w-0">
                        <span
                          className="mt-1 size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: sh.color || '#94a3b8' }}
                        />
                        <div className="min-w-0 flex-1 space-y-0.5">
                          <p className="font-medium break-words">
                            {sh.start} – {sh.end}
                            {siteName ? ` · ${siteName}` : ''}
                          </p>
                          <p className="text-xs text-muted-foreground break-words tabular-nums">
                            {formatHoursDecimal(hrs)}
                            {' · '}
                            {rate > 0 ? `${formatMoney(rate)}/hr` : '£0.00/hr'}
                            {' · '}
                            {formatMoney(scheduledPay)}
                          </p>
                          <p className="text-[11px] text-muted-foreground break-words">
                            {source}
                            {status ? ` · Attendance: ${attStatusLabel(status)}` : ' · No attendance'}
                            {status === 'on_time' || status === 'late'
                              ? ` · Payable ${formatMoney(payable)}`
                              : ' · Payable £0.00'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="space-y-1 text-sm font-semibold text-right tabular-nums pt-1 border-t">
                <p>Hours: {formatHoursDecimal(totalHours)}</p>
                <p>Scheduled: {formatMoney(totalScheduled)}</p>
                <p>Payable: {formatMoney(totalPayable)}</p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
