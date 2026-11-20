'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  buildSiteIndex,
  calcHours,
  formatHoursDecimal,
  formatSiteAddress,
  normalizeSiteKey,
  parseDateKey,
  shiftSiteLine,
  shiftsInTimeOrder,
} from '@/lib/rota-shifts-utils';
import { SHIFT_TYPE_OPTS, classifyShiftType, normalizeShiftType } from '@/lib/rota-shifts-types';
import type { EmployeeRec, RotaJsState, ShiftRec, ShiftType } from '@/lib/rota-shifts-types';
import { useSites } from '@/hooks/use-sites';
import { openWhatsApp } from '@/lib/whatsapp';
import {
  canShareImageNatively,
  copyImageToClipboard,
  downloadBlob,
  renderShiftPreviewPng,
  type ShiftImageData,
} from '@/lib/shift-preview-image';
import { format } from 'date-fns';
import { Building2, CalendarDays, Clock, Download, MapPin, MessageCircle, Moon, Sun, Sunrise, Sunset, User } from 'lucide-react';
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
  return classifyShiftType(sh.start, sh.end) || 'evening';
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

/** Short text sent alongside the shift preview image. */
function buildShiftCaption(employee: EmployeeRec, rotaName: string, weekLabel: string): string {
  const first = employee.name.split(' ')[0] || employee.name;
  return `Hi ${first}, here are your shifts for ${rotaName || 'the rota'}${weekLabel && weekLabel !== '—' ? ` (${weekLabel})` : ''}.`;
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

  const totalHours = rows.reduce((sum, r) => sum + calcHours(r.shift), 0);
  const siteCount = new Set(rows.map((r) => normalizeSiteKey(shiftSiteLine(r.shift))).filter(Boolean)).size;
  const weekLabel =
    state.days.length > 0
      ? `${fmtLongDate(state.days[0])} – ${fmtLongDate(state.days[state.days.length - 1])}`
      : '—';
  const resolvedRotaName = rotaName || state.rotaName || 'Rota';

  // The same content as the dialog, laid out for the image sent on WhatsApp.
  const imageData = useMemo<ShiftImageData | null>(() => {
    if (!employee) return null;
    return {
      employeeName: employee.name,
      rotaName: resolvedRotaName,
      totalHours: formatHoursDecimal(totalHours),
      totalShifts: rows.length,
      totalSites: siteCount,
      week: weekLabel,
      rows: rows.map(({ dk, shift }) => {
        const { weekday, day, month } = dateParts(dk);
        const site = shiftSiteLine(shift);
        return {
          weekday,
          day,
          month,
          time: `${shift.start} – ${shift.end}`,
          hours: formatHoursDecimal(calcHours(shift)),
          dotColor: shift.color,
          period: periodOf(shift),
          site,
          note: (shift.notes || shift.label || '').trim() || undefined,
          address: formatSiteAddress(siteByName.get(normalizeSiteKey(site))) || undefined,
        };
      }),
    };
  }, [employee, resolvedRotaName, totalHours, rows, siteCount, weekLabel, siteByName]);

  // Built ahead of the click: copying to the clipboard must happen while the click still
  // counts as a user action, which an image rendered after it could outlast.
  const [image, setImage] = useState<Blob | null>(null);
  const [sending, setSending] = useState(false);
  useEffect(() => {
    if (!open || !imageData) {
      setImage(null);
      return;
    }
    let cancelled = false;
    renderShiftPreviewPng(imageData)
      .then((b) => {
        if (!cancelled) setImage(b);
      })
      .catch(() => {
        if (!cancelled) setImage(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, imageData]);

  if (!employee) return null;

  const fileName = `shifts-${employee.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'staff'}.png`;

  const getImage = async () => image ?? (imageData ? await renderShiftPreviewPng(imageData) : null);

  const downloadImage = async () => {
    const blob = await getImage().catch(() => null);
    if (!blob) {
      toast.error('Could not create the shift preview image');
      return;
    }
    downloadBlob(blob, fileName);
  };

  const sendWhatsApp = async () => {
    const phone = employee.phone || '';
    if (!phone) {
      toast.error('No phone number on file for this employee');
      return;
    }
    setSending(true);
    try {
      const blob = await getImage().catch(() => null);
      if (!blob) {
        toast.error('Could not create the shift preview image');
        return;
      }
      const caption = buildShiftCaption(employee, resolvedRotaName, weekLabel);
      const file = new File([blob], fileName, { type: 'image/png' });

      // Phones and tablets: the share sheet sends the image itself to WhatsApp.
      if (canShareImageNatively(file)) {
        try {
          await navigator.share({ files: [file], text: caption });
        } catch (e) {
          if ((e as Error)?.name !== 'AbortError') toast.error('Could not share the shift preview');
        }
        return;
      }

      // Desktop: WhatsApp chat links carry text only, so the image goes on the clipboard
      // and the chat opens with this employee ready for it to be pasted.
      const copied = await copyImageToClipboard(blob);
      if (!copied) downloadBlob(blob, fileName);
      if (!openWhatsApp(phone, caption)) {
        toast.error('Could not open WhatsApp');
        return;
      }
      if (copied) {
        toast.success('Shift preview copied. Paste it into the WhatsApp chat (Ctrl+V / ⌘V) and send.');
      } else {
        toast.success('Shift preview downloaded. Attach it in the WhatsApp chat and send.');
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rota-density sm:max-w-4xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
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
          <Button variant="outline" onClick={() => void downloadImage()}>
            <Download className="size-4 mr-2" />
            Download image
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700"
            onClick={() => void sendWhatsApp()}
            disabled={!employee.phone || sending}
          >
            <MessageCircle className="size-4 mr-2" />
            {sending ? 'Preparing…' : 'Send via WhatsApp'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
