'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  buildSiteIndex,
  calcHours,
  formatHoursDecimal,
  formatSiteAddress,
  isOvernightShift,
  normalizeSiteKey,
  parseDateKey,
  shiftSiteLine,
  shiftsInTimeOrder,
} from '@/lib/rota-shifts-utils';
import { SHIFT_TYPE_OPTS, normalizeShiftType } from '@/lib/rota-shifts-types';
import type { EmployeeRec, RotaJsState, ShiftRec, ShiftType } from '@/lib/rota-shifts-types';
import type { Site } from '@/lib/types';
import { useSites } from '@/hooks/use-sites';
import { openWhatsApp } from '@/lib/whatsapp';
import { format } from 'date-fns';
import { Building2, CalendarDays, Clock, MapPin, MessageCircle, Moon, Sun, Sunrise, Sunset, User } from 'lucide-react';
import { toast } from '@/lib/toast';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeRec | null;
  state: RotaJsState;
  rotaName?: string;
};

/**
 * The period a shift belongs to.
 *
 * The shift's own type wins when one was set. Otherwise it is read from the clock: a
 * shift running past midnight is a night whatever time it started, which is why
 * 16:30–00:15 reads as NIGHT rather than AFTERNOON.
 */
function periodOf(sh: ShiftRec): ShiftType {
  const explicit = normalizeShiftType(sh.shiftType);
  if (explicit) return explicit;
  if (isOvernightShift(sh)) return 'night';
  const hour = parseInt((sh.start || '00:00').split(':')[0], 10) || 0;
  if (hour < 11) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

const PERIOD_ICON = {
  morning: Sunrise,
  afternoon: Sun,
  evening: Sunset,
  night: Moon,
} as const;

function ShiftTypeCell({ shift }: { shift: ShiftRec }) {
  const period = periodOf(shift);
  const opt = SHIFT_TYPE_OPTS.find((o) => o.value === period);
  const Icon = PERIOD_ICON[period];
  if (!opt) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded px-2 py-1.5 text-[10px] font-bold uppercase leading-tight tracking-wide"
      style={{ backgroundColor: opt.bg, color: opt.text }}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="whitespace-nowrap">{opt.label} shift</span>
    </span>
  );
}

function SummaryTile({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2 min-w-0">
      <Icon className="size-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-bold tabular-nums break-words">{value}</p>
      </div>
    </div>
  );
}

function buildShiftMessage(
  employee: EmployeeRec,
  state: RotaJsState,
  rotaName: string,
  siteByName: Map<string, Site>
): string {
  const lines: string[] = [`Hi ${employee.name.split(' ')[0]},`, '', `Your shifts for ${rotaName || 'the rota'}:`];
  let total = 0;
  for (const dk of state.days) {
    const shifts = shiftsInTimeOrder(state.shifts[employee.id]?.[dk] || []).map((r) => r.shift);
    for (const sh of shifts) {
      const hrs = calcHours(sh);
      total += hrs;
      const site = shiftSiteLine(sh);
      const address = formatSiteAddress(siteByName.get(normalizeSiteKey(site)));
      let line = `• ${fmtLongDate(dk)}: ${sh.start}–${sh.end}${site ? ` @ ${site}` : ''} (${formatHoursDecimal(hrs)})`;
      if (address) line += `\n  ${address}`;
      lines.push(line);
    }
  }
  if (total > 0) {
    lines.push('', `Total: ${formatHoursDecimal(total)}`);
  } else {
    lines.push('', 'No shifts scheduled yet.');
  }
  return lines.join('\n');
}

function fmtLongDate(dk: string) {
  try {
    return format(parseDateKey(dk), 'EEE d MMM');
  } catch {
    return dk;
  }
}

/** Weekday / day number / month, as the date column stacks them. */
function dateParts(dk: string) {
  try {
    const d = parseDateKey(dk);
    return { weekday: format(d, 'EEE'), day: format(d, 'd'), month: format(d, 'MMM') };
  } catch {
    return { weekday: '', day: dk, month: '' };
  }
}

