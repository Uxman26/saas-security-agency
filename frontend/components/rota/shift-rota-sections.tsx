'use client';

import type { AttendanceRec, ShiftRec } from '@/lib/rota-shifts-types';
import {
  attStatusBarColor,
  attStatusLabel,
  formatDurationMins,
  latestShiftAdjustment,
  minutesBetweenTimes,
  normalizeAttStatus,
  shiftSiteLine,
} from '@/lib/rota-shifts-utils';
import { cn } from '@/lib/utils';

type Props = {
  shift: ShiftRec;
  attendance?: AttendanceRec | null;
  /** Compact for grid cells; roomy for Description dialog */
  compact?: boolean;
  className?: string;
};

export function ShiftRotaSections({ shift, attendance, compact, className }: Props) {
  const attStatus = attendance ? normalizeAttStatus(attendance.status) : null;
  const attNote = (attendance?.note || '').trim();
  const overtime = latestShiftAdjustment(shift, 'overtime');
  const early = latestShiftAdjustment(shift, 'early_finish');
  const otMins = overtime ? minutesBetweenTimes(overtime.scheduledEnd, overtime.actualEnd) : 0;
  const earlyMins = early ? minutesBetweenTimes(early.actualEnd, early.scheduledEnd) : 0;
  const site = shiftSiteLine(shift);
  const showAtt = !!attStatus;
  const showOt = !!overtime && otMins > 0;
  const showEarly = !!early && earlyMins > 0;
  const hasExtras = showAtt || showOt || showEarly;

  const labelCls = compact
    ? 'text-[8px] font-semibold uppercase tracking-tight leading-tight'
    : 'text-xs font-semibold uppercase tracking-wide';
  const bodyCls = compact ? 'text-[9px] leading-tight' : 'text-sm leading-snug';
  const noteCls = compact
    ? 'text-[8px] text-muted-foreground italic line-clamp-1 break-all'
    : 'text-xs text-muted-foreground italic break-words';

  return (
    <div className={cn('min-w-0', compact ? 'space-y-0.5' : 'space-y-1', className)}>
      <div className={cn(bodyCls, 'font-medium tabular-nums truncate')}>
        {compact ? `${shift.start}–${shift.end}` : `Time: ${shift.start} – ${shift.end}`}
      </div>
      <div className={cn(bodyCls, 'font-bold text-foreground truncate')} title={site}>
        {compact ? site : `Site: ${site}`}
      </div>

      {hasExtras ? (
        <div className={cn(compact ? 'space-y-0.5 pt-0.5' : 'space-y-1.5 pt-2 border-t mt-2')}>
          {showAtt ? (
            <div className="min-w-0 space-y-0.5">
              <div
                className={cn(labelCls, 'whitespace-nowrap truncate')}
                style={{ color: attStatusBarColor(attStatus) || undefined }}
                title={`Attendance: ${attStatusLabel(attStatus)}`}
              >
                {compact ? attStatusLabel(attStatus) : `Attendance: ${attStatusLabel(attStatus)}`}
              </div>
              {attNote ? <div className={noteCls}>Note: {attNote}</div> : null}
            </div>
          ) : null}

          {showOt ? (
            <div className="min-w-0 space-y-0.5">
              <div className={cn(labelCls, 'text-sky-700 dark:text-sky-300 normal-case truncate')}>
                {compact ? `OT: ${formatDurationMins(otMins)}` : `Overtime: ${formatDurationMins(otMins)}`}
              </div>
              {(overtime?.reason || '').trim() ? (
                <div className={noteCls}>Note: {(overtime?.reason || '').trim()}</div>
              ) : null}
            </div>
          ) : null}

          {showOt && showEarly ? (
            <div className={cn(bodyCls, 'text-muted-foreground text-center')}>or</div>
          ) : null}

          {showEarly ? (
            <div className="min-w-0 space-y-0.5">
              <div className={cn(labelCls, 'text-amber-700 dark:text-amber-300 normal-case truncate')}>
                {compact ? `Early: ${formatDurationMins(earlyMins)}` : `Finish early: ${formatDurationMins(earlyMins)}`}
              </div>
              {(early?.reason || '').trim() ? (
                <div className={noteCls}>Note: {(early?.reason || '').trim()}</div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
