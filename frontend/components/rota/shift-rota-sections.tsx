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
  const notes = (shift.notes || '').trim();
  const label = (shift.label || '').trim();
  const description = notes || label;
  const showAtt = !!attStatus;
  const showOt = !!overtime && otMins > 0;
  const showEarly = !!early && earlyMins > 0;
  const hasExtras = showAtt || showOt || showEarly;

  const labelCls = compact
    ? 'text-[10px] font-semibold leading-tight normal-case'
    : 'text-xs font-semibold uppercase tracking-wide';
  const bodyCls = compact ? 'text-[12px] leading-tight' : 'text-sm leading-snug';
  const timeCls = compact
    ? 'text-[13px] font-semibold leading-tight tabular-nums'
    : 'text-sm leading-snug font-medium tabular-nums';
  const noteCls = compact
    ? 'text-[9px] text-muted-foreground italic line-clamp-2 break-all'
    : 'text-xs text-muted-foreground italic break-words';

  return (
    <div className={cn('min-w-0', compact ? 'space-y-0.5' : 'space-y-1', className)}>
      <div className={cn(timeCls, 'truncate')}>
        {compact ? `${shift.start}–${shift.end}` : `Time: ${shift.start} – ${shift.end}`}
      </div>
      <div
        className={cn(
          bodyCls,
          'font-bold text-foreground',
          // In a grid cell the site name breaks onto another line after roughly 20 characters
          // instead of being cut off.
          compact ? 'whitespace-normal break-words max-w-[20ch]' : 'truncate'
        )}
        title={site}
      >
        {compact ? site : `Site: ${site}`}
      </div>
      {description ? (
        <div className={cn(noteCls)} title={description}>
          {compact ? description : `Description: ${description}`}
        </div>
      ) : null}

      {hasExtras ? (
        <div className={cn(compact ? 'space-y-0.5 pt-0.5' : 'space-y-1.5 pt-2 border-t mt-2')}>
          {showAtt ? (
            <div className="min-w-0 space-y-0.5">
              <div
                className={cn(labelCls, 'truncate')}
                style={{ color: attStatusBarColor(attStatus) || undefined }}
                title={`Attendance: ${attStatusLabel(attStatus)}`}
              >
                Attendance: {attStatusLabel(attStatus)}
              </div>
              {attNote ? <div className={noteCls}>Note: {attNote}</div> : null}
            </div>
          ) : null}

          {showOt ? (
            <div className="min-w-0 space-y-0.5">
              <div className={cn(labelCls, 'text-sky-700 dark:text-sky-300 truncate')}>
                Overtime: {formatDurationMins(otMins)}
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
              <div className={cn(labelCls, 'text-amber-700 dark:text-amber-300 truncate')}>
                Early finish: {formatDurationMins(earlyMins)}
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
