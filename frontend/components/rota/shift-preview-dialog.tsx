'use client';

import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  calcHours,
  fmtShortDate,
  formatHoursDecimal,
  formatSiteAddress,
  shiftSiteLine,
} from '@/lib/rota-shifts-utils';
import type { EmployeeRec, RotaJsState, ShiftRec } from '@/lib/rota-shifts-types';
import type { Site } from '@/lib/types';
import { useSites } from '@/hooks/use-sites';
import { openWhatsApp } from '@/lib/whatsapp';
import { MessageCircle } from 'lucide-react';
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
    const shifts = state.shifts[employee.id]?.[dk] || [];
    for (const sh of shifts) {
      const hrs = calcHours(sh, state.inclBreaks);
      total += hrs;
      const site = shiftSiteLine(sh);
      const address = formatSiteAddress(siteByName.get(site));
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
  const siteByName = useMemo(() => new Map(sites.map((s) => [s.name, s])), [sites]);

  if (!employee) return null;

  const shiftsByDay = state.days
    .map((dk) => ({ dk, shifts: (state.shifts[employee.id]?.[dk] || []) as ShiftRec[] }))
    .filter((row) => row.shifts.length > 0);

  const totalHours = shiftsByDay.reduce(
    (sum, { shifts }) => sum + shifts.reduce((s, sh) => s + calcHours(sh, state.inclBreaks), 0),
    0
  );

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
            {rotaName || state.rotaName || 'Rota'} · {shiftsByDay.length} day(s) with shifts
          </p>
          {shiftsByDay.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No shifts scheduled for this employee.</p>
          ) : (
            <div className="space-y-3">
              {shiftsByDay.map(({ dk, shifts }) => (
                <div key={dk} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <p className="text-sm font-semibold">{fmtShortDate(dk)}</p>
                  {shifts.map((sh, i) => {
                    const siteName = shiftSiteLine(sh);
                    const address = formatSiteAddress(siteByName.get(siteName));
                    return (
                      <div key={i} className="flex items-start gap-2 text-sm min-w-0">
                        <span
                          className="mt-1 size-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: sh.color || '#94a3b8' }}
                        />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium break-words">
                            {sh.start} – {sh.end}
                            {siteName ? ` · ${siteName}` : ''}
                          </p>
                          {address ? (
                            <p className="text-xs text-muted-foreground break-words whitespace-normal" title={address}>
                              {address}
                            </p>
                          ) : null}
                          <p className="text-xs text-muted-foreground break-words">
                            {formatHoursDecimal(calcHours(sh, state.inclBreaks))}
                            {sh.notes ? ` · ${sh.notes}` : ''}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
              <p className="text-sm font-semibold text-right tabular-nums">
                Total: {formatHoursDecimal(totalHours)}
              </p>
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
