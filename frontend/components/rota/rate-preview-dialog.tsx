'use client';

import { Clock, MapPin, PoundSterling } from 'lucide-react';
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

/** One labelled figure in a shift's or the summary's stat strip. */
function Metric({
  icon,
  label,
  value,
  accent,
  plain,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  /** Render the figure in the brand colour, as the money-ish figures do. */
  accent?: boolean;
  /** Drop the tile background, for strips that already sit on one. */
  plain?: boolean;
}) {
  return (
    <div className={plain ? 'px-3 py-2 text-center' : 'rounded-lg bg-muted/50 px-3 py-2 text-center'}>
      <p className="flex items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </p>
      <p
        className={
          accent
            ? 'text-base font-bold text-primary tabular-nums break-words'
            : 'text-base font-bold tabular-nums break-words'
        }
      >
        {value}
      </p>
    </div>
  );
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
  const ratesSeen = new Set<number>();

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
      ratesSeen.add(Math.round(rate * 100));
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

  // A single figure only makes sense when every shift resolved to the same rate.
  const summaryRate =
    ratesSeen.size === 1 ? `${formatMoney([...ratesSeen][0] / 100)}/hr` : 'Mixed';

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
            {' · Hours exclude breaks'}
          </p>
          {dayRows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No shifts scheduled for this employee.</p>
          ) : (
            <div className="space-y-3">
              {dayRows.map(({ dk, lines }) => (
                <div key={dk} className="rounded-xl border bg-card p-4 space-y-4">
                  {lines.map(({ i, sh, hrs, rate, scheduledPay, payable, status, source }, idx) => {
                    const siteName = shiftSiteLine(sh);
                    return (
                      <div key={i} className={idx > 0 ? 'space-y-3 border-t pt-4' : 'space-y-3'}>
                        {/* The date repeats per shift so each block reads on its own. */}
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: sh.color || '#94a3b8' }}
                          />
                          <p className="text-sm font-semibold break-words">{fmtShortDate(dk)}</p>
                        </div>
                        <div className="space-y-1.5 text-sm">
                          <p className="flex items-center gap-2 min-w-0 tabular-nums">
                            <Clock className="size-3.5 text-muted-foreground shrink-0" />
                            <span className="break-words">
                              {sh.start} – {sh.end}
                            </span>
                          </p>
                          {siteName ? (
                            <p className="flex items-center gap-2 min-w-0">
                              <MapPin className="size-3.5 text-muted-foreground shrink-0" />
                              <span className="break-words">{siteName}</span>
                            </p>
                          ) : null}
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-t pt-3">
                          <Metric icon={<Clock className="size-3.5" />} label="Hours" value={formatHoursDecimal(hrs)} />
                          <Metric
                            icon={<PoundSterling className="size-3.5" />}
                            label="Rate"
                            value={rate > 0 ? `${formatMoney(rate)}/hr` : '£0.00/hr'}
                            accent
                          />
                          <div className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-center">
                            <p className="text-[10px] font-medium uppercase tracking-wide text-primary/80">
                              Shift amount
                            </p>
                            <p className="text-lg font-bold text-primary tabular-nums break-words">
                              {formatMoney(scheduledPay)}
                            </p>
                          </div>
                        </div>
                        <p className="text-[11px] text-muted-foreground break-words">
                          {source}
                          {status ? ` · Attendance: ${attStatusLabel(status)}` : ' · No attendance'}
                          {status === 'on_time' || status === 'late'
                            ? ` · Payable ${formatMoney(payable)}`
                            : ' · Payable £0.00'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ))}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 rounded-xl border bg-muted/40 p-2">
                <Metric
                  icon={<Clock className="size-3.5" />}
                  label="Total hours"
                  value={formatHoursDecimal(totalHours)}
                  plain
                />
                <Metric
                  icon={<PoundSterling className="size-3.5" />}
                  label="Hourly rate"
                  value={summaryRate}
                  accent
                  plain
                />
                <div className="rounded-lg bg-primary px-3 py-2 text-center text-primary-foreground">
                  <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">Scheduled pay</p>
                  <p className="text-lg font-bold tabular-nums break-words">{formatMoney(totalScheduled)}</p>
                  <div className="my-1 border-t border-primary-foreground/25" />
                  <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">Payable</p>
                  <p className="text-base font-semibold tabular-nums break-words">{formatMoney(totalPayable)}</p>
                </div>
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
