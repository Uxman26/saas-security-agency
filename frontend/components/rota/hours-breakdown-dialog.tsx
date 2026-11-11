'use client';

/**
 * Shift-by-shift working behind a staff member's Total hours, Payable and Chargeable
 * figures on the rota. Every number here comes from the same functions the columns use,
 * and the totals are checked against the column values, so what you read is exactly how
 * the system arrived at them.
 */

import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRotaShifts, type RateExplanation } from '@/contexts/rota-shifts-context';
import {
  agreedEarlyFinishHours,
  attKey,
  attStatusLabel,
  calcHours,
  chargeableHoursForRota,
  countedHoursForAttendance,
  fmtShortDate,
  formatHoursDecimal,
  formatMoney,
  isAttendanceMarked,
  normalizeAttStatus,
  payableHoursForAttendance,
  shiftPayAmount,
  shiftSiteLine,
} from '@/lib/rota-shifts-utils';
import { cn } from '@/lib/utils';

export type BreakdownFocus = 'hours' | 'pay' | 'charge';

type Props = {
  empId: string | null;
  /** Column to highlight; null highlights none. */
  focus: BreakdownFocus | null;
  onClose: () => void;
  /** Without the Payable permission only the hours are shown. */
  showMoney: boolean;
};

const PAY_SOURCE: Record<RateExplanation['source'], string> = {
  shift: 'shift rate',
  staff: 'staff profile rate',
  site: 'site staff rate',
  site_bill: 'site client rate',
  pay_fallback: 'pay rate (site has no client rate)',
  none: 'no rate set',
};

function hrs(n: number): string {
  return `${(Math.round(n * 100) / 100).toString()}h`;
}

/** Why a shift's hours count (or do not) towards totals. */
function hoursReason(status: string | null, marked: boolean, early: boolean): string {
  if (status === 'absent' || status === 'no_show' || status === 'cancelled') return `${attStatusLabel(status)} — counts 0`;
  if (status === 'cancelled_paid') return 'Paid cancellation — agreed paid hours';
  if (early) return 'Early finish — agreed payable hours';
  if (!marked) return 'Not marked — counted as scheduled';
  return 'Scheduled hours';
}

function payReason(status: string | null, marked: boolean, early: boolean): string {
  if (status === 'cancelled_paid') return 'Paid cancellation — agreed paid hours';
  if (early) return 'Early finish — agreed payable hours';
  if (status === 'on_time' || status === 'late') return 'Worked';
  if (!marked) return 'Not marked — not paid until attendance is marked';
  return `${attStatusLabel(status)} — not paid`;
}

function chargeReason(status: string | null, marked: boolean, early: boolean): string {
  if (status === 'cancelled') return 'Cancelled (unpaid) — not charged';
  if (status === 'cancelled_paid') return 'Paid cancellation — agreed client hours';
  if (early) return 'Early finish — agreed chargeable hours';
  if (!marked) return 'Not marked — not charged until attendance is marked';
  return 'Charged scheduled hours';
}