export function ShiftPreviewDialog({ open, onOpenChange, employee, state, rotaName }: Props) {
  const { data: sites = [] } = useSites();
  const siteByName = useMemo(() => buildSiteIndex(sites), [sites]);

  const rows = useMemo(() => {
    if (!employee) return [];
    return state.days.flatMap((dk) =>
      shiftsInTimeOrder((state.shifts[employee.id]?.[dk] || []) as ShiftRec[]).map(({ shift }) => ({
        dk,
        shift,
      }))
    );
  }, [employee, state.days, state.shifts]);

  if (!employee) return null;

  const totalHours = rows.reduce((sum, r) => sum + calcHours(r.shift), 0);
  const siteCount = new Set(rows.map((r) => normalizeSiteKey(shiftSiteLine(r.shift))).filter(Boolean)).size;
  const weekLabel =
    state.days.length > 0
      ? `${fmtLongDate(state.days[0])} – ${fmtLongDate(state.days[state.days.length - 1])}`
      : '—';

  const sendWhatsApp = () => {
    const phone = employee.phone || '';
    if (!phone) {
      toast.error('No phone number on file for this employee');
      return;
    }
    const msg = buildShiftMessage(employee, state, rotaName || state.rotaName || 'Rota', siteByName);
    if (!openWhatsApp(phone, msg)) {
      toast.error('Could not open WhatsApp');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="shrink-0 flex-row items-center gap-3 space-y-0 border-b px-5 py-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <User className="size-6" aria-hidden />
          </span>
          <DialogTitle className="min-w-0 break-words text-xl font-bold uppercase tracking-wide">
            {employee.name}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <div className="grid grid-cols-2 divide-x divide-y rounded-lg border sm:grid-cols-4 sm:divide-y-0">
            <SummaryTile icon={Clock} label="Total hours" value={formatHoursDecimal(totalHours)} />
            <SummaryTile icon={CalendarDays} label="Total shifts" value={String(rows.length)} />
            <SummaryTile icon={MapPin} label="Total sites" value={String(siteCount)} />
            <SummaryTile icon={CalendarDays} label="Week" value={weekLabel} />
          </div>

          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No shifts scheduled for this employee.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="bg-header-dark text-header-dark-foreground">
                    {['Date', 'Shift time', 'Shift type', 'Site', 'Site address', 'Hours'].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ dk, shift }, i) => {
                    const { weekday, day, month } = dateParts(dk);
                    const siteName = shiftSiteLine(shift);
                    const address = formatSiteAddress(siteByName.get(normalizeSiteKey(siteName)));
                    const note = (shift.notes || shift.label || '').trim();
                    const hrs = calcHours(shift);
                    return (
                      <tr key={`${dk}-${i}`} className="border-t align-top even:bg-muted/40">
                        <td className="px-3 py-3 text-center whitespace-nowrap">
                          <div className="text-[10px] font-semibold uppercase text-muted-foreground">{weekday}</div>
                          <div className="text-xl font-bold leading-tight tabular-nums">{day}</div>
                          <div className="text-[10px] font-semibold uppercase text-muted-foreground">{month}</div>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2 font-semibold tabular-nums">
                            <span
                              className="size-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: shift.color || 'var(--shift-night)' }}
                              aria-hidden
                            />
                            {shift.start} – {shift.end}
                          </div>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
                            <Clock className="size-3 shrink-0" aria-hidden />
                            {formatHoursDecimal(hrs)}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <ShiftTypeCell shift={shift} />
                        </td>
                        <td className="px-3 py-3 min-w-[150px]">
                          <div className="flex items-start gap-1.5">
                            <Building2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                            <div className="min-w-0">
                              <p className="font-semibold break-words leading-snug">{siteName}</p>
                              {note ? (
                                <p className="text-xs italic text-muted-foreground break-words leading-snug">{note}</p>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 min-w-[170px]">
                          {address ? (
                            <div className="flex items-start gap-1.5 text-xs leading-snug">
                              <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                              <span className="break-words">{address}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right font-bold tabular-nums whitespace-nowrap">
                          {formatHoursDecimal(hrs)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 ? (
            <div className="grid grid-cols-2 divide-x rounded-lg border bg-muted/50">
              <SummaryTile icon={Clock} label="Total hours" value={formatHoursDecimal(totalHours)} />
              <SummaryTile icon={CalendarDays} label="Total shifts" value={String(rows.length)} />
            </div>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t px-5 py-3 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={sendWhatsApp} disabled={!employee.phone}>
            <MessageCircle className="size-4 mr-2" />
            Send via WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
