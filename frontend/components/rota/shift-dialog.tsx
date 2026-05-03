'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { EmployeeRec, ShiftRec } from '@/lib/rota-shifts-types';
import { ROTA_SITES, SHIFT_COLOR_OPTS } from '@/lib/rota-shifts-types';
import { cn } from '@/lib/utils';

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  employees: EmployeeRec[];
  defaultDk: string;
  defaultEmpId: string;
  edit?: { empId: string; dk: string; idx: number; shift: ShiftRec } | null;
  onApply: (assignees: string[], dk: string, shift: ShiftRec) => void;
};

const empty = (): ShiftRec => ({
  start: '09:00',
  end: '17:00',
  site: ROTA_SITES[0],
  notes: '',
  breakH: 0,
  breakM: 30,
  color: SHIFT_COLOR_OPTS[0],
  label: '',
});

export function ShiftDialog({ open, onOpenChange, employees, defaultDk, defaultEmpId, edit, onApply }: Props) {
  const [dk, setDk] = useState(defaultDk);
  const [shift, setShift] = useState<ShiftRec>(empty);
  const [assignees, setAssignees] = useState<string[]>([defaultEmpId]);

  useEffect(() => {
    if (!open) return;
    setDk(defaultDk);
    if (edit) {
      setShift({ ...edit.shift });
      setAssignees([edit.empId]);
    } else {
      setShift(empty());
      setAssignees(defaultEmpId ? [defaultEmpId] : employees[0] ? [employees[0].id] : []);
    }
  }, [open, defaultDk, defaultEmpId, edit, employees]);

  const toggleAsg = (id: string) => {
    setAssignees((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const reset = () => setShift(edit ? { ...edit.shift } : empty());

  const submit = () => {
    if (assignees.length === 0 || !dk) return;
    onApply(assignees, dk, shift);
    onOpenChange(false);
  };

  return (
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
            <Label>Site / location</Label>
            <Select value={shift.site} onValueChange={(v) => setShift((s) => ({ ...s, site: v }))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROTA_SITES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <textarea
              className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={shift.notes}
              onChange={(e) => setShift((s) => ({ ...s, notes: e.target.value }))}
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
  );
}
