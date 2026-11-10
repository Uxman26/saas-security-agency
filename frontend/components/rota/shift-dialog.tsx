'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { TimeHmField, DurationHmField } from '@/components/ui/time-hm-field';
import type { EmployeeRec, PayType, ShiftRec, ShiftType } from '@/lib/rota-shifts-types';
import {
  PAY_TYPE_OPTS,
  SHIFT_COLOR_OPTS,
  SHIFT_TYPE_OPTS,
  classifyShiftType,
  normalizePayType,
  normalizeShiftType,
} from '@/lib/rota-shifts-types';
import {
  buildSiteIndex,
  calcHours,
  clientChargeableHours,
  findConflictsForDraft,
  formatHoursDecimal,
  formatMoney,
  normalizeSiteKey,
  shiftPayAmount,
} from '@/lib/rota-shifts-utils';
import { useCreateSite, useSites } from '@/hooks/use-sites';
import { useDirectoryContractorsList } from '@/hooks/use-directory-contractors';
import { DEFAULT_SITE_COLOR, SiteColorPicker } from '@/components/site-color-picker';
import { AlertTriangle, Plus } from 'lucide-react';
import { toast } from '@/lib/toast';
import { TEXT_LIMITS, charsRemaining, clampText, tooLongMessage } from '@/lib/text-limits';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: EmployeeRec[];
  defaultDk: string;
  defaultEmpId: string;
  edit?: { empId: string; dk: string; idx: number; shift: ShiftRec } | null;
  /** Current planner shifts — used to detect conflicts while editing. */
  allShifts?: Record<string, Record<string, ShiftRec[] | undefined> | undefined>;
  onApply: (assignees: string[], dk: string, shift: ShiftRec, rates?: Record<string, number>) => void;
};

const empty = (): ShiftRec => ({
  start: '00:00',
  end: '00:00',
  site: '',
  notes: '',
  breakH: 0,
  breakM: 0,
  color: SHIFT_COLOR_OPTS[0],
  label: '',
  shiftType: null,
  shiftRate: null,
  payType: null,
  invoiceWithoutBreak: true,
});

/** The profile rate a staff member has for a job type, or null when none is set. */
function employeeRateFor(emp: EmployeeRec, payType: PayType): number | null {
  const own = emp.payType ?? 'hourly';
  const r = payType === own ? emp.hourlyRate : emp.ratesByType?.[payType];
  return r != null && !Number.isNaN(Number(r)) && Number(r) > 0 ? Number(r) : null;
}

/** Radix Select cannot hold an empty string value, so "no type" gets a sentinel. */
const NO_SHIFT_TYPE = '__none__';

