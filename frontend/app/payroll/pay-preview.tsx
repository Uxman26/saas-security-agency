'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, Clock } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/rota-shifts-utils';
import type { PayrollPreview, PayrollPreviewShift } from '@/lib/types';

export const ATT_LABELS: Record<string, string> = {
  on_time: 'On time',
  late: 'Late',
  absent: 'Absent',
  no_show: 'No show',
  cancelled: 'Cancelled - Not Paid',
  cancelled_paid: 'Cancelled - Paid',
  pending: 'Due today',
  scheduled: 'Upcoming',
};

/** Not due yet: a future shift, or one today nobody has marked. Never "missed". */
const UPCOMING = new Set(['scheduled', 'pending']);
export const isUpcoming = (s: PayrollPreviewShift) => !s.payable && UPCOMING.has(s.attendance_status);

function rotaFixHref(sh: PayrollPreviewShift, fix: 'rate' | 'attendance') {
  if (!sh.rota_plan_id) return '/rota';
  const q = new URLSearchParams({
    id: String(sh.rota_plan_id),
    emp: String(sh.guard_id),
    date: sh.date,
    start: sh.shift_start ?? '',
    fix,
  });
  return `/rota/calendar?${q}`;
}

function ProblemShifts({
  shifts,
  fix,
  showEmployee,
}: {
  shifts: PayrollPreviewShift[];
  fix: 'rate' | 'attendance';
  showEmployee: boolean;
}) {
  if (!shifts.length) return null;
  return (
    <details open={shifts.length <= 10} className="mt-2 pl-6">
      <summary className="cursor-pointer text-xs font-medium">
        {shifts.length} shift{shifts.length === 1 ? '' : 's'}
      </summary>
      <div className="mt-2 max-h-72 overflow-y-auto rounded-md border bg-background text-foreground">
        <Table>
          <TableBody>
            {shifts.map((sh) => (
              <TableRow key={sh.assignment_id}>
                <TableCell className="whitespace-nowrap py-1.5">{sh.date}</TableCell>
                {showEmployee && <TableCell className="py-1.5">{sh.guard_name}</TableCell>}
                <TableCell className="py-1.5">{sh.site_name || '—'}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums py-1.5">
                  {sh.shift_start}&ndash;{sh.shift_end}
                </TableCell>
                <TableCell className="text-right tabular-nums py-1.5">
                  {sh.hours.toFixed(2)}h
                  {sh.attendance_status === 'cancelled_paid' ? (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">agreed</span>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap text-muted-foreground py-1.5">
                  {sh.attendance_marked ? ATT_LABELS[sh.attendance_status] ?? sh.attendance_status : 'Not marked'}
                </TableCell>
                <TableCell className="text-right py-1.5">
                  <Link
                    href={rotaFixHref(sh, fix)}
                    target="_blank"
                    className="whitespace-nowrap font-medium text-primary underline underline-offset-2"
                  >
                    {fix === 'rate' ? 'Set rate' : sh.attendance_marked ? 'Edit attendance' : 'Mark attendance'}
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </details>
  );
}

function Stat({ label, value, caption, accent }: { label: string; value: string; caption: string; accent?: boolean }) {
  return (
    <div className={cn('rounded-md border p-3', accent && 'border-primary/40 bg-primary/5')}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{caption}</p>
    </div>
  );
}

export function HoursCell({ attended, missed, upcoming }: { attended: number; missed: number; upcoming: number }) {
  return (
    <>
      {attended.toFixed(2)}
      {missed > 0 && <span className="text-amber-700 dark:text-amber-400"> ({missed.toFixed(2)} missed)</span>}
      {upcoming > 0 && <span className="text-muted-foreground"> ({upcoming.toFixed(2)} upcoming)</span>}
    </>
  );
}

/**
 * Totals, warnings, per-site split and — for one person — every shift. Used by the
 * all-employees panel and by the breakdown window, so both read the same way.
 * `children` sits between the warnings and the site table (the by-employee list).
 */
export function PayPreviewDetail({
  preview,
  canRota,
  children,
}: {
  preview: PayrollPreview;
  canRota: boolean;
  children?: ReactNode;
}) {
  const single = preview.guard_id !== null;
  // Absent / No show is an answer, not an omission, so only genuinely unmarked past
  // shifts get the "go and mark it" ask. Upcoming shifts are never in this list.
  const unpaidPast = preview.shifts.filter((s) => !s.payable && !isUpcoming(s));
  const needsMarking = unpaidPast.filter((s) => !s.attendance_marked);

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Total hours"
          value={preview.rota_hours.toFixed(2)}
          caption={`${preview.total_shifts} shifts${single ? '' : ` · ${preview.employee_count} people`}`}
        />
        <Stat label="Attended hours" value={preview.attended_hours.toFixed(2)} caption={`${preview.attended_shifts} shifts`} />
        <Stat
          label="Not attended"
          value={preview.unattended_hours.toFixed(2)}
          caption={`Not paid${preview.upcoming_hours > 0 ? ` · ${preview.upcoming_hours.toFixed(2)} upcoming` : ''}`}
        />
        <Stat label="Total pay" value={formatMoney(preview.amount)} caption="Attended hours only" accent />
      </div>

      {preview.unmarked_shifts > 0 && (
        <div className="rounded-md border border-rose-500/50 bg-rose-50/70 dark:bg-rose-950/25 p-3 text-sm text-rose-900 dark:text-rose-200">
          <p className="flex items-start gap-2">
            <Clock className="size-4 shrink-0 mt-0.5" />
            <span>
              <strong>
                {preview.unmarked_shifts} past shift{preview.unmarked_shifts === 1 ? '' : 's'}
                {single ? '' : ` across ${preview.unmarked_employee_count} employee${preview.unmarked_employee_count === 1 ? '' : 's'}`}{' '}
                {preview.unmarked_shifts === 1 ? 'has' : 'have'} no attendance marked
              </strong>{' '}
              ({preview.unmarked_hours.toFixed(2)} hrs). They are not being paid until they are marked On time or Late on the rota.
            </span>
          </p>
          {!single && preview.by_employee.some((e) => e.unmarked_shifts > 0) ? (
            <p className="mt-2 pl-6 text-xs">
              {preview.by_employee
                .filter((e) => e.unmarked_shifts > 0)
                .map((e) => `${e.guard_name} (${e.unmarked_shifts})`)
                .join(' · ')}
            </p>
          ) : null}
        </div>
      )}

      {unpaidPast.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20 p-3 text-sm text-amber-900 dark:text-amber-200">
          <p className="flex items-start gap-2">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <span>
              {preview.unattended_hours.toFixed(2)} hours from past shifts are not paid ({formatMoney(preview.held_back_amount)}).{' '}
              {needsMarking.length > 0
                ? 'If those shifts were worked, mark them On time or Late on the rota and calculate again.'
                : 'Each one is a recorded absence, no show or unpaid cancellation, so nothing is left to mark.'}
            </span>
          </p>
          <ProblemShifts shifts={unpaidPast} fix="attendance" showEmployee={!single} />
        </div>
      )}

      {preview.upcoming_hours > 0 && (
        <p className="flex items-start gap-2 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0 mt-0.5" />
          <span>
            {preview.upcoming_hours.toFixed(2)} hours across {preview.upcoming_shifts} upcoming shift
            {preview.upcoming_shifts === 1 ? '' : 's'} (today or later) are not in the total yet. They are added as soon
            as attendance is marked On time, Late or Cancelled - Paid, including shifts marked ahead of their date.
          </span>
        </p>
      )}

      {preview.shifts_missing_rate > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p>
            {preview.shifts_missing_rate} attended shift{preview.shifts_missing_rate === 1 ? ' has' : 's have'} no rate
            set, so {preview.shifts_missing_rate === 1 ? 'it is' : 'they are'} counting as &pound;0. Set the rate on the rota.
          </p>
          <ProblemShifts
            shifts={preview.shifts.filter((s) => s.payable && !(Number(s.shift_rate) > 0))}
            fix="rate"
            showEmployee={!single}
          />
        </div>
      )}

      {children}

      <div>
        <h4 className="text-sm font-semibold mb-2">By site</h4>
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead className="text-right">Shifts</TableHead>
                <TableHead className="text-right">Total hours</TableHead>
                <TableHead className="text-right">Attended hours</TableHead>
                <TableHead className="text-right">Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.by_site.map((r) => (
                <TableRow key={r.site_id ?? r.site_name}>
                  <TableCell className="font-medium">{r.site_name || '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.shifts}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.rota_hours.toFixed(2)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    <HoursCell attended={r.attended_hours} missed={r.unattended_hours} upcoming={r.upcoming_hours} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{formatMoney(r.amount)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {single && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Every shift</h4>
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Site</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead className="text-right">Hours</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Pay</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="w-20">Rota</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.shifts.map((sh) => (
                  <TableRow
                    key={sh.assignment_id}
                    className={cn(
                      !sh.payable && 'opacity-60',
                      !sh.attendance_marked && 'bg-rose-50/70 dark:bg-rose-950/25 opacity-100'
                    )}
                  >
                    <TableCell className="whitespace-nowrap">{sh.date}</TableCell>
                    <TableCell>{sh.site_name || '—'}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {sh.shift_start}&ndash;{sh.shift_end}
                    </TableCell>
                    <TableCell
                      className="text-right tabular-nums"
                      title={
                        sh.attendance_status === 'cancelled_paid'
                          ? `Agreed on cancellation · ${sh.scheduled_hours.toFixed(2)} rota'd`
                          : undefined
                      }
                    >
                      {sh.hours.toFixed(2)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {sh.attendance_marked ? (
                        <span
                          className={
                            sh.payable
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : isUpcoming(sh)
                                ? 'text-sky-700 dark:text-sky-400'
                                : 'text-muted-foreground'
                          }
                        >
                          {ATT_LABELS[sh.attendance_status] ?? sh.attendance_status}
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 font-medium text-rose-700 dark:text-rose-400"
                          title="Nobody marked this shift, so it is counting as unworked"
                        >
                          <Clock className="size-3" />
                          Not marked
                        </span>
                      )}
                      {sh.late_minutes ? <span className="text-muted-foreground"> +{sh.late_minutes}m</span> : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {sh.shift_rate ? formatMoney(sh.shift_rate) : '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">{formatMoney(sh.amount)}</TableCell>
                    <TableCell className="max-w-[12rem] truncate text-muted-foreground" title={sh.note || undefined}>
                      {sh.note?.trim() || '—'}
                    </TableCell>
                    <TableCell>
                      {canRota ? (
                        <Button asChild size="sm" variant="outline" className="h-7 px-2">
                          <Link href={rotaFixHref(sh, !sh.attendance_marked ? 'attendance' : 'rate')}>Rota</Link>
                        </Button>
                      ) : (
                        '—'
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}

