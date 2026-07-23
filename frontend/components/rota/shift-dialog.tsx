'use client';

import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EmployeeRec, ShiftRec } from '@/lib/rota-shifts-types';
import { SHIFT_COLOR_OPTS } from '@/lib/rota-shifts-types';
import { findConflictsForDraft } from '@/lib/rota-shifts-utils';
import { useCreateSite, useSites } from '@/hooks/use-sites';
import { useDirectoryContractorsList } from '@/hooks/use-directory-contractors';
import { DEFAULT_SITE_COLOR, SiteColorPicker } from '@/components/site-color-picker';
import { cn } from '@/lib/utils';
import { AlertTriangle, Plus } from 'lucide-react';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: EmployeeRec[];
  defaultDk: string;
  defaultEmpId: string;
  edit?: { empId: string; dk: string; idx: number; shift: ShiftRec } | null;
  /** Current planner shifts — used to detect conflicts while editing. */
  allShifts?: Record<string, Record<string, ShiftRec[] | undefined> | undefined>;
  onApply: (assignees: string[], dk: string, shift: ShiftRec) => void;
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
  shiftRate: null,
});

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
  const siteByName = useMemo(() => new Map(sites.map((s) => [s.name, s])), [sites]);
  const siteNames = sites.map((s) => s.name);
  const [dk, setDk] = useState(defaultDk);
  const [shift, setShift] = useState<ShiftRec>(() => empty());
  const siteOptions = useMemo(
    () => (shift.site && !siteNames.includes(shift.site) ? [shift.site, ...siteNames] : siteNames),
    [shift.site, siteNames]
  );
  const [assignees, setAssignees] = useState<string[]>([defaultEmpId]);
  const [addSiteOpen, setAddSiteOpen] = useState(false);
  const [newSiteName, setNewSiteName] = useState('');
  const [newSiteContractor, setNewSiteContractor] = useState('');
  const [newSiteColor, setNewSiteColor] = useState<string>(DEFAULT_SITE_COLOR);

  const applySite = (siteName: string) => {
    const rec = siteName ? siteByName.get(siteName) : undefined;
    const staff =
      rec?.staff_hourly_rate != null && !Number.isNaN(Number(rec.staff_hourly_rate))
        ? Number(rec.staff_hourly_rate)
        : null;
    const siteRate =
      rec?.default_hourly_rate != null && !Number.isNaN(Number(rec.default_hourly_rate))
        ? Number(rec.default_hourly_rate)
        : null;
    const prefer = staff != null && staff > 0 ? staff : siteRate;
    setShift((s) => ({
      ...s,
      site: siteName,
      color: rec?.color || DEFAULT_SITE_COLOR,
      // Prefill from site staff rate (then site rate) when empty so Payable can calculate
      shiftRate:
        s.shiftRate != null && !Number.isNaN(Number(s.shiftRate))
          ? s.shiftRate
          : prefer != null && prefer > 0
            ? prefer
            : s.shiftRate,
    }));
  };

  useEffect(() => {
    if (!open) return;
    setDk(defaultDk);
    if (edit) {
      setShift(normalizeShiftForm({ ...edit.shift }));
      setAssignees([edit.empId]);
    } else {
      setShift(empty());
      setAssignees(defaultEmpId ? [defaultEmpId] : employees[0] ? [employees[0].id] : []);
    }
    // Intentionally omit `employees` — parent remaps that array every render and would reset the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultDk, defaultEmpId, edit?.empId, edit?.dk, edit?.idx]);

  const toggleAsg = (id: string) => {
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const reset = () =>
    setShift((s) => ({
      ...s,
      start: '00:00',
      end: '00:00',
      breakH: 0,
      breakM: 0,
    }));

  const submit = () => {
    if (assignees.length === 0 || !dk) return;
    onApply(assignees, dk, normalizeShiftForm(shift));
    onOpenChange(false);
  };

  const openAddSite = () => {
    setNewSiteName('');
    setNewSiteContractor(contractors[0]?.id ?? '');
    setNewSiteColor(shift.color || DEFAULT_SITE_COLOR);
    setAddSiteOpen(true);
  };

  const saveNewSite = async () => {
    const name = newSiteName.trim();
    if (name.length < 2 || !newSiteContractor) return;
    const site = await createSite.mutateAsync({ name, contractor_id: newSiteContractor, color: newSiteColor });
    setShift((s) => ({ ...s, site: site.name, color: site.color || newSiteColor }));
    setAddSiteOpen(false);
  };

  const siteValue = shift.site || '__none__';

  const assigneeStaffRates = useMemo(() => {
    return assignees
      .map((id) => {
        const emp = employees.find((e) => e.id === id);
        if (!emp) return null;
        const rate = emp.hourlyRate;
        if (rate == null || Number.isNaN(Number(rate))) return null;
        return { id: emp.id, name: emp.name, rate: Number(rate) };
      })
      .filter((r): r is { id: string; name: string; rate: number } => !!r);
  }, [assignees, employees]);

  const primaryStaffRate = assigneeStaffRates.length === 1 ? assigneeStaffRates[0] : null;

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
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" showCloseButton>
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
                <Label>Start</Label>
                <Input type="time" value={shift.start} onChange={(e) => setShift((s) => ({ ...s, start: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>End</Label>
                <Input type="time" value={shift.end} onChange={(e) => setShift((s) => ({ ...s, end: e.target.value }))} />
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
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label>Break (hrs)</Label>
                <Input
                  type="number"
                  min={0}
                  value={shift.breakH}
                  onChange={(e) => setShift((s) => ({ ...s, breakH: parseInt(e.target.value, 10) || 0 }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Break (mins)</Label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={shift.breakM}
                  onChange={(e) => setShift((s) => ({ ...s, breakM: parseInt(e.target.value, 10) || 0 }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>Site / location</Label>
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-sky-600" onClick={openAddSite}>
                  <Plus className="size-3.5 mr-1" />
                  Add site
                </Button>
              </div>
              <Select
                value={siteValue}
                onValueChange={(v) => applySite(v === '__none__' ? '' : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Optional — select site" />
                </SelectTrigger>
                <SelectContent position="popper" className="z-[250]">
                  <SelectItem value="__none__">No site (one-off / temporary)</SelectItem>
                  {siteOptions.map((name) => {
                    const rec = siteByName.get(name);
                    const c = rec?.color || DEFAULT_SITE_COLOR;
                    return (
                      <SelectItem key={name} value={name}>
                        <span className="flex items-center gap-2">
                          <span className="size-3 rounded-full shrink-0 border border-border/50" style={{ backgroundColor: c }} />
                          {name}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea
                placeholder="Location details, instructions, or one-off info"
                value={shift.notes}
                onChange={(e) => setShift((s) => ({ ...s, notes: e.target.value.slice(0, 200) }))}
                rows={3}
                maxLength={200}
                className="min-h-[72px] resize-y"
              />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-2">
                <Label>Shift rate (per hour, optional)</Label>
                {primaryStaffRate ? (
                  <button
                    type="button"
                    className="text-xs font-medium text-sky-600 hover:underline tabular-nums"
                    title="Use this staff hourly rate"
                    onClick={() => setShift((s) => ({ ...s, shiftRate: primaryStaffRate.rate }))}
                  >
                    Staff rate: {primaryStaffRate.rate.toFixed(2)}
                  </button>
                ) : assigneeStaffRates.length > 1 ? (
                  <span className="text-xs text-muted-foreground tabular-nums">
                    Staff rates: {assigneeStaffRates.map((r) => r.rate.toFixed(2)).join(' / ')}
                  </span>
                ) : assignees.length > 0 ? (
                  <span className="text-xs text-muted-foreground">No staff rate set</span>
                ) : null}
              </div>
              <Input
                type="number"
                step="0.01"
                min={0}
                placeholder="e.g. 12.50"
                value={shift.shiftRate ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setShift((s) => ({
                    ...s,
                    shiftRate: v === '' ? null : parseFloat(v) || null,
                  }));
                }}
              />
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
              <div className="flex flex-wrap gap-2">
                {SHIFT_COLOR_OPTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={cn(
                      'size-8 rounded-full border-2 shadow-sm',
                      shift.color === c ? 'border-foreground scale-110' : 'border-transparent'
                    )}
                    style={{ backgroundColor: c }}
                    onClick={() => setShift((s) => ({ ...s, color: c }))}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Shift label</Label>
              <Input
                maxLength={20}
                placeholder="Max 20 chars"
                value={shift.label}
                onChange={(e) => setShift((s) => ({ ...s, label: e.target.value.slice(0, 20) }))}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={reset}>
              Reset form
            </Button>
            <Button type="button" className="bg-pink-600 hover:bg-pink-700" onClick={submit} disabled={assignees.length === 0}>
              {edit ? 'Update shift' : 'Add shift'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addSiteOpen} onOpenChange={setAddSiteOpen}>
        <DialogContent className="sm:max-w-sm" showCloseButton>
          <DialogHeader>
            <DialogTitle>Add site</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <Label>Site name</Label>
              <Input value={newSiteName} onChange={(e) => setNewSiteName(e.target.value)} placeholder="e.g. Chiswick Hotel" />
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
              className="bg-pink-600 hover:bg-pink-700"
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