export function HoursBreakdownDialog({ empId, focus, onClose, showMoney }: Props) {
  const {
    state,
    hoursInclBreaks,
    explainShiftRate,
    explainChargeRate,
    resolveShiftPayType,
    empTotalHours,
    empTotalPayable,
    empTotalChargeable,
  } = useRotaShifts();

  const emp = empId ? state.employees.find((e) => e.id === empId) : null;

  const rows = !empId
    ? []
    : state.days.flatMap((dk) =>
        (state.shifts[empId]?.[dk] || []).map((sh, idx) => {
          const att = state.attendance[attKey(empId, dk, idx)];
          const status = normalizeAttStatus(att?.status ?? null) ?? ((att?.status || '').trim() || null);
          const marked = isAttendanceMarked(att?.status);
          const early = agreedEarlyFinishHours(sh, att);
          const spanH = calcHours(sh, true);
          const breakMin = (sh.breakH || 0) * 60 + (sh.breakM || 0);
          const counted = countedHoursForAttendance(sh, att, hoursInclBreaks);
          const payHrs = payableHoursForAttendance(sh, att, state.inclBreaks);
          const payRate = explainShiftRate(sh, empId);
          const payType = resolveShiftPayType(sh, empId);
          const payAmt = payHrs > 0 ? shiftPayAmount(payHrs, payRate.rate, payType) : 0;
          const chgHrs = chargeableHoursForRota(sh, att);
          const chgRate = explainChargeRate(sh, empId);
          const chgAmt = chgHrs > 0 ? chgHrs * chgRate.rate : 0;
          return {
            key: `${dk}:${idx}`,
            dk,
            sh,
            status,
            marked,
            spanH,
            breakMin,
            counted,
            hoursWhy: hoursReason(status, marked, early.payable != null),
            payHrs,
            payRate,
            payType,
            payAmt,
            payWhy: payReason(status, marked, early.payable != null),
            chgHrs,
            chgRate,
            chgAmt,
            chgWhy: chargeReason(status, marked, early.chargeable != null),
          };
        })
      );

  const sum = (f: (r: (typeof rows)[number]) => number) => rows.reduce((t, r) => t + f(r), 0);
  const totHours = sum((r) => r.counted);
  const totPay = sum((r) => r.payAmt);
  const totPayHrs = sum((r) => r.payHrs);
  const totChg = sum((r) => r.chgAmt);
  const totChgHrs = sum((r) => r.chgHrs);

  const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
  const matches =
    !empId ||
    (near(totHours, empTotalHours(empId)) &&
      (!showMoney || (near(totPay, empTotalPayable(empId)) && near(totChg, empTotalChargeable(empId)))));
  const unratedPay = rows.filter((r) => r.payHrs > 0 && r.payRate.rate <= 0);
  const unratedChg = rows.filter((r) => r.chgHrs > 0 && r.chgRate.rate <= 0);
  const unmarked = rows.filter((r) => !r.marked);

  const colCls = (c: BreakdownFocus) => cn('align-top px-2 py-2', focus === c && 'bg-primary/5');
  const headCls = (c: BreakdownFocus) =>
    cn('px-2 py-2 text-left font-semibold', focus === c && 'bg-primary/10 text-primary');

  return (
    <Dialog open={!!empId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-5xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words">Breakdown · {emp?.name ?? ''}</DialogTitle>
          <DialogDescription>
            How Total hours{showMoney ? ', Payable and Chargeable were' : ' was'} calculated, shift by shift.
            Hours {hoursInclBreaks ? 'include' : 'exclude'} breaks in Total hours; pay{' '}
            {state.inclBreaks ? 'includes' : 'deducts'} breaks.
          </DialogDescription>
        </DialogHeader>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No shifts on this rota for this person.</p>
        ) : (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-2 text-left font-semibold">Shift</th>
                    <th className="px-2 py-2 text-left font-semibold">Attendance</th>
                    <th className={headCls('hours')}>Total hours</th>
                    {showMoney ? <th className={headCls('pay')}>Payable</th> : null}
                    {showMoney ? <th className={headCls('charge')}>Chargeable</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.key} className="border-t">
                      <td className="align-top px-2 py-2">
                        <div className="font-medium whitespace-nowrap">{fmtShortDate(r.dk)}</div>
                        <div className="tabular-nums">
                          {r.sh.start}–{r.sh.end}
                        </div>
                        <div className="text-muted-foreground break-words">{shiftSiteLine(r.sh)}</div>
                      </td>
                      <td className="align-top px-2 py-2">
                        {r.marked ? (
                          <span className="font-medium">{attStatusLabel(r.status)}</span>
                        ) : (
                          <span className="font-medium text-red-600">Not marked</span>
                        )}
                      </td>
                      <td className={colCls('hours')}>
                        <div className="font-semibold tabular-nums">{formatHoursDecimal(r.counted)}</div>
                        <div className="text-muted-foreground tabular-nums">
                          Span {hrs(r.spanH)}
                          {r.breakMin > 0 ? (hoursInclBreaks ? ` (break ${r.breakMin}m kept)` : ` − ${r.breakMin}m break`) : ''}
                        </div>
                        <div className="text-muted-foreground">{r.hoursWhy}</div>
                      </td>
                      {showMoney ? (
                        <td className={colCls('pay')}>
                          <div className="font-semibold tabular-nums">{formatMoney(r.payAmt)}</div>
                          {r.payHrs > 0 ? (
                            <div className="tabular-nums">
                              {r.payType === 'per_job'
                                ? `Per job @ ${formatMoney(r.payRate.rate)}`
                                : `${hrs(r.payHrs)} × ${formatMoney(r.payRate.rate)}/hr`}
                            </div>
                          ) : null}
                          {r.payHrs > 0 ? (
                            <div className={cn(r.payRate.rate > 0 ? 'text-muted-foreground' : 'font-semibold text-amber-600')}>
                              Rate: {PAY_SOURCE[r.payRate.source]}
                            </div>
                          ) : null}
                          <div className="text-muted-foreground">{r.payWhy}</div>
                        </td>
                      ) : null}
                      {showMoney ? (
                        <td className={colCls('charge')}>
                          <div className="font-semibold tabular-nums">{formatMoney(r.chgAmt)}</div>
                          {r.chgHrs > 0 ? (
                            <div className="tabular-nums">
                              {hrs(r.chgHrs)} × {formatMoney(r.chgRate.rate)}/hr
                            </div>
                          ) : null}
                          {r.chgHrs > 0 ? (
                            <div className={cn(r.chgRate.rate > 0 ? 'text-muted-foreground' : 'font-semibold text-amber-600')}>
                              Rate: {PAY_SOURCE[r.chgRate.source]}
                            </div>
                          ) : null}
                          <div className="text-muted-foreground">{r.chgWhy}</div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 bg-muted/40 font-semibold">
                  <tr>
                    <td className="px-2 py-2" colSpan={2}>
                      Total ({rows.length} shift{rows.length === 1 ? '' : 's'})
                    </td>
                    <td className={colCls('hours')}>{formatHoursDecimal(totHours)}</td>
                    {showMoney ? (
                      <td className={colCls('pay')}>
                        {formatMoney(totPay)}
                        <div className="font-normal text-muted-foreground">{hrs(totPayHrs)} payable</div>
                      </td>
                    ) : null}
                    {showMoney ? (
                      <td className={colCls('charge')}>
                        {formatMoney(totChg)}
                        <div className="font-normal text-muted-foreground">{hrs(totChgHrs)} chargeable</div>
                      </td>
                    ) : null}
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="space-y-1.5 text-xs">
              {matches ? (
                <p className="flex items-center gap-1.5 text-green-700">
                  <CheckCircle2 className="size-4" /> These totals match the figures shown on the rota.
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-red-600">
                  <AlertTriangle className="size-4" /> These totals do not match the rota columns — please report this.
                </p>
              )}
              {unmarked.length > 0 ? (
                <p className="flex items-start gap-1.5 text-amber-700">
                  <AlertTriangle className="size-4 shrink-0" />
                  {unmarked.length} shift{unmarked.length === 1 ? ' is' : 's are'} not marked
                  {showMoney ? ', so not paid or charged yet' : ''}. Mark attendance to include them.
                </p>
              ) : null}
              {showMoney && unratedPay.length > 0 ? (
                <p className="flex items-start gap-1.5 text-amber-700">
                  <AlertTriangle className="size-4 shrink-0" />
                  {unratedPay.length} payable shift{unratedPay.length === 1 ? ' has' : 's have'} no pay rate, so{' '}
                  {unratedPay.length === 1 ? 'it adds' : 'they add'} £0. Set a rate on the shift, the staff profile or the
                  site&apos;s staff rate.
                </p>
              ) : null}
              {showMoney && unratedChg.length > 0 ? (
                <p className="flex items-start gap-1.5 text-amber-700">
                  <AlertTriangle className="size-4 shrink-0" />
                  {unratedChg.length} chargeable shift{unratedChg.length === 1 ? ' has' : 's have'} no client rate. Set the
                  site&apos;s client rate.
                </p>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
