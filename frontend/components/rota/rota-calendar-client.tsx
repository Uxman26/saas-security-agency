'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useRotaShifts } from '@/contexts/rota-shifts-context';
import { attKey, calcHours, fmtShortDate, formatHoursDecimal, initials } from '@/lib/rota-shifts-utils';
import type { AttendanceRec, ShiftRec } from '@/lib/rota-shifts-types';
import { ShiftDialog } from '@/components/rota/shift-dialog';
import {
  ArrowLeft,
  ArrowUpDown,
  CalendarPlus,
  GripVertical,
  MoreHorizontal,
  Plus,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function RotaCalendarClient() {
  const router = useRouter();
  const {
    state,
    pool,
    poolLoading,
    setRotaView,
    totalRotaHours,
    empTotalHours,
    dayTotalHours,
    addShift,
    deleteShift,
    copyShiftToDates,
    addEmployeesById,
    reorderEmployees,
    copyAllShiftsBetweenEmployees,
    clearEmployeeShifts,
    addDaysDelta,
    setAttendance,
    setInclBreaks,
    publishRota,
  } = useRotaShifts();

  const [publishing, setPublishing] = useState(false);
  const shiftCount = useMemo(() => {
    let n = 0;
    for (const empId of Object.keys(state.shifts)) {
      for (const dk of Object.keys(state.shifts[empId] || {})) {
        n += (state.shifts[empId][dk] || []).length;
      }
    }
    return n;
  }, [state.shifts]);

  const [empFilter, setEmpFilter] = useState('');
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftPref, setShiftPref] = useState<{ dk: string; empId: string }>({ dk: '', empId: '' });
  const [shiftEdit, setShiftEdit] = useState<{ empId: string; dk: string; idx: number; shift: ShiftRec } | null>(null);
  const [copyCtx, setCopyCtx] = useState<{ empId: string; dk: string; idx: number } | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
  const [xferOpen, setXferOpen] = useState(false);
  const [xferFrom, setXferFrom] = useState<string | null>(null);
  const [viewShiftsOpen, setViewShiftsOpen] = useState(false);
  const [viewShiftsEmpId, setViewShiftsEmpId] = useState<string | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [orderDraft, setOrderDraft] = useState<string[]>([]);
  const [daysOpen, setDaysOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickSel, setPickSel] = useState<Set<string>>(new Set());
  const [pickSearch, setPickSearch] = useState('');
  const [attOpen, setAttOpen] = useState(false);
  const [attRec, setAttRec] = useState<AttendanceRec | null>(null);
  const [attCtx, setAttCtx] = useState<{ empId: string; dk: string; idx: number } | null>(null);
  const [shiftMenu, setShiftMenu] = useState<{ empId: string; dk: string; idx: number } | null>(null);
  const [empMenu, setEmpMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShiftMenu(null);
        setEmpMenu(null);
      }
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  const rows = useMemo(() => {
    const q = empFilter.trim().toLowerCase();
    let list = state.employees;
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q));
    return list;
  }, [state.employees, empFilter]);

  const meta = useMemo(() => {
    if (!state.days.length) return '';
    const a = fmtShortDate(state.days[0]);
    const b = fmtShortDate(state.days[state.days.length - 1]);
    return `${a} – ${b} | ${state.days.length} days | ${state.employees.length} employees`;
  }, [state.days, state.employees.length]);

  const openAddShift = (dk: string, empId: string) => {
    setShiftEdit(null);
    setShiftPref({ dk, empId });
    setShiftOpen(true);
  };

  const openEditShift = (empId: string, dk: string, idx: number) => {
    const sh = state.shifts[empId]?.[dk]?.[idx];
    if (!sh) return;
    setShiftEdit({ empId, dk, idx, shift: { ...sh } });
    setShiftPref({ dk, empId });
    setShiftOpen(true);
  };

  const onApplyShift = (assignees: string[], dk: string, sh: ShiftRec) => {
    if (shiftEdit) {
      deleteShift(shiftEdit.empId, shiftEdit.dk, shiftEdit.idx);
    }
    for (const id of assignees) {
      addShift(id, dk, { ...sh });
    }
  };

  const startCopy = (empId: string, dk: string, idx: number) => {
    setShiftMenu(null);
    setCopyCtx({ empId, dk, idx });
    setCopyTargets(new Set(state.days.filter((d) => d !== dk)));
    setCopyOpen(true);
  };

  const doCopy = () => {
    if (!copyCtx) return;
    copyShiftToDates(copyCtx.empId, copyCtx.dk, copyCtx.idx, [...copyTargets]);
    setCopyOpen(false);
    setCopyCtx(null);
  };

  const startAtt = (empId: string, dk: string, idx: number) => {
    setShiftMenu(null);
    const k = attKey(empId, dk, idx);
    const ex = state.attendance[k];
    setAttCtx({ empId, dk, idx });
    setAttRec(
      ex || {
        status: 'present',
        hours: calcHours(state.shifts[empId][dk][idx]).toFixed(2),
        note: '',
        empId,
        dk,
        si: idx,
      }
    );
    setAttOpen(true);
  };

  const saveAtt = () => {
    if (!attCtx || !attRec) return;
    const k = attKey(attCtx.empId, attCtx.dk, attCtx.idx);
    setAttendance(k, { ...attRec, empId: attCtx.empId, dk: attCtx.dk, si: attCtx.idx });
    setAttOpen(false);
  };

  const publish = async () => {
    if (shiftCount === 0) {
      window.alert('Add shifts first: click + in a day cell, set times and site, then publish.');
      return;
    }
    if (!window.confirm(`Publish ${shiftCount} shift(s) to assignments? They will appear in Assignments and the legacy rota grid.`)) {
      return;
    }
    setPublishing(true);
    try {
      const { created, skipped, errors } = await publishRota();
      const extra = errors.length ? `\n\nIssues:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n+${errors.length - 5} more` : ''}` : '';
      if (created === 0) {
        window.alert(`Nothing was saved.${skipped ? ` ${skipped} shift(s) skipped — check site names match your Sites list.` : ''}${extra}`);
      } else {
        window.alert(`Saved ${created} shift(s) to assignments.${skipped ? ` ${skipped} skipped.` : ''}${extra}`);
      }
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const openReorder = () => {
    setOrderDraft(state.employees.map((e) => e.id));
    setReorderOpen(true);
  };

  const saveReorder = () => {
    reorderEmployees(orderDraft);
    setReorderOpen(false);
  };

  const pickToggle = (id: string) => {
    setPickSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const filteredPool = useMemo(() => {
    const q = pickSearch.trim().toLowerCase();
    if (!q) return pool;
    return pool.filter((p) => p.name.toLowerCase().includes(q) || p.role.toLowerCase().includes(q));
  }, [pool, pickSearch]);

  const viewShiftsEmp = viewShiftsEmpId ? state.employees.find((e) => e.id === viewShiftsEmpId) : null;

  const viewShiftsList = useMemo(() => {
    if (!viewShiftsEmpId) return [];
    const byD = state.shifts[viewShiftsEmpId] || {};
    const items: { dk: string; idx: number; sh: ShiftRec }[] = [];
    for (const dk of state.days) {
      (byD[dk] || []).forEach((sh, idx) => items.push({ dk, idx, sh }));
    }
    return items;
  }, [viewShiftsEmpId, state.shifts, state.days]);

  const openViewShifts = (empId: string) => {
    setViewShiftsEmpId(empId);
    setViewShiftsOpen(true);
    setEmpMenu(null);
  };

  const deleteAllEmpShifts = (empId: string) => {
    const emp = state.employees.find((e) => e.id === empId);
    if (!emp) return;
    if (!window.confirm(`Delete all shifts for ${emp.name}?`)) return;
    clearEmployeeShifts(empId);
    setEmpMenu(null);
    if (viewShiftsEmpId === empId) setViewShiftsOpen(false);
  };

  const onDragStart = (e: React.DragEvent, empId: string) => {
    e.dataTransfer.setData('empId', empId);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const onDropDay = (e: React.DragEvent, dk: string) => {
    e.preventDefault();
    const empId = e.dataTransfer.getData('empId');
    if (empId) openAddShift(dk, empId);
  };

  const weekdayTargets = () =>
    new Set(state.days.filter((d) => {
      const x = new Date(d + 'T12:00:00').getDay();
      return x >= 1 && x <= 5;
    }));
  const weekendTargets = () =>
    new Set(state.days.filter((d) => {
      const x = new Date(d + 'T12:00:00').getDay();
      return x === 0 || x === 6;
    }));

  if (!state.days.length) {
    return (
      <div className="container mx-auto px-4 py-12 text-center space-y-4">
        <p className="text-muted-foreground">No rota loaded yet.</p>
        <Button className="bg-pink-600 hover:bg-pink-700" asChild>
          <Link href="/rota/create">Create a rota</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 space-y-4 max-w-[1600px]">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 h-8" type="button" onClick={() => router.push('/rota')}>
            <ArrowLeft className="size-4 mr-1" />
            Back
          </Button>
          <h1 className="text-xl font-bold truncate">{state.rotaName || 'Untitled rota'}</h1>
          <p className="text-sm text-muted-foreground">{meta}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href="/rota/attendance-report">Attendance report</Link>
          </Button>
          <Button
            size="sm"
            className="bg-pink-600 hover:bg-pink-700"
            type="button"
            onClick={publish}
            disabled={publishing}
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </Button>
        </div>
      </div>

      {shiftCount === 0 && state.employees.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          This rota has staff but no shifts yet. Click <strong>+</strong> in a day cell to add a shift (times and site required), then click <strong>Publish</strong> to save to Assignments.
        </div>
      )}

      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="bg-pink-600 hover:bg-pink-700" type="button" onClick={() => setPickOpen(true)}>
            Add / manage shifts
          </Button>
          <div className="flex rounded-md border p-0.5 bg-muted/40">
            {(['table', 'timeline', 'dnd'] as const).map((v) => (
              <Button
                key={v}
                type="button"
                variant={state.rotaView === v ? 'secondary' : 'ghost'}
                size="sm"
                className="text-xs capitalize"
                onClick={() => setRotaView(v)}
              >
                {v === 'dnd' ? 'Drag & drop' : v}
              </Button>
            ))}
          </div>
          <span className="text-xs rounded-full bg-sky-100 dark:bg-sky-950/50 text-sky-900 dark:text-sky-100 px-2 py-1 tabular-nums">
            Total {formatHoursDecimal(totalRotaHours)}
            <span className="text-muted-foreground font-normal ml-1">
              ({state.inclBreaks ? 'incl. breaks' : 'excl. breaks'})
            </span>
          </span>
          <Button variant="outline" size="sm" type="button" onClick={openReorder}>
            <ArrowUpDown className="size-3.5 mr-1" />
            Reorder employees
          </Button>
          <Button variant="outline" size="sm" type="button" onClick={() => setDaysOpen(true)}>
            <CalendarPlus className="size-3.5 mr-1" />
            Add days
          </Button>
        </div>
      </div>

      {state.rotaView === 'table' && (
        <div className="overflow-x-auto rounded-lg border bg-card" ref={menuRef}>
          <table className="w-full text-sm border-collapse min-w-[720px]">
            <thead>
              <tr className="bg-muted/50 border-b">
                <th className="sticky left-0 z-20 bg-muted/50 p-2 text-left align-top w-52 min-w-[13rem] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                  <Input placeholder="Name, job title…" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} className="h-8 text-xs mb-2" />
                  <button type="button" className="text-xs text-pink-600 font-medium hover:underline" onClick={openReorder}>
                    ⇅ Employee custom order
                  </button>
                </th>
                {state.days.map((dk) => (
                  <th key={dk} className="p-1.5 text-center text-xs font-medium border-l min-w-[100px] whitespace-nowrap">
                    {fmtShortDate(dk)}
                  </th>
                ))}
                <th className="p-2 text-center text-xs bg-sky-100/80 dark:bg-sky-950/40 border-l min-w-[100px] align-top">
                  <div className="font-semibold">Total hours</div>
                  <label className="mt-1.5 flex items-center justify-center gap-1.5 font-normal text-[10px] text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      className="size-3.5 rounded border-input"
                      checked={state.inclBreaks}
                      onChange={(e) => setInclBreaks(e.target.checked)}
                    />
                    Incl. breaks?
                  </label>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((emp) => (
                <tr key={emp.id} className="border-b border-border/60">
                  <td className="sticky left-0 z-10 bg-card p-2 align-top border-r shadow-[2px_0_4px_-2px_rgba(0,0,0,0.06)] relative">
                    <button
                      type="button"
                      className="flex gap-2 text-left w-full rounded-md hover:bg-muted/60 p-1 -m-1"
                      onClick={() => setEmpMenu(empMenu === emp.id ? null : emp.id)}
                    >
                      <span
                        className="size-9 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold text-white"
                        style={{ backgroundColor: emp.avatarColor }}
                      >
                        {initials(emp.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium block truncate">{emp.name}</span>
                        <span className="text-[11px] text-muted-foreground truncate block">{emp.role}</span>
                      </span>
                      <MoreHorizontal className="size-4 shrink-0 ml-auto text-muted-foreground" />
                    </button>
                    {empMenu === emp.id && (
                      <div className="absolute z-30 left-2 top-full mt-1 w-64 rounded-md border bg-popover text-popover-foreground shadow-lg py-1 text-sm">
                        <button
                          type="button"
                          className="w-full text-left px-4 py-2.5 text-sky-600 hover:bg-muted font-medium"
                          onClick={() => {
                            setXferFrom(emp.id);
                            setXferOpen(true);
                            setEmpMenu(null);
                          }}
                        >
                          Copy shifts to another employee
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-4 py-2.5 text-sky-600 hover:bg-muted font-medium"
                          onClick={() => openViewShifts(emp.id)}
                        >
                          Edit/view employee shifts
                        </button>
                        <button
                          type="button"
                          className="w-full text-left px-4 py-2.5 text-destructive hover:bg-muted font-medium"
                          onClick={() => deleteAllEmpShifts(emp.id)}
                        >
                          Delete employee shifts
                        </button>
                      </div>
                    )}
                  </td>
                  {state.days.map((dk) => {
                    const list = state.shifts[emp.id]?.[dk] || [];
                    return (
                      <td key={dk} className="relative align-top p-1 border-l border-border/40 min-h-[56px] bg-muted/5">
                        <div className="flex flex-col gap-1 min-h-[48px]">
                          {list.map((sh, idx) => (
                            <div key={idx} className="relative z-10">
                              <button
                                type="button"
                                className="w-full rounded border bg-background px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm hover:bg-muted/50"
                                onClick={() => setShiftMenu(shiftMenu?.empId === emp.id && shiftMenu?.dk === dk && shiftMenu?.idx === idx ? null : { empId: emp.id, dk, idx })}
                              >
                                <div className="h-0.5 rounded-full mb-1" style={{ backgroundColor: sh.color }} />
                                <div className="font-medium tabular-nums">
                                  {sh.start} – {sh.end}
                                </div>
                                <div className="text-muted-foreground truncate text-[10px]">{sh.site}</div>
                              </button>
                              {shiftMenu?.empId === emp.id && shiftMenu?.dk === dk && shiftMenu.idx === idx && (
                                <div className="absolute left-0 top-full mt-0.5 z-30 w-48 rounded-md border bg-popover shadow-md py-1 text-xs">
                                  <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { setShiftMenu(null); openEditShift(emp.id, dk, idx); }}>
                                    Info / Edit
                                  </button>
                                  <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => startCopy(emp.id, dk, idx)}>
                                    Copy to dates…
                                  </button>
                                  <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => { setShiftMenu(null); openAddShift(dk, emp.id); }}>
                                    Add another shift
                                  </button>
                                  <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => startAtt(emp.id, dk, idx)}>
                                    Mark attendance
                                  </button>
                                  <button
                                    type="button"
                                    className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive"
                                    onClick={() => {
                                      deleteShift(emp.id, dk, idx);
                                      setShiftMenu(null);
                                    }}
                                  >
                                    Delete
                                  </button>
                                </div>
                              )}
                            </div>
                          ))}
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-muted-foreground" onClick={() => openAddShift(dk, emp.id)}>
                            <Plus className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    );
                  })}
                  <td className="text-center align-top p-2 bg-sky-100/50 dark:bg-sky-950/30 border-l text-xs tabular-nums font-medium">
                    {formatHoursDecimal(empTotalHours(emp.id))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-sky-100/70 dark:bg-sky-950/40 border-t font-medium text-xs">
                <td className="sticky left-0 z-10 bg-sky-100/70 dark:bg-sky-950/40 p-2">Daily total</td>
                {state.days.map((dk) => (
                  <td key={dk} className="text-center p-2 border-l tabular-nums">
                    {formatHoursDecimal(dayTotalHours(dk))}
                  </td>
                ))}
                <td className="text-center p-2 border-l tabular-nums">{formatHoursDecimal(totalRotaHours)}</td>
              </tr>
            </tfoot>
          </table>
          <button
            type="button"
            className="m-3 w-[calc(100%-1.5rem)] py-3 rounded-lg border border-dashed border-muted-foreground/40 text-sm text-muted-foreground hover:bg-muted/40 flex items-center justify-center gap-2"
            onClick={() => setPickOpen(true)}
          >
            <Users className="size-4" />
            Add staff
          </button>
        </div>
      )}

      {state.rotaView === 'timeline' && (
        <div className="space-y-4 overflow-x-auto">
          {state.days.map((dk) => (
            <div key={dk} className="rounded-lg border bg-card">
              <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                <span className="font-medium text-sm">{fmtShortDate(dk)}</span>
                <Button type="button" variant="link" size="sm" className="h-8 text-pink-600" onClick={() => rows[0] && openAddShift(dk, rows[0].id)}>
                  Add shift
                </Button>
              </div>
              <div className="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {state.employees.flatMap((emp) =>
                  (state.shifts[emp.id]?.[dk] || []).map((sh, idx) => (
                    <button
                      key={`${emp.id}-${idx}`}
                      type="button"
                      className="rounded-lg border text-left px-3 py-2 text-xs hover:bg-muted/50 flex gap-2 items-start"
                      onClick={() => openEditShift(emp.id, dk, idx)}
                    >
                      <span className="size-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold text-white" style={{ backgroundColor: emp.avatarColor }}>
                        {initials(emp.name)}
                      </span>
                      <span className="min-w-0">
                        <span className="font-medium block truncate">{emp.name}</span>
                        <span className="text-muted-foreground tabular-nums">{sh.start} · {sh.site}</span>
                      </span>
                      <span className="ml-auto h-3 w-1 rounded-full shrink-0 mt-1" style={{ backgroundColor: sh.color }} />
                    </button>
                  ))
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            className="w-full py-3 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/40"
            onClick={() => setPickOpen(true)}
          >
            + Add guard
          </button>
        </div>
      )}

      {state.rotaView === 'dnd' && (
        <div className="grid lg:grid-cols-[220px_1fr] gap-4">
          <div className="rounded-lg border bg-card p-3 space-y-2 max-h-[480px] overflow-y-auto">
            <p className="text-xs font-medium text-muted-foreground mb-2">Drag to a day</p>
            {state.employees.map((emp) => (
              <div
                key={emp.id}
                draggable
                onDragStart={(e) => onDragStart(e, emp.id)}
                className="flex items-center gap-2 rounded-md border bg-background p-2 cursor-grab active:cursor-grabbing text-xs"
              >
                <span className="size-8 rounded-full shrink-0 flex items-center justify-center text-[10px] font-semibold text-white" style={{ backgroundColor: emp.avatarColor }}>
                  {initials(emp.name)}
                </span>
                <span className="truncate font-medium">{emp.name}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-2 min-w-[640px]">
            {state.days.map((dk) => (
              <div
                key={dk}
                className="rounded-lg border-2 border-dashed border-muted min-h-[160px] p-2 flex flex-col gap-1"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDropDay(e, dk)}
              >
                <span className="text-[10px] font-semibold text-center border-b pb-1">{fmtShortDate(dk)}</span>
                {state.employees.flatMap((emp) =>
                  (state.shifts[emp.id]?.[dk] || []).map((sh, idx) => (
                    <button
                      key={`${emp.id}-${idx}`}
                      type="button"
                      className="text-[10px] rounded bg-muted/60 px-1 py-0.5 truncate"
                      onClick={() => openEditShift(emp.id, dk, idx)}
                    >
                      {initials(emp.name)} {sh.start}
                    </button>
                  ))
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <ShiftDialog
        open={shiftOpen}
        onOpenChange={setShiftOpen}
        employees={state.employees}
        defaultDk={shiftEdit?.dk ?? shiftPref.dk}
        defaultEmpId={shiftPref.empId}
        edit={shiftEdit}
        onApply={onApplyShift}
      />

      <Dialog
        open={copyOpen}
        onOpenChange={(v) => {
          setCopyOpen(v);
          if (!v) setCopyCtx(null);
        }}
      >
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copy shifts</DialogTitle>
          </DialogHeader>
          {copyCtx ? (
            <p className="text-xs text-muted-foreground">
              {fmtShortDate(copyCtx.dk)} · {state.employees.find((e) => e.id === copyCtx.empId)?.name ?? copyCtx.empId} ·{' '}
              {state.shifts[copyCtx.empId]?.[copyCtx.dk]?.[copyCtx.idx]
                ? `${state.shifts[copyCtx.empId][copyCtx.dk][copyCtx.idx].start}–${state.shifts[copyCtx.empId][copyCtx.dk][copyCtx.idx].end} · ${state.shifts[copyCtx.empId][copyCtx.dk][copyCtx.idx].site}`
                : ''}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setCopyTargets(weekdayTargets())}>
              Weekdays
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setCopyTargets(weekendTargets())}>
              Weekends
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setCopyTargets(new Set(state.days))}>
              All days
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setCopyTargets(new Set())}>
              Clear
            </Button>
          </div>
          <div className="max-h-48 overflow-y-auto space-y-1 border rounded-md p-2">
            {state.days.map((dk) => (
              <label key={dk} className="flex items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={copyTargets.has(dk)}
                  onChange={() =>
                    setCopyTargets((prev) => {
                      const n = new Set(prev);
                      if (n.has(dk)) n.delete(dk);
                      else n.add(dk);
                      return n;
                    })
                  }
                />
                {fmtShortDate(dk)}
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCopyTargets(new Set())}>
              Clear
            </Button>
            <Button type="button" className="bg-pink-600 hover:bg-pink-700" onClick={doCopy}>
              Copy shifts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reorderOpen} onOpenChange={setReorderOpen}>
        <DialogContent showCloseButton>
          <DialogHeader>
            <DialogTitle>Employee custom order</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Drag using the handle. Order is stored for this session.</p>
          <ul className="space-y-1">
            {orderDraft.map((id, i) => {
              const emp = state.employees.find((e) => e.id === id);
              if (!emp) return null;
              return (
                <li
                  key={id}
                  draggable
                  onDragStart={() => {}}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    /* swap simplified: click only */
                  }}
                  className="flex items-center gap-2 rounded-md border px-2 py-2 text-sm"
                >
                  <GripVertical className="size-4 text-muted-foreground cursor-grab" />
                  <span className="size-8 rounded-full flex items-center justify-center text-[10px] text-white font-semibold shrink-0" style={{ backgroundColor: emp.avatarColor }}>
                    {initials(emp.name)}
                  </span>
                  <span className="flex-1 truncate">{emp.name}</span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      disabled={i === 0}
                      onClick={() =>
                        setOrderDraft((d) => {
                          const n = [...d];
                          [n[i - 1], n[i]] = [n[i], n[i - 1]];
                          return n;
                        })
                      }
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      disabled={i === orderDraft.length - 1}
                      onClick={() =>
                        setOrderDraft((d) => {
                          const n = [...d];
                          [n[i + 1], n[i]] = [n[i], n[i + 1]];
                          return n;
                        })
                      }
                    >
                      ↓
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReorderOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-pink-600 hover:bg-pink-700" onClick={saveReorder}>
              Save order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={daysOpen} onOpenChange={setDaysOpen}>
        <DialogContent showCloseButton className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add / remove days</DialogTitle>
          </DialogHeader>
          <p className="text-sm tabular-nums">Current length: {state.days.length} days</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => addDaysDelta(1)}>
              +1 day
            </Button>
            <Button type="button" variant="outline" onClick={() => addDaysDelta(7)}>
              +7 days
            </Button>
            <Button type="button" variant="outline" onClick={() => addDaysDelta(-1)}>
              −1 day
            </Button>
          </div>
          <DialogFooter>
            <Button type="button" onClick={() => setDaysOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pickOpen} onOpenChange={setPickOpen}>
        <DialogContent showCloseButton className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose staff</DialogTitle>
          </DialogHeader>
          <Input placeholder="Search by name" value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} className="mb-3" />
          {poolLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading guards…</p>
          ) : pool.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No staff yet. Add them under <strong>Staff</strong> in the sidebar, then open this again.
            </p>
          ) : null}
          <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
            {filteredPool.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => pickToggle(p.id)}
                className={cn(
                  'rounded-lg border p-3 text-left text-sm transition-colors',
                  pickSel.has(p.id) ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50'
                )}
              >
                <span className="font-medium leading-tight block">{p.name}</span>
                <span className="text-[11px] text-muted-foreground">{p.role}</span>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button
              type="button"
              className="bg-pink-600 hover:bg-pink-700"
              disabled={poolLoading || pool.length === 0}
              onClick={() => {
                addEmployeesById([...pickSel]);
                setPickOpen(false);
                setPickSel(new Set());
              }}
            >
              Add to rota
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewShiftsOpen}
        onOpenChange={(v) => {
          setViewShiftsOpen(v);
          if (!v) setViewShiftsEmpId(null);
        }}
      >
        <DialogContent showCloseButton className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit/view employee shifts</DialogTitle>
          </DialogHeader>
          {viewShiftsEmp ? (
            <p className="text-sm text-muted-foreground -mt-1">
              {viewShiftsEmp.name} · {formatHoursDecimal(empTotalHours(viewShiftsEmp.id))}
            </p>
          ) : null}
          {viewShiftsList.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No shifts scheduled for this employee.</p>
          ) : (
            <ul className="space-y-2 max-h-[50vh] overflow-y-auto">
              {viewShiftsList.map(({ dk, idx, sh }) => (
                <li key={`${dk}-${idx}`} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
                  <span className="h-8 w-1 rounded-full shrink-0" style={{ backgroundColor: sh.color }} />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{fmtShortDate(dk)}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {sh.start} – {sh.end} · {sh.site}
                      {sh.label ? ` · ${sh.label}` : ''}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      Break {(sh.breakH || 0) > 0 || (sh.breakM || 0) > 0 ? `${sh.breakH}h ${sh.breakM}m` : 'none'} ·{' '}
                      {formatHoursDecimal(calcHours(sh, state.inclBreaks))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-sky-600 border-sky-200"
                      onClick={() => {
                        setViewShiftsOpen(false);
                        openEditShift(viewShiftsEmpId!, dk, idx);
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 text-destructive border-destructive/30"
                      onClick={() => {
                        if (!window.confirm('Delete this shift?')) return;
                        deleteShift(viewShiftsEmpId!, dk, idx);
                      }}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {viewShiftsEmpId && state.days[0] ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setViewShiftsOpen(false);
                openAddShift(state.days[0], viewShiftsEmpId);
              }}
            >
              <Plus className="size-3.5 mr-1" />
              Add shift
            </Button>
          ) : null}
          <DialogFooter>
            {viewShiftsEmpId ? (
              <Button
                type="button"
                variant="destructive"
                onClick={() => deleteAllEmpShifts(viewShiftsEmpId)}
              >
                Delete all shifts
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={xferOpen} onOpenChange={setXferOpen}>
        <DialogContent showCloseButton className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Copy shifts to another employee</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 max-h-64 overflow-y-auto">
            {xferFrom
              ? state.employees
                  .filter((e) => e.id !== xferFrom)
                  .map((e) => (
                    <Button
                      key={e.id}
                      type="button"
                      variant="outline"
                      className="justify-start h-auto py-2"
                      onClick={() => {
                        copyAllShiftsBetweenEmployees(xferFrom, e.id);
                        setXferOpen(false);
                        setXferFrom(null);
                      }}
                    >
                      <span className="size-8 rounded-full mr-2 flex items-center justify-center text-[10px] text-white font-semibold shrink-0" style={{ backgroundColor: e.avatarColor }}>
                        {initials(e.name)}
                      </span>
                      <span className="text-left">
                        <span className="font-medium block">{e.name}</span>
                        <span className="text-xs text-muted-foreground">{e.role}</span>
                      </span>
                    </Button>
                  ))
              : null}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={attOpen} onOpenChange={setAttOpen}>
        <DialogContent showCloseButton className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Attendance</DialogTitle>
          </DialogHeader>
          {attRec && (
            <div className="grid gap-3">
              <div className="space-y-1">
                <LabelMini>Status</LabelMini>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={attRec.status}
                  onChange={(e) => setAttRec({ ...attRec, status: e.target.value as AttendanceRec['status'] })}
                >
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="late">Late</option>
                </select>
              </div>
              <div className="space-y-1">
                <LabelMini>Actual hours</LabelMini>
                <Input value={attRec.hours} onChange={(e) => setAttRec({ ...attRec, hours: e.target.value })} />
              </div>
              <div className="space-y-1">
                <LabelMini>Note</LabelMini>
                <textarea
                  className="w-full min-h-[64px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={attRec.note}
                  onChange={(e) => setAttRec({ ...attRec, note: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" className="bg-pink-600 hover:bg-pink-700" onClick={saveAtt}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LabelMini({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-muted-foreground">{children}</label>;
}