/** Keep HH:MM so <input type="time"> does not clear the value on open. */
function normalizeTimeValue(t: string | undefined | null): string {
  if (!t || !String(t).trim()) return '00:00';
  const parts = String(t).trim().split(':');
  const h = Math.min(23, Math.max(0, parseInt(parts[0] || '0', 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1] || '0', 10) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function normalizeShiftForm(sh: ShiftRec): ShiftRec {
  return {
    ...sh,
    start: normalizeTimeValue(sh.start),
    end: normalizeTimeValue(sh.end),
    breakH: Number.isFinite(Number(sh.breakH)) ? Number(sh.breakH) : 0,
    breakM: Number.isFinite(Number(sh.breakM)) ? Number(sh.breakM) : 0,
    shiftType: normalizeShiftType(sh.shiftType),
    payType: normalizePayType(sh.payType),
    invoiceWithoutBreak: sh.invoiceWithoutBreak !== false,
  };
}

export function ShiftDialog({
  open,
  onOpenChange,
  employees,
  defaultDk,
  defaultEmpId,
  edit,
  allShifts,
  onApply,
}: Props) {
  const { data: sites = [] } = useSites();
  const createSite = useCreateSite();
  const { data: contractors = [] } = useDirectoryContractorsList({ is_active: true });
  const siteByName = useMemo(() => buildSiteIndex(sites), [sites]);
  const siteNames = sites.map((s) => s.name);
  const [dk, setDk] = useState(defaultDk);
  const [shift, setShift] = useState<ShiftRec>(() => empty());
  const siteOptions = useMemo(
    () => (shift.site && !siteNames.includes(shift.site) ? [shift.site, ...siteNames] : siteNames),
    [shift.site, siteNames]
  );
  const [assignees, setAssignees] = useState<string[]>([defaultEmpId]);
  /** Once the rate box is edited we show it verbatim, so it can be cleared back to empty. */
  const [rateTouched, setRateTouched] = useState(false);
  /** Once a job type is picked it sticks; until then it follows the first assignee's profile. */
  const [payTypeTouched, setPayTypeTouched] = useState(false);
  /** Manual shift-type picks stick until times change away from the last auto value. */
  const [shiftTypeTouched, setShiftTypeTouched] = useState(false);
  const lastAutoShiftType = useRef<ShiftType | null>(null);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteContractor, setNewSiteContractor] = useState('');
  const [newSiteColor, setNewSiteColor] = useState<string>(DEFAULT_SITE_COLOR);

  const applySite = (siteName: string) => {
    const rec = siteName ? siteByName.get(normalizeSiteKey(siteName)) : undefined;
    // Deliberately does not touch shiftRate: the rate box only ever shows the staff
    // member's own rate. Payable still falls back to site rates via resolveShiftRate.
    setShift((s) => ({
      ...s,
      site: siteName,
      color: rec?.color || DEFAULT_SITE_COLOR,
    }));
  };

  useEffect(() => {
    if (!open) return;
    setDk(defaultDk);
    setRateTouched(false);
    setPayTypeTouched(false);
    if (edit) {
      const owner = employees.find((e) => e.id === edit.empId);
      const form = normalizeShiftForm({
        ...edit.shift,
        // Shifts saved before job types existed are paid on the profile's terms.
        payType: normalizePayType(edit.shift.payType) ?? owner?.payType ?? 'hourly',
      });
      const auto = classifyShiftType(form.start, form.end);
      lastAutoShiftType.current = auto;
      setShiftTypeTouched(!!form.shiftType && form.shiftType !== auto);
      setShift(form.shiftType ? form : { ...form, shiftType: auto });
      setAssignees([edit.empId]);
    } else {
      lastAutoShiftType.current = null;
      setShiftTypeTouched(false);
      setShift(empty());
      setAssignees(defaultEmpId ? [defaultEmpId] : employees[0] ? [employees[0].id] : []);
    }
    // Intentionally omit `employees` — parent remaps that array every render and would reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDk, defaultEmpId, edit?.empId, edit?.dk, edit?.idx]);

  const applyTimes = (patch: Partial<Pick<ShiftRec, 'start' | 'end'>>) => {
    setShift((s) => {
      const prevAuto = classifyShiftType(s.start, s.end);
      const next = { ...s, ...patch };
      const auto = classifyShiftType(next.start, next.end);
      lastAutoShiftType.current = auto;
      const followAuto = !shiftTypeTouched || s.shiftType == null || s.shiftType === prevAuto;
      return { ...next, shiftType: followAuto ? auto : s.shiftType };
    });
  };

  const toggleAsg = (id: string) => {
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const reset = () => {
    setShiftTypeTouched(false);
    lastAutoShiftType.current = null;
    setShift((s) => ({
      ...s,
      start: '00:00',
      end: '00:00',
      breakH: 0,
      breakM: 0,
      shiftType: null,
      invoiceWithoutBreak: true,
    }));
  };

  const submit = async () => {
    if (assignees.length === 0 || !dk) return;
    const siteName = (shift.site || '').trim();
    if (siteNameTooLong) {
      toast.warning(tooLongMessage('Site name', TEXT_LIMITS.siteName));
      return;
    }
    if (!siteNameValid) {
      toast.warning('Site name is required — select a site or type the site name');
      return;
    }
    if (!rateValid) {
      toast.warning(
        payType === 'per_job'
          ? 'Job rate is required — enter the fixed amount paid for this shift'
          : 'Shift rate is required — enter the hourly rate for this shift'
      );
      return;
    }
    let resolvedName = siteName;
    const known = sites.some((s) => s.name.trim().toLowerCase() === siteName.toLowerCase());
    if (!known) {
      try {
        const created = await createSite.mutateAsync({
          name: siteName,
          color: shift.color || DEFAULT_SITE_COLOR,
          site_type: 1,
        });
        resolvedName = created.name;
      } catch {
        // toast already shown by mutation; still allow saving the shift name —
        // publish will also try to create the site.
      }
    }
    onApply(
      assignees,
      dk,
      // Several staff with no job type picked: each keeps their own profile type and rate.
      normalizeShiftForm({ ...shift, site: resolvedName, shiftRate: rateValue, payType: perStaffRates && !payTypeTouched ? null : payType }),
      // Whatever the rate box shows is what gets saved, profile rate or not.
      perStaffRates
        ? Object.fromEntries(assigneeStaffRates.map((r) => [r.id, r.rate]))
        : rateValue != null && rateValue > 0
          ? Object.fromEntries(assignees.map((id) => [id, rateValue]))
          : undefined
    );
    onOpenChange(false);
  };

  const openAddSite = () => {
    setNewSiteName('');
    setNewSiteContractor(contractors[0]?.id ?? '');
    setNewSiteColor(shift.color || DEFAULT_SITE_COLOR);
    setAddSiteOpen(true);
  };

  const saveNewSite = async () => {
    const name = clampText(newSiteName.trim(), TEXT_LIMITS.siteName);
    if (name.length < 2 || !newSiteContractor) return;
    const site = await createSite.mutateAsync({
      name,
      contractor_id: newSiteContractor,
      color: newSiteColor,
      site_type: 1,
    });
    setShift((s) => ({ ...s, site: site.name, color: site.color || newSiteColor }));
    setAddSiteOpen(false);
  };

  const siteValue = shift.site.trim() || undefined;

  /**
   * Until the rate box is edited, a new shift, or one handed to someone else, takes each
   * assignee's own profile rate. An existing shift kept by the same person shows exactly
   * what was saved, so opening it for edit never silently reprices it.
   */
  const reassigned = !!edit && !(assignees.length === 1 && assignees[0] === edit.empId);
  const firstAssignee = employees.find((e) => e.id === assignees[0]);
  const payType: PayType =
    payTypeTouched || (edit && !reassigned)
      ? (shift.payType ?? firstAssignee?.payType ?? 'hourly')
      : (firstAssignee?.payType ?? 'hourly');

  const assigneeStaffRates = useMemo(() => {
    return assignees
      .map((id) => {
        const emp = employees.find((e) => e.id === id);
        if (!emp) return null;
        // Untouched multi-assign keeps each person's own type, so their own profile rate.
        const rate = employeeRateFor(emp, payTypeTouched || assignees.length === 1 ? payType : emp.payType ?? 'hourly');
        if (rate == null) return null;
        return { id: emp.id, name: emp.name, rate };
      })
      .filter((r): r is { id: string; name: string; rate: number } => !!r);
  }, [assignees, employees, payType, payTypeTouched]);

  const primaryStaffRate = assignees.length === 1 && assigneeStaffRates.length === 1 ? assigneeStaffRates[0] : null;
  const ownRates = !rateTouched && (!edit || reassigned);
  const perStaffRates = ownRates && assignees.length > 1 && assigneeStaffRates.length === assignees.length;
  const rateValue = !ownRates
    ? shift.shiftRate
    : primaryStaffRate
      ? primaryStaffRate.rate
      : assignees.length === 1 && edit
        ? shift.shiftRate
        : null;

  // A site saved before the cap existed can still arrive over-length, so editing
  // an old shift surfaces the error instead of silently sending it back.
  const siteNameTooLong = (shift.site || '').trim().length > TEXT_LIMITS.siteName;
  const siteNameValid = (shift.site || '').trim().length > 0 && !siteNameTooLong;
  const rateValid = (rateValue != null && rateValue > 0) || perStaffRates;
  const canSubmit = assignees.length > 0 && !!dk && siteNameValid && rateValid;

  // Live split between what staff are paid for and what the client is charged for.
  const staffHours = calcHours(shift);
  const clientHours = clientChargeableHours(shift);
  const hasTimes = shift.start !== shift.end;
  const staffPayEstimate = rateValue != null && rateValue > 0 ? shiftPayAmount(staffHours, rateValue, payType) : null;

  const draftConflicts = useMemo(() => {
    if (!open || !allShifts) return [] as ReturnType<typeof findConflictsForDraft>;
    const seen = new Set<string>();
    const hits: ReturnType<typeof findConflictsForDraft> = [];
    for (const empId of assignees) {
      for (const hit of findConflictsForDraft(
        allShifts,
        empId,
        dk,
        shift,
        edit && edit.empId === empId && edit.dk === dk ? edit.idx : null
      )) {
        if (seen.has(hit.label)) continue;
        seen.add(hit.label);
        hits.push(hit);
      }
    }
    return hits;
  }, [open, allShifts, assignees, dk, shift, edit]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rota-density sm:max-w-md max-h-[90vh] overflow-y-auto" showCloseButton>
          <DialogHeader>
            <DialogTitle>{edit ? 'Edit shift' : 'Add shift'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Shift date</Label>
              <Input type="date" value={dk} onChange={(e) => setDk(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Start time</Label>
                <TimeHmField
                  aria-label="Start time"
                  value={shift.start}
                  onChange={(start) => applyTimes({ start })}
                />
              </div>
              <div className="space-y-1">
                <Label>End time</Label>
                <TimeHmField
                  aria-label="End time"
                  value={shift.end}
                  onChange={(end) => applyTimes({ end })}
                />
              </div>
            </div>
            {draftConflicts.length > 0 ? (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                <div className="flex items-start gap-2 font-semibold">
                  <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
                  <span>
                    Shift conflict{draftConflicts.length === 1 ? '' : 's'} ({draftConflicts.length})
                  </span>
                </div>
                <ul className="mt-1.5 space-y-0.5 pl-6">
                  {draftConflicts.map((c) => (
                    <li key={`${c.dk}-${c.idx}-${c.label}`}>{c.label}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="space-y-1">
              <Label>Set break duration</Label>
              <DurationHmField
                aria-label="Break duration"
                hours={shift.breakH || 0}
                minutes={shift.breakM || 0}
                maxHours={8}
                onChange={({ hours, minutes }) => setShift((s) => ({ ...s, breakH: hours, breakM: minutes }))}
              />
              <p className="text-[11px] text-muted-foreground">Unpaid — taken off the staff member&apos;s paid hours.</p>
            </div>
            <div className="space-y-1 rounded-md border px-3 py-2">
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={shift.invoiceWithoutBreak !== false}
                  onChange={(e) => setShift((s) => ({ ...s, invoiceWithoutBreak: e.target.checked }))}
                />
                <span>
                  <span className="font-medium">Invoice without break</span>
                  <span className="block text-[11px] text-muted-foreground">
                    Charge the client for the full shift. Untick to take the break off the invoice too.
                  </span>
                </span>
              </label>
              {hasTimes ? (
                <p className="text-[11px] tabular-nums text-muted-foreground">
                  Staff paid: <span className="font-medium text-foreground">{formatHoursDecimal(staffHours)}</span>
                  {' · '}Client charged: <span className="font-medium text-foreground">{formatHoursDecimal(clientHours)}</span>
                </p>
              ) : null}
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>
                  Site / location <span className="text-destructive">*</span>
                </Label>
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-sky-600" onClick={openAddSite}>
                  <Plus className="size-3.5 mr-1" />
                  Add site
                </Button>
              </div>
              <SearchableSelect
                value={siteValue || ''}
                onChange={(v) => applySite(v)}
                options={siteOptions.map((name) => ({ value: name, label: name }))}
                placeholder="Select Site"
                searchPlaceholder="Search sites…"
                emptyText="No matching sites"
              />
            </div>
            <div className="space-y-1">
              <Label>
                Site name <span className="text-destructive">*</span>
              </Label>
              <Input
                maxLength={TEXT_LIMITS.siteName}
                placeholder="Enter site name"
                required
                value={shift.site}
                onChange={(e) => {
                  const name = clampText(e.target.value, TEXT_LIMITS.siteName);
                  setShift((s) => ({
                    ...s,
                    site: name,
                    ...(name.trim()
                      ? {}
                      : { color: s.color || DEFAULT_SITE_COLOR }),
                  }));
                }}
              />
              <p className={cn('text-[11px]', siteNameTooLong ? 'text-destructive' : 'text-muted-foreground')}>
                {siteNameTooLong
                  ? tooLongMessage('Site name', TEXT_LIMITS.siteName)
                  : `Required — select a site, use Add site, or type a new name (it will be created automatically). ${charsRemaining(
                      shift.site,
                      TEXT_LIMITS.siteName
                    )} of ${TEXT_LIMITS.siteName} characters left.`}
              </p>
            </div>
            <div className="space-y-1">
              <Label>Shift type</Label>
              <Select
                value={shift.shiftType || NO_SHIFT_TYPE}
                onValueChange={(v) => {
                  const next = v === NO_SHIFT_TYPE ? null : (v as ShiftType);
                  setShiftTypeTouched(true);
                  setShift((s) => ({ ...s, shiftType: next }));
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select shift type" />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[250]">
                  <SelectItem value={NO_SHIFT_TYPE}>
                    <span className="text-muted-foreground">No shift type</span>
                  </SelectItem>
                  {SHIFT_TYPE_OPTS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold leading-none border border-border/50"
                          style={{ backgroundColor: o.bg, color: o.text }}
                        >
                          {o.label}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Auto-selected from start/end times — change manually to override.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Job type</Label>
              <Select
                value={payType}
                onValueChange={(v) => {
                  const next = v as PayType;
                  setPayTypeTouched(true);
                  // An hourly figure is never a sensible job rate, or the reverse, so a
                  // switch takes the staff member's rate for the new type when they have one.
                  const ownRate = firstAssignee && assignees.length === 1 ? employeeRateFor(firstAssignee, next) : null;
                  if (ownRate != null && next !== payType) {
                    setRateTouched(true);
                    setShift((s) => ({ ...s, payType: next, shiftRate: ownRate }));
                  } else {
                    setShift((s) => ({ ...s, payType: next }));
                  }
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[250]">
                  {PAY_TYPE_OPTS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                {payType === 'per_job'
                  ? 'Paid the job rate once for this shift, whatever its length.'
                  : 'Paid the hourly rate for each hour worked, less the break.'}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>
                  {payType === 'per_job' ? 'Job rate (fixed per shift)' : 'Shift rate (per hour)'}{' '}
                  <span className="text-destructive">*</span>
                </Label>
                {primaryStaffRate ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-sky-600 hover:underline tabular-nums"
                    title={payType === 'per_job' ? 'Use this staff job rate' : 'Use this staff hourly rate'}
                    onClick={() => {
                      setRateTouched(true);
                      setShift((s) => ({ ...s, shiftRate: primaryStaffRate.rate }));
                    }}
                  >
                    Staff rate: {primaryStaffRate.rate.toFixed(2)}
                  </button>
                ) : assigneeStaffRates.length > 1 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Staff rates: {assigneeStaffRates.map((r) => r.rate.toFixed(2)).join(' / ')}
                  </span>
                ) : null}
              </div>
              <Input
                type="number"
                step="0.01"
                min={0.01}
                required
                placeholder={perStaffRates ? 'Each staff rate' : payType === 'per_job' ? 'e.g. 120.00' : 'e.g. 12.50'}
                value={rateValue ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setRateTouched(true);
                  setShift((s) => ({
                    ...s,
                    shiftRate: v === '' ? null : parseFloat(v) || null,
                  }));
                }}
              />
              <p className="text-[11px] text-muted-foreground">
                {perStaffRates
                  ? 'Each staff member gets their own profile rate. Enter a rate to use one rate for everyone.'
                  : 'Auto-filled from Staff → Employment Details when available. You can override it.'}
                {staffPayEstimate != null && hasTimes && !perStaffRates
                  ? ` Staff pay for this shift: ${formatMoney(staffPayEstimate)}.`
                  : ''}
              </p>
            </div>
            <div className="space-y-2">
              <Label>Assign to employees</Label>
              <div className="max-h-36 overflow-y-auto rounded-md border p-2 space-y-1.5">
                {employees.map((e) => (
                  <label key={e.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={assignees.includes(e.id)} onChange={() => toggleAsg(e.id)} />
                    <span className="truncate">{e.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Shift colour</Label>
              <SiteColorPicker
                value={shift.color || DEFAULT_SITE_COLOR}
                onChange={(c) => setShift((s) => ({ ...s, color: c }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Notes / description</Label>
              <Textarea
                placeholder="Shown on the rota shift and in Description"
                value={shift.notes}
                onChange={(e) => setShift((s) => ({ ...s, notes: e.target.value.slice(0, 500) }))}
                rows={3}
                maxLength={500}
                className="min-h-[72px] resize-y"
              />
              <p className="text-[11px] text-muted-foreground tabular-nums">
                {shift.notes.length}/500 — appears on the shift tile in the rota
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={reset}>
              Reset form
            </Button>
            <Button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit || createSite.isPending}
              title={canSubmit ? undefined : `Site name and ${payType === 'per_job' ? 'job' : 'shift'} rate are required`}
            >
              {createSite.isPending ? 'Saving…' : edit ? 'Update shift' : 'Add shift'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addSiteOpen} onOpenChange={setAddSiteOpen}>
        <DialogContent className="rota-density sm:max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle>Add site</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Site name</Label>
              <Input
                maxLength={TEXT_LIMITS.siteName}
                value={newSiteName}
                onChange={(e) => setNewSiteName(clampText(e.target.value, TEXT_LIMITS.siteName))}
                placeholder="e.g. Chiswick Hotel"
              />
              <p className="text-[11px] text-muted-foreground">
                {charsRemaining(newSiteName, TEXT_LIMITS.siteName)} of {TEXT_LIMITS.siteName} characters left.
              </p>
            </div>
            <div className="space-y-1">
              <Label>Contractor</Label>
              <Select value={newSiteContractor || undefined} onValueChange={setNewSiteContractor}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={contractors.length ? 'Select contractor' : 'No contractors'} />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[300]">
                  {contractors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Site colour</Label>
              <SiteColorPicker value={newSiteColor} onChange={setNewSiteColor} />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              disabled={newSiteName.trim().length < 2 || !newSiteContractor || createSite.isPending}
              onClick={() => void saveNewSite()}
            >
              {createSite.isPending ? 'Creating…' : 'Create site'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
