'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  buildSiteIndex,
  calcHours,
  fmtShortDate,
  formatHoursDecimal,
  formatSiteAddress,
  normalizeSiteKey,
  shiftSiteLine,
  shiftsInTimeOrder,
} from '@/lib/rota-shifts-utils';
import type { EmployeeRec, RotaJsState, ShiftRec } from '@/lib/rota-shifts-types';
import type { Site } from '@/lib/types';
import { useSites } from '@/hooks/use-sites';
import { openWhatsApp } from '@/lib/whatsapp';
import { Clock, MapPin, MessageCircle } from 'lucide-react';
import { toast } from '@/lib/toast';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeRec | null;
  state: RotaJsState;
  rotaName?: string;
};

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
      const hrs = calcHours(sh, state.inclBreaks);
      total += hrs;
      const site = shiftSiteLine(sh);
      const address = formatSiteAddress(siteByName.get(normalizeSiteKey(site)));
      let line = `• ${fmtShortDate(dk)}: ${sh.start}–${sh.end}${site ? ` @ ${site}` : ''} (${formatHoursDecimal(hrs)})`;
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

export function ShiftPreviewDialog({ open, onOpenChange, employee, state, rotaName }: Props) {
  const { data: sites = [] } = useSites();
  const siteByName = useMemo(() => buildSiteIndex(sites), [sites]);

  if (!employee) return null;

  const shiftsByDay = state.days
    .map((dk) => ({
      dk,
      // Multiple shifts in one day read in chronological order.
      shifts: shiftsInTimeOrder((state.shifts[employee.id]?.[dk] || []) as ShiftRec[]).map((r) => r.shift),
    }))
    .filter((row) => row.shifts.length > 0);

  const totalHours = shiftsByDay.reduce(
    (sum, { shifts }) => sum + shifts.reduce((s, sh) => s + calcHours(sh, state.inclBreaks), 0),
    0
  );
  const shiftCount = shiftsByDay.reduce((n, { shifts }) => n + shifts.length, 0);

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
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-words">{employee.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground break-words">
            {rotaName || state.rotaName || 'Rota'} · {shiftsByDay.length} day(s) with shifts · {shiftCount}{' '}
            shift{shiftCount === 1 ? '' : 's'}
          </p>
          {shiftsByDay.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No shifts scheduled for this employee.</p>
          ) : (
            <div className="space-y-3">
              {shiftsByDay.map(({ dk, shifts }) => {
                const dayHours = shifts.reduce((s, sh) => s + calcHours(sh, state.inclBreaks), 0);
                return (
                  <div key={dk} className="rounded-lg border overflow-hidden">
                    <div className="flex items-baseline justify-between gap-2 bg-muted/60 px-3 py-2 border-b">
                      <p className="text-sm font-semibold break-words">{fmtShortDate(dk)}</p>
                      <p className="text-xs text-muted-foreground tabular-nums shrink-0">
                        {formatHoursDecimal(dayHours)}
                      </p>
                    </div>
                    <div className="divide-y">
                      {shifts.map((sh, i) => {
                        const siteName = shiftSiteLine(sh);
                        const address = formatSiteAddress(siteByName.get(normalizeSiteKey(siteName)));
                        return (
                          <div key={i} className="flex items-start gap-2.5 p-3 min-w-0">
                            <span
                              className="mt-1.5 size-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: sh.color || '#94a3b8' }}
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-baseline flex-wrap gap-x-2 gap-y-0.5 min-w-0">
                                <span className="text-sm font-semibold tabular-nums">
                                  {sh.start} – {sh.end}
                                </span>
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                                  <Clock className="size-3 shrink-0" aria-hidden />
                                  {formatHoursDecimal(calcHours(sh, state.inclBreaks))}
                                </span>
                              </div>
                              {siteName ? (
                                <p className="text-sm break-words leading-snug">{siteName}</p>
                              ) : null}
                              {address ? (
                                <p
                                  className="flex items-start gap-1 text-xs text-muted-foreground break-words leading-snug"
                                  title={address}
                                >
                                  <MapPin className="size-3 shrink-0 mt-0.5" aria-hidden />
                                  <span className="break-words min-w-0">{address}</span>
                                </p>
                              ) : null}
                              {sh.notes ? (
                                <p className="text-xs text-muted-foreground break-words leading-snug italic">
                                  {sh.notes}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div className="flex items-baseline justify-between gap-2 rounded-lg border bg-muted/60 px-3 py-2">
                <span className="text-sm font-semibold">Total</span>
                <span className="text-sm font-semibold tabular-nums">{formatHoursDecimal(totalHours)}</span>
              </div>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={sendWhatsApp} disabled={!employee.phone}>
            <MessageCircle className="size-4 mr-2" />
            Send via WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
