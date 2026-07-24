'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TimeHmField, DurationHmField } from '@/components/ui/time-hm-field';
import { useRotaShifts } from '@/contexts/rota-shifts-context';
import { attKey, addMinutesToTime, attStatusBarColor, attStatusLabel, buildDayRange, buildShiftConflictMap, calcHours, countedHoursForAttendance, fmtShortDate, formatHoursDecimal, formatMoney, initials, latestShiftAdjustment, minutesBetweenTimes, normalizeAttStatus, payableHoursForAttendance, shiftConflictKey, shiftSiteLine, timeMins } from '@/lib/rota-shifts-utils';
import { downloadPlannerRotaCsv, downloadPlannerRotaPdf } from '@/lib/rota-planner-export';
import type { AttStatus, AttendanceRec, EmployeeRec, RotaViewMode, ShiftAdjustment, ShiftRec } from '@/lib/rota-shifts-types';
import { ShiftDialog } from '@/components/rota/shift-dialog';
import { DeleteShiftsDialog } from '@/components/rota/delete-shifts-dialog';
import { ShiftPreviewDialog } from '@/components/rota/shift-preview-dialog';
import { ShiftRotaSections } from '@/components/rota/shift-rota-sections';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  CalendarPlus,
  ChevronDown,
  Download,
  FileSpreadsheet,
  GripVertical,
  MoreHorizontal,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';

const SHIFT_MENU_H = 420;
const EMP_MENU_H = 132;
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const ROTA_PAY_COL_W = 96;
const ROTA_HOURS_COL_W = 104;
const ROTA_EMP_COL_W = 320;

/** Solid fills so scrolled shift tiles cannot bleed through sticky columns. */
const ROTA_STICKY_EMP_BG = {
  backgroundColor: 'var(--rota-emp-bg)',
  backgroundClip: 'padding-box',
  isolation: 'isolate',
} as const;
const ROTA_STICKY_HOURS_BG = {
  backgroundColor: 'var(--rota-hours-bg)',
  backgroundClip: 'padding-box',
  isolation: 'isolate',
} as const;
const ROTA_STICKY_PAY_BG = {
  backgroundColor: 'var(--rota-pay-bg)',
  backgroundClip: 'padding-box',
  isolation: 'isolate',
} as const;

const ATT_STATUS_OPTIONS: { value: AttStatus; label: string }[] = [
  { value: 'on_time', label: 'On time' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'no_show', label: 'No show' },
];

const STATUS_LEGEND: { status: AttStatus; description: string }[] = [
  { status: 'on_time', description: 'Arrived on time' },
  { status: 'late', description: 'Arrived late' },
  { status: 'absent', description: 'Did not attend' },
  { status: 'no_show', description: 'Scheduled but no show' },
];

function useAuthImageUrl(url?: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!url) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    const token = localStorage.getItem('token')?.trim();
    void fetch(`${API_URL}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url]);
  return src;
}

function EmployeeAvatar({ emp, className }: { emp: EmployeeRec; className?: string }) {
  const poolPhoto = emp.photoUrl;
  const src = useAuthImageUrl(poolPhoto);
  if (src) {
    return <img src={src} alt="" className={cn('rounded-full object-cover shrink-0', className)} />;
  }
  return (
    <span
      className={cn('rounded-full shrink-0 flex items-center justify-center text-white font-semibold', className)}
      style={{ backgroundColor: emp.avatarColor }}
    >
      {initials(emp.name)}
    </span>
  );
}

function placeMenu(rect: DOMRect, w: number, menuH: number, _preferUp?: boolean) {
  const width = Math.min(Math.max(w, 160), window.innerWidth - 16);
  // Prefer opening beside the card (right), fall back to left, then below/above.
  let x = rect.right + 6;
  if (x + width > window.innerWidth - 8) {
    x = rect.left - width - 6;
  }
  if (x < 8) {
    x = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
  }

  let y = rect.top;
  if (y + menuH > window.innerHeight - 8) {
    y = Math.max(8, rect.bottom - menuH);
  }
  if (y < 8) y = 8;
  // Keep the menu visually anchored to the clicked card
  const cardMid = rect.top + rect.height / 2;
  if (Math.abs(y - cardMid) > window.innerHeight * 0.35) {
    y = Math.min(Math.max(8, rect.top), Math.max(8, window.innerHeight - menuH - 8));
  }
  return { x, y, w: width };
}

export function RotaCalendarClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planIdParam = searchParams.get('id');
  const [planLoading, setPlanLoading] = useState(!!planIdParam);
  const {
    state,
    pool,
    poolLoading,
    loadRotaPlan,
    setRotaView,
    setRotaName,
    totalRotaHours,
    empTotalHours,
    dayTotalHours,
    totalRotaPayable,
    empTotalPayable,
    resolveShiftRate,
    deleteShift,
    updateShift,
    applyShiftChange,
    copyShiftToDates,
    copyShiftToEmployee,
    addEmployeesById,
    removeEmployee,
    removeEmployees,
    reorderEmployees,
    copyAllShiftsBetweenEmployees,
    moveShiftToEmployee,
    moveShiftToDay,
    clearEmployeeShifts,
    setDayCount,
    setAttendance,
    clearAttendance,
    setInclBreaks,
    publishRota,
    unpublishGuard,
    unpublishRota,
    publishedGuardIds,
    isEmployeePublished,
    setPublishedGuardIds,
  } = useRotaShifts();

  const [publishing, setPublishing] = useState(false);
  const [publishingEmpId, setPublishingEmpId] = useState<string | null>(null);
  const [unpublishing, setUnpublishing] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [nameEditing, setNameEditing] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const bootstrappedRef = useRef(false);
  const [previewEmpId, setPreviewEmpId] = useState<string | null>(null);
  const previewEmployee = useMemo(() => {
    if (!previewEmpId) return null;
    const emp = state.employees.find((e) => e.id === previewEmpId);
    if (!emp) return null;
    const fromPool = pool.find((p) => p.id === previewEmpId);
    return fromPool ? { ...emp, phone: emp.phone || fromPool.phone } : emp;
  }, [previewEmpId, state.employees, pool]);

  useEffect(() => {
    if (!planIdParam) {
      setPlanLoading(false);
      return;
    }
    const id = parseInt(planIdParam, 10);
    if (!id) {
      setPlanLoading(false);
      return;
    }
    let cancelled = false;
    setPlanLoading(true);
    void api.rotaPlans
      .get(id)
      .then((plan) => {
        if (cancelled) return;
        setPublishedGuardIds(plan.published_guard_ids || []);
        const bootstrap = searchParams.get('bootstrap') === '1';
        if (bootstrap && !bootstrappedRef.current) {
          bootstrappedRef.current = true;
          const staffParam = searchParams.get('staffIds');
          const staffIds = staffParam ? staffParam.split(',').filter(Boolean) : undefined;
          const rawView = plan.view_mode === 'dnd' ? 'table' : plan.view_mode;
          loadRotaPlan(plan, {
            name: plan.name,
            view: (rawView as RotaViewMode) || 'table',
            startDate: plan.start_date,
            dayCount: plan.day_count,
            budget: plan.budget,
            copySeed: searchParams.get('copy') === '1',
            includeAllStaff: searchParams.get('allStaff') === '1',
            staffIds,
          });
          router.replace(`/rota/calendar?id=${id}`, { scroll: false });
        } else if (!bootstrap) {
          loadRotaPlan(plan);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPlanLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [planIdParam, searchParams, loadRotaPlan, router]);

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
  const [statusFilter, setStatusFilter] = useState<'all' | AttStatus>('all');
  const [shiftOpen, setShiftOpen] = useState(false);
  const [shiftPref, setShiftPref] = useState<{ dk: string; empId: string }>({ dk: '', empId: '' });
  const [shiftEdit, setShiftEdit] = useState<{ empId: string; dk: string; idx: number; shift: ShiftRec } | null>(null);
  const [descCtx, setDescCtx] = useState<{ empId: string; dk: string; idx: number } | null>(null);
  const [copyCtx, setCopyCtx] = useState<{ empId: string; dk: string; idx: number } | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyTargets, setCopyTargets] = useState<Set<string>>(new Set());
  const [copyToEmployeeId, setCopyToEmployeeId] = useState<string | null>(null);
  const [xferOpen, setXferOpen] = useState(false);
  const [xferFrom, setXferFrom] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCtx, setMoveCtx] = useState<{ empId: string; dk: string; idx: number } | null>(null);
  const [viewShiftsOpen, setViewShiftsOpen] = useState(false);
  const [viewShiftsEmpId, setViewShiftsEmpId] = useState<string | null>(null);
  const [deleteShiftsOpen, setDeleteShiftsOpen] = useState(false);
  const [deleteShiftsEmpId, setDeleteShiftsEmpId] = useState<string | null>(null);
  const [deleteShiftsDayKey, setDeleteShiftsDayKey] = useState<string | null>(null);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [orderDraft, setOrderDraft] = useState<string[]>([]);
  const [daysOpen, setDaysOpen] = useState(false);
  const [daysBaselineCount, setDaysBaselineCount] = useState(0);
  const [pendingDayCount, setPendingDayCount] = useState(0);
  const [pickOpen, setPickOpen] = useState(false);
  const [pickSel, setPickSel] = useState<Set<string>>(new Set());
  const [pickSearch, setPickSearch] = useState('');
  const [attOpen, setAttOpen] = useState(false);
  const [attRec, setAttRec] = useState<AttendanceRec | null>(null);
  const [attCtx, setAttCtx] = useState<{ empId: string; dk: string; idx: number } | null>(null);
  const [otOpen, setOtOpen] = useState(false);
  const [otCtx, setOtCtx] = useState<{ empId: string; dk: string; idx: number } | null>(null);
  const [otEnd, setOtEnd] = useState('');
  const [otReason, setOtReason] = useState('');
  const [efOpen, setEfOpen] = useState(false);
  const [efCtx, setEfCtx] = useState<{ empId: string; dk: string; idx: number } | null>(null);
  const [efEnd, setEfEnd] = useState('');
  const [efReason, setEfReason] = useState('');
  const [adjSaving, setAdjSaving] = useState(false);
  const [attSaving, setAttSaving] = useState(false);
  const [shiftMenu, setShiftMenu] = useState<{ empId: string; dk: string; idx: number } | null>(null);
  const [shiftMenuAnchor, setShiftMenuAnchor] = useState<{ x: number; y: number; w: number } | null>(null);
  const [empMenu, setEmpMenu] = useState<string | null>(null);
  const [empMenuAnchor, setEmpMenuAnchor] = useState<{ x: number; y: number; w: number } | null>(null);
  const [selectedEmpIds, setSelectedEmpIds] = useState<Set<string>>(() => new Set());
  const [employeeSelectMode, setEmployeeSelectMode] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const shiftMenuPortalRef = useRef<HTMLDivElement>(null);
  const empMenuPortalRef = useRef<HTMLDivElement>(null);

  const closeShiftMenu = () => {
    setShiftMenu(null);
    setShiftMenuAnchor(null);
  };

  const closeEmpMenu = () => {
    setEmpMenu(null);
    setEmpMenuAnchor(null);
  };

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      const t = e.target as Node;
      if (shiftMenuPortalRef.current?.contains(t) || empMenuPortalRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      closeShiftMenu();
      closeEmpMenu();
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, []);

  useEffect(() => {
    const fn = () => {
      closeShiftMenu();
      closeEmpMenu();
    };
    window.addEventListener('scroll', fn, true);
    window.addEventListener('resize', fn);
    return () => {
      window.removeEventListener('scroll', fn, true);
      window.removeEventListener('resize', fn);
    };
  }, []);

  useEffect(() => {
    if (!shiftMenu && !empMenu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeShiftMenu();
        closeEmpMenu();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [shiftMenu, empMenu]);

  const empMatchesStatusFilter = useCallback(
    (empId: string) => {
      if (statusFilter === 'all') return true;
      let hasMatch = false;
      for (const dk of state.days) {
        const list = state.shifts[empId]?.[dk] || [];
        for (let idx = 0; idx < list.length; idx++) {
          const a = state.attendance[attKey(empId, dk, idx)];
          if (a && normalizeAttStatus(a.status) === statusFilter) hasMatch = true;
        }
      }
      return hasMatch;
    },
    [state.days, state.shifts, state.attendance, statusFilter]
  );

  const rows = useMemo(() => {
    const q = empFilter.trim().toLowerCase();
    let list = state.employees.filter((e) => empMatchesStatusFilter(e.id));
    if (q) list = list.filter((e) => e.name.toLowerCase().includes(q) || e.role.toLowerCase().includes(q));
    return list.map((e) => {
      const fromPool = pool.find((p) => p.id === e.id);
      return fromPool?.photoUrl ? { ...e, photoUrl: fromPool.photoUrl } : e;
    });
  }, [state.employees, empFilter, empMatchesStatusFilter, pool]);

  useEffect(() => {
    const alive = new Set(state.employees.map((e) => e.id));
    setSelectedEmpIds((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (alive.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [state.employees]);

  const meta = useMemo(() => {
    if (!state.days.length) return '';
    const start = state.days[0];
    const count = daysOpen ? pendingDayCount : state.days.length;
    const days = buildDayRange(start, Math.max(1, count));
    const a = fmtShortDate(days[0]);
    const b = fmtShortDate(days[days.length - 1]);
    const preview = daysOpen && pendingDayCount !== daysBaselineCount ? ' (preview)' : '';
    return `${a} – ${b} | ${count} days${preview} | ${state.employees.length} employees`;
  }, [state.days, state.employees.length, daysOpen, pendingDayCount, daysBaselineCount]);

  /** Days shown in the table — includes preview columns while editing length. */
  const tableDays = useMemo(() => {
    if (!state.days.length) return [] as string[];
    if (!daysOpen) return state.days;
    const len = Math.max(daysBaselineCount, pendingDayCount, 1);
    return buildDayRange(state.days[0], len);
  }, [state.days, daysOpen, daysBaselineCount, pendingDayCount]);

  const dayEditMark = useCallback(
    (index: number): 'adding' | 'removing' | null => {
      if (!daysOpen) return null;
      if (index >= pendingDayCount) return 'removing';
      if (index >= daysBaselineCount) return 'adding';
      return null;
    },
    [daysOpen, pendingDayCount, daysBaselineCount]
  );

  const openDaysEditor = () => {
    const n = state.days.length;
    setDaysBaselineCount(n);
    setPendingDayCount(n);
    setDaysOpen(true);
  };

  const adjustPendingDays = (delta: number) => {
    setPendingDayCount((n) => Math.max(1, Math.min(90, n + delta)));
  };

  const resetPendingDays = () => {
    setPendingDayCount(daysBaselineCount);
  };

  const applyPendingDays = () => {
    if (!state.days.length) {
      setDaysOpen(false);
      return;
    }
    const next = Math.max(1, Math.min(90, pendingDayCount));
    if (next === state.days.length) {
      setDaysOpen(false);
      return;
    }
    if (next < state.days.length) {
      const removing = state.days.slice(next);
      let shiftCount = 0;
      for (const dk of removing) {
        for (const emp of state.employees) {
          shiftCount += state.shifts[emp.id]?.[dk]?.length || 0;
        }
      }
      if (shiftCount > 0) {
        toast.confirm(
          `Remove ${removing.length} day(s) and ${shiftCount} shift(s)?`,
          () => {
            setDayCount(next);
            setDaysOpen(false);
            toast.success(
              removing.length === 1
                ? `Removed 1 day (${shiftCount} shift${shiftCount === 1 ? '' : 's'})`
                : `Removed ${removing.length} days (${shiftCount} shifts)`
            );
          },
          {
            label: 'Remove days & shifts',
            description: `${fmtShortDate(removing[0])}${removing.length > 1 ? ` – ${fmtShortDate(removing[removing.length - 1])}` : ''} will be deleted. This cannot be undone.`,
          }
        );
        return;
      }
    }
    const added = next - state.days.length;
    setDayCount(next);
    setDaysOpen(false);
    if (added > 0) {
      toast.success(added === 1 ? 'Added 1 day' : `Added ${added} days`);
    } else {
      toast.success(Math.abs(added) === 1 ? 'Removed 1 day' : `Removed ${Math.abs(added)} days`);
    }
  };

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [exportMenuOpen]);

  const exportRotaCsv = useCallback(() => {
    if (!downloadPlannerRotaCsv(state, resolveShiftRate)) {
      toast.warning('No days to export');
      return;
    }
    setExportMenuOpen(false);
    toast.success('Rota exported as CSV');
  }, [state, resolveShiftRate]);

  const exportRotaPdf = useCallback(async () => {
    if (!state.days.length) {
      toast.warning('No days to export');
      return;
    }
    setExporting(true);
    try {
      await downloadPlannerRotaPdf(state);
      setExportMenuOpen(false);
      toast.success('Rota exported as PDF');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setExporting(false);
    }
  }, [state]);

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

  const openShiftDescription = (empId: string, dk: string, idx: number) => {
    const sh = state.shifts[empId]?.[dk]?.[idx];
    if (!sh) return;
    setDescCtx({ empId, dk, idx });
  };

  const onApplyShift = (assignees: string[], dk: string, sh: ShiftRec) => {
    applyShiftChange(shiftEdit, assignees, dk, sh);
    setShiftEdit(null);
  };

  const startCopy = (empId: string, dk: string, idx: number) => {
    closeShiftMenu();
    setCopyCtx({ empId, dk, idx });
    setCopyTargets(new Set());
    setCopyToEmployeeId(null);
    setCopyOpen(true);
  };

  const startMove = (empId: string, dk: string, idx: number) => {
    closeShiftMenu();
    setMoveCtx({ empId, dk, idx });
    setMoveOpen(true);
  };

  const doCopy = () => {
    if (!copyCtx) return;
    const dates = [...copyTargets];
    if (!dates.length && !copyToEmployeeId) {
      toast.warning('Select dates and/or an employee to copy to');
      return;
    }
    if (dates.length) copyShiftToDates(copyCtx.empId, copyCtx.dk, copyCtx.idx, dates);
    if (copyToEmployeeId) copyShiftToEmployee(copyCtx.empId, copyCtx.dk, copyCtx.idx, copyToEmployeeId);
    setCopyOpen(false);
    setCopyCtx(null);
    setCopyToEmployeeId(null);
    toast.success('Shift copied');
  };

  const startAtt = (empId: string, dk: string, idx: number) => {
    closeShiftMenu();
    const k = attKey(empId, dk, idx);
    const ex = state.attendance[k];
    const sh = state.shifts[empId]?.[dk]?.[idx];
    const lateMinutes =
      ex?.lateMinutes ??
      (sh?.scheduledStart && sh.start && sh.scheduledStart !== sh.start
        ? Math.max(0, timeMins(sh.start) - timeMins(sh.scheduledStart))
        : undefined);
    setAttCtx({ empId, dk, idx });
    const normalized = ex ? { ...ex, status: normalizeAttStatus(ex.status) ?? 'on_time', lateMinutes } : null;
    setAttRec(
      normalized
        ? normalized
        : {
            status: 'on_time',
            hours: calcHours(sh || { start: '09:00', end: '17:00', site: '', notes: '', breakH: 0, breakM: 0, color: '#3b82f6', label: '' }).toFixed(2),
            note: '',
            lateMinutes,
            empId,
            dk,
            si: idx,
          }
    );
    setAttOpen(true);
  };

  const saveAtt = async () => {
    if (!attCtx || !attRec) return;
    const status = normalizeAttStatus(attRec.status) || attRec.status;
    const noteTrimmed = (attRec.note || '').trim();
    if (status !== 'on_time' && !noteTrimmed) {
      toast.error('Note is required for Late, Absent, and No show');
      return;
    }
    const sh = state.shifts[attCtx.empId]?.[attCtx.dk]?.[attCtx.idx];
    if (!sh) return;
    const k = attKey(attCtx.empId, attCtx.dk, attCtx.idx);
    const lateM = Math.max(0, parseInt(String(attRec.lateMinutes ?? ''), 10) || 0);
    let rec: AttendanceRec = { ...attRec, status: status as AttendanceRec['status'], empId: attCtx.empId, dk: attCtx.dk, si: attCtx.idx, note: noteTrimmed };
    let nextShift = sh;

    if (rec.status === 'late' && lateM > 0) {
      const scheduled = sh.scheduledStart || sh.start;
      const newStart = addMinutesToTime(scheduled, lateM);
      rec = { ...rec, status: 'late', lateMinutes: lateM };
      nextShift = { ...sh, scheduledStart: scheduled, start: newStart };
      rec.hours = calcHours(nextShift).toFixed(2);

      if (isEmployeePublished(attCtx.empId)) {
        setAttSaving(true);
        try {
          await api.assignments.latenessByShift({
            guard_id: parseInt(attCtx.empId, 10),
            date: attCtx.dk,
            shift_start: scheduled,
            site_name: sh.site,
            late_minutes: lateM,
            note: attRec.note.trim() || undefined,
          });
          rec.synced = true;
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Failed to record lateness');
          setAttSaving(false);
          return;
        }
        setAttSaving(false);
      }

      updateShift(attCtx.empId, attCtx.dk, attCtx.idx, nextShift);
    } else if (rec.status !== 'late' && sh.scheduledStart) {
      nextShift = { ...sh, start: sh.scheduledStart, scheduledStart: undefined };
      rec = { ...rec, lateMinutes: undefined, synced: undefined };
      updateShift(attCtx.empId, attCtx.dk, attCtx.idx, nextShift);
    } else if (rec.status === 'late' && lateM <= 0) {
      rec = { ...rec, lateMinutes: undefined };
    } else {
      rec = { ...rec, lateMinutes: rec.status === 'late' ? lateM || undefined : undefined };
    }

    if (isEmployeePublished(attCtx.empId)) {
      setAttSaving(true);
      try {
        const scheduled = sh.scheduledStart || sh.start;
        await api.attendance.upsertByShift({
          guard_id: parseInt(attCtx.empId, 10),
          date: attCtx.dk,
          shift_start: scheduled,
          site_name: sh.site,
          status: rec.status,
          note: rec.note || undefined,
          hours: rec.hours,
        });
        rec.synced = true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to sync attendance');
        setAttSaving(false);
        return;
      }
      setAttSaving(false);
    }

    // Persist resolved rate onto shift so Payable stays correct after save
    if ((rec.status === 'on_time' || rec.status === 'late') && !(Number(nextShift.shiftRate) > 0)) {
      const rate = resolveShiftRate(nextShift, attCtx.empId);
      if (rate > 0) {
        nextShift = { ...nextShift, shiftRate: rate };
        updateShift(attCtx.empId, attCtx.dk, attCtx.idx, nextShift);
      }
    }

    setAttendance(k, rec);
    setAttOpen(false);
    toast.success('Attendance saved');
  };

  const clearShiftAttendance = (empId: string, dk: string, idx: number) => {
    closeShiftMenu();
    const k = attKey(empId, dk, idx);
    if (!state.attendance[k]) {
      toast.warning('No attendance marked on this shift');
      return;
    }
    toast.confirm('Remove attendance from this shift?', () => {
      clearAttendance(k);
      toast.success('Attendance removed');
    }, { label: 'Remove', description: 'This cannot be undone.' });
  };

  const clearShiftOvertime = (empId: string, dk: string, idx: number) => {
    closeShiftMenu();
    const sh = state.shifts[empId]?.[dk]?.[idx];
    const overtime = sh ? latestShiftAdjustment(sh, 'overtime') : null;
    const otMins = overtime ? minutesBetweenTimes(overtime.scheduledEnd, overtime.actualEnd) : 0;
    if (!overtime || otMins <= 0) {
      toast.warning('No overtime recorded on this shift');
      return;
    }
    toast.confirm('Remove overtime from this shift?', () => {
      removeShiftAdjustment(empId, dk, idx, 'overtime');
      toast.success('Overtime removed');
    }, { label: 'Remove', description: 'Shift end time will return to the scheduled end.' });
  };

  const clearShiftEarlyFinish = (empId: string, dk: string, idx: number) => {
    closeShiftMenu();
    const sh = state.shifts[empId]?.[dk]?.[idx];
    const early = sh ? latestShiftAdjustment(sh, 'early_finish') : null;
    const earlyMins = early ? minutesBetweenTimes(early.actualEnd, early.scheduledEnd) : 0;
    if (!early || earlyMins <= 0) {
      toast.warning('No early finish recorded on this shift');
      return;
    }
    toast.confirm('Remove early finish from this shift?', () => {
      removeShiftAdjustment(empId, dk, idx, 'early_finish');
      toast.success('Early finish removed');
    }, { label: 'Remove', description: 'Shift end time will return to the scheduled end.' });
  };

  const removeShiftAdjustment = (empId: string, dk: string, idx: number, type: 'overtime' | 'early_finish') => {
    const sh = state.shifts[empId]?.[dk]?.[idx];
    if (!sh) return null;
    const existing = latestShiftAdjustment(sh, type);
    if (!existing) return null;
    const adjustments = (sh.adjustments || []).filter((a) => a.type !== type);
    const restoreEnd = existing.scheduledEnd || sh.scheduledEnd || sh.end;
    updateShift(empId, dk, idx, {
      ...sh,
      end: restoreEnd,
      scheduledEnd: adjustments.length > 0 ? sh.scheduledEnd || restoreEnd : undefined,
      adjustments,
    });
    return restoreEnd;
  };

  const openEarlyFinishDialog = (empId: string, dk: string, idx: number, defaultEnd?: string) => {
    const sh = state.shifts[empId]?.[dk]?.[idx];
    if (!sh) return;
    const scheduled = defaultEnd || sh.scheduledEnd || sh.end;
    setEfCtx({ empId, dk, idx });
    setEfEnd(scheduled);
    setEfReason('');
    setEfOpen(true);
  };

  const openOvertimeDialog = (empId: string, dk: string, idx: number, defaultEnd?: string) => {
    const sh = state.shifts[empId]?.[dk]?.[idx];
    if (!sh) return;
    const scheduled = sh.scheduledEnd || sh.end;
    setOtCtx({ empId, dk, idx });
    setOtEnd(defaultEnd || scheduled);
    setOtReason('');
    setOtOpen(true);
  };

  const startOvertime = (empId: string, dk: string, idx: number) => {
    closeShiftMenu();
    const sh = state.shifts[empId]?.[dk]?.[idx];
    if (!sh) return;
    const early = latestShiftAdjustment(sh, 'early_finish');
    const earlyMins = early ? minutesBetweenTimes(early.actualEnd, early.scheduledEnd) : 0;
    if (early && earlyMins > 0) {
      toast.confirm(
        'This shift has an early finish recorded. Remove it before adding overtime.',
        () => {
          const restoreEnd = removeShiftAdjustment(empId, dk, idx, 'early_finish');
          if (restoreEnd) {
            openOvertimeDialog(empId, dk, idx, restoreEnd);
            toast.success('Early finish removed — enter an overtime end time');
          }
        },
        {
          label: 'Remove early finish',
          description: 'Overtime and early finish cannot apply to the same shift.',
        }
      );
      return;
    }
    openOvertimeDialog(empId, dk, idx);
  };

  const startEarlyFinish = (empId: string, dk: string, idx: number) => {
    closeShiftMenu();
    const sh = state.shifts[empId]?.[dk]?.[idx];
    if (!sh) return;
    const overtime = latestShiftAdjustment(sh, 'overtime');
    const otMins = overtime ? minutesBetweenTimes(overtime.scheduledEnd, overtime.actualEnd) : 0;
    if (overtime && otMins > 0) {
      toast.confirm(
        'This shift has overtime recorded. Remove it before adding an early finish.',
        () => {
          const restoreEnd = removeShiftAdjustment(empId, dk, idx, 'overtime');
          if (restoreEnd) {
            openEarlyFinishDialog(empId, dk, idx, restoreEnd);
            toast.success('Overtime removed — enter a finish time earlier than scheduled end');
          }
        },
        {
          label: 'Remove overtime',
          description: 'Overtime and early finish cannot apply to the same shift.',
        }
      );
      return;
    }
    openEarlyFinishDialog(empId, dk, idx);
  };

  const applyShiftAdjustment = async (
    ctx: { empId: string; dk: string; idx: number },
    kind: 'overtime' | 'early_finish',
    actualEnd: string,
    reason: string
  ) => {
    const sh = state.shifts[ctx.empId]?.[ctx.dk]?.[ctx.idx];
    if (!sh) return false;
    const scheduled = sh.scheduledEnd || sh.end;
    if (isEmployeePublished(ctx.empId)) {
      try {
        const payload = {
          guard_id: parseInt(ctx.empId, 10),
          date: ctx.dk,
          shift_start: sh.start,
          site_name: sh.site,
          reason: reason.trim(),
        };
        if (kind === 'overtime') {
          await api.assignments.overtimeByShift({ ...payload, new_end: actualEnd });
        } else {
          await api.assignments.earlyFinishByShift({ ...payload, actual_end: actualEnd });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to record adjustment');
        return false;
      }
    }
    const adj: ShiftAdjustment = {
      type: kind,
      scheduledEnd: scheduled,
      actualEnd,
      reason: reason.trim(),
      at: new Date().toISOString(),
      synced: isEmployeePublished(ctx.empId) || undefined,
    };
    updateShift(ctx.empId, ctx.dk, ctx.idx, {
      ...sh,
      scheduledEnd: scheduled,
      end: actualEnd,
      adjustments: [...(sh.adjustments || []), adj],
    });
    return true;
  };

  const saveOvertime = async () => {
    if (!otCtx) return;
    const sh = state.shifts[otCtx.empId]?.[otCtx.dk]?.[otCtx.idx];
    if (!sh) return;
    const scheduled = sh.scheduledEnd || sh.end;
    const reason = otReason.trim();
    if (!reason) {
      toast.warning('Reason is required');
      return;
    }
    const early = latestShiftAdjustment(sh, 'early_finish');
    if (early && minutesBetweenTimes(early.actualEnd, early.scheduledEnd) > 0) {
      toast.warning('Remove early finish before adding overtime');
      return;
    }
    if (timeMins(otEnd) <= timeMins(scheduled)) {
      toast.warning('New end time must be after scheduled end');
      return;
    }
    setAdjSaving(true);
    const ok = await applyShiftAdjustment(otCtx, 'overtime', otEnd, reason);
    setAdjSaving(false);
    if (ok) {
      setOtOpen(false);
      toast.success('Overtime recorded');
    }
  };

  const saveEarlyFinish = async () => {
    if (!efCtx) return;
    const sh = state.shifts[efCtx.empId]?.[efCtx.dk]?.[efCtx.idx];
    if (!sh) return;
    const scheduled = sh.scheduledEnd || sh.end;
    const reason = efReason.trim();
    if (!reason) {
      toast.warning('Reason is required');
      return;
    }
    const overtime = latestShiftAdjustment(sh, 'overtime');
    if (overtime && minutesBetweenTimes(overtime.scheduledEnd, overtime.actualEnd) > 0) {
      toast.warning('Remove overtime before adding an early finish');
      return;
    }
    if (timeMins(efEnd) >= timeMins(scheduled)) {
      toast.warning(`Actual end time must be before scheduled end (${scheduled})`);
      return;
    }
    setAdjSaving(true);
    const ok = await applyShiftAdjustment(efCtx, 'early_finish', efEnd, reason);
    setAdjSaving(false);
    if (ok) {
      setEfOpen(false);
      toast.success('Early finish recorded');
    }
  };

  const runPublish = async (guardId?: number) => {
    const empKey = guardId != null ? String(guardId) : null;
    if (empKey) setPublishingEmpId(empKey);
    else setPublishing(true);
    try {
      const { created, skipped, errors, published_guard_ids } = await publishRota(guardId);
      if (published_guard_ids) {
        setPublishedGuardIds(published_guard_ids);
      }
      if (errors.length) {
        errors.slice(0, 3).forEach((msg) => toast.warning(msg));
        if (errors.length > 3) toast.warning(`+${errors.length - 3} more issues`);
      }
      if (created === 0) {
        toast.warning(
          skipped
            ? `${skipped} shift(s) skipped — check site names match your Sites list`
            : 'Nothing was saved'
        );
      } else {
        toast.success(
          `Saved ${created} shift(s) to assignments${skipped ? ` (${skipped} skipped)` : ''}`
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Publish failed');
    } finally {
      setPublishing(false);
      setPublishingEmpId(null);
    }
  };

  const runUnpublish = async (guardId: number) => {
    setPublishingEmpId(String(guardId));
    try {
      const result = await unpublishGuard(guardId);
      if (result.published_guard_ids) {
        setPublishedGuardIds(result.published_guard_ids);
      }
      toast.success('Unpublished for this employee');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Unpublish failed');
    } finally {
      setPublishingEmpId(null);
    }
  };

  const publish = () => {
    if (shiftCount === 0) {
      toast.warning('Add shifts first: click + in a day cell, set times, then publish.');
      return;
    }
    toast.confirm(
      `Publish ${shiftCount} shift(s)?`,
      () => runPublish(),
      {
        description: 'All staff shifts are published. You can unpublish individual staff from their row afterwards.',
        label: 'Publish',
      }
    );
  };

  const unpublishAll = () => {
    toast.confirm(
      'Unpublish this entire rota?',
      async () => {
        setUnpublishing(true);
        try {
          await unpublishRota();
          setPublishedGuardIds([]);
          toast.success('Rota unpublished');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Unpublish failed');
        } finally {
          setUnpublishing(false);
        }
      },
      {
        description: 'All published assignments for this rota will be removed.',
        label: 'Unpublish',
      }
    );
  };

  const toggleEmployeePublished = (emp: { id: string; name: string }, nextPublished: boolean) => {
    const guardId = parseInt(emp.id, 10);
    if (!guardId) return;
    if (publishingEmpId === emp.id || publishing || unpublishing) return;

    if (nextPublished) {
      const count = Object.values(state.shifts[emp.id] || {}).reduce(
        (n, list) => n + (list?.length || 0),
        0
      );
      if (count === 0) {
        toast.warning(`Add shifts for ${emp.name} before publishing.`);
        return;
      }
      void runPublish(guardId);
      return;
    }

    toast.confirm(
      `Unpublish ${emp.name}?`,
      () => runUnpublish(guardId),
      {
        description: 'Only this employee’s published shifts will be removed from assignments.',
        label: 'Unpublish',
      }
    );
  };

  const commitRotaName = () => {
    const next = nameDraft.trim();
    if (!next) {
      toast.warning('Please enter a rota name');
      setNameDraft(state.rotaName || '');
      setNameEditing(false);
      return;
    }
    if (next !== state.rotaName) {
      setRotaName(next);
      toast.success('Rota name updated');
    }
    setNameEditing(false);
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

  const shiftConflicts = useMemo(() => buildShiftConflictMap(state.shifts), [state.shifts]);

  const dayHasConflict = useMemo(() => {
    const days = new Set<string>();
    shiftConflicts.forEach((hits, key) => {
      if (!hits.length) return;
      const parts = key.split(':');
      if (parts.length >= 2) days.add(parts[1]);
      hits.forEach((h) => days.add(h.dk));
    });
    return days;
  }, [shiftConflicts]);

  const empHasConflict = useCallback(
    (empId: string) => {
      for (const [key, hits] of shiftConflicts) {
        if (hits.length && key.startsWith(`${empId}:`)) return true;
      }
      return false;
    },
    [shiftConflicts]
  );

  const deleteShiftsEmp = deleteShiftsEmpId ? state.employees.find((e) => e.id === deleteShiftsEmpId) : null;

  const deleteShiftsRows = useMemo(() => {
    if (!deleteShiftsEmpId) return [];
    const byD = state.shifts[deleteShiftsEmpId] || {};
    const days = deleteShiftsDayKey ? [deleteShiftsDayKey] : state.days;
    const items: { dayKey: string; idx: number; shift: ShiftRec }[] = [];
    for (const dk of days) {
      (byD[dk] || []).forEach((shift, idx) => items.push({ dayKey: dk, idx, shift }));
    }
    return items;
  }, [deleteShiftsEmpId, deleteShiftsDayKey, state.shifts, state.days]);

  const openDeleteShifts = (empId: string, dayKey?: string | null) => {
    setDeleteShiftsEmpId(empId);
    setDeleteShiftsDayKey(dayKey ?? null);
    setDeleteShiftsOpen(true);
    closeEmpMenu();
    closeShiftMenu();
  };

  const handleDeleteShiftRow = (dayKey: string, idx: number) => {
    if (!deleteShiftsEmpId) return;
    deleteShift(deleteShiftsEmpId, dayKey, idx);
    toast.success('Shift deleted');
    if (deleteShiftsRows.length <= 1) {
      setDeleteShiftsOpen(false);
      setDeleteShiftsEmpId(null);
      setDeleteShiftsDayKey(null);
      if (viewShiftsEmpId === deleteShiftsEmpId) setViewShiftsOpen(false);
    }
  };

  const handleDeleteAllShifts = () => {
    if (!deleteShiftsEmpId) return;
    if (deleteShiftsDayKey) {
      const list = [...(state.shifts[deleteShiftsEmpId]?.[deleteShiftsDayKey] || [])];
      for (let i = list.length - 1; i >= 0; i--) {
        deleteShift(deleteShiftsEmpId, deleteShiftsDayKey, i);
      }
    } else {
      clearEmployeeShifts(deleteShiftsEmpId);
    }
    setDeleteShiftsOpen(false);
    setDeleteShiftsEmpId(null);
    setDeleteShiftsDayKey(null);
    if (viewShiftsEmpId === deleteShiftsEmpId) setViewShiftsOpen(false);
    toast.success('Shifts deleted');
  };

  const openViewShifts = (empId: string) => {
    setViewShiftsEmpId(empId);
    setViewShiftsOpen(true);
    closeEmpMenu();
  };

  const deleteAllEmpShifts = (empId: string) => {
    openDeleteShifts(empId);
  };

  const removeEmpFromRota = (empId: string) => {
    const emp = state.employees.find((e) => e.id === empId);
    if (!emp) return;
    toast.confirm(`Remove ${emp.name} from this rota?`, () => {
      removeEmployee(empId);
      setSelectedEmpIds((prev) => {
        if (!prev.has(empId)) return prev;
        const next = new Set(prev);
        next.delete(empId);
        return next;
      });
      closeEmpMenu();
      if (viewShiftsEmpId === empId) setViewShiftsOpen(false);
      if (previewEmpId === empId) setPreviewEmpId(null);
      toast.success('Employee removed from rota');
    }, { label: 'Remove' });
  };

  const toggleEmpSelected = (empId: string, checked: boolean) => {
    setSelectedEmpIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(empId);
      else next.delete(empId);
      return next;
    });
  };

  const allVisibleSelected = rows.length > 0 && rows.every((e) => selectedEmpIds.has(e.id));
  const someVisibleSelected = rows.some((e) => selectedEmpIds.has(e.id));

  const toggleSelectAllVisible = (checked: boolean) => {
    setSelectedEmpIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        for (const e of rows) next.add(e.id);
      } else {
        for (const e of rows) next.delete(e.id);
      }
      return next;
    });
  };

  const exitEmployeeSelectMode = () => {
    setEmployeeSelectMode(false);
    setSelectedEmpIds(new Set());
  };

  const removeSelectedEmployees = () => {
    const ids = [...selectedEmpIds].filter((id) => state.employees.some((e) => e.id === id));
    if (!ids.length) {
      toast.warning('Select employees to remove');
      return;
    }
    const label =
      ids.length === 1
        ? state.employees.find((e) => e.id === ids[0])?.name || '1 employee'
        : `${ids.length} employees`;
    toast.confirm(`Remove ${label} from this rota?`, () => {
      removeEmployees(ids);
      exitEmployeeSelectMode();
      closeEmpMenu();
      if (viewShiftsEmpId && ids.includes(viewShiftsEmpId)) setViewShiftsOpen(false);
      if (previewEmpId && ids.includes(previewEmpId)) setPreviewEmpId(null);
      toast.success(ids.length === 1 ? 'Employee removed from rota' : `${ids.length} employees removed from rota`);
    }, { label: 'Remove' });
  };

  const [dragEmpId, setDragEmpId] = useState<string | null>(null);
  const [rowDragId, setRowDragId] = useState<string | null>(null);
  const [rowDropId, setRowDropId] = useState<string | null>(null);
  const [dropDayKey, setDropDayKey] = useState<string | null>(null);
  const [dropEmpId, setDropEmpId] = useState<string | null>(null);
  const [draggingShift, setDraggingShift] = useState(false);

  const onDragStart = (e: React.DragEvent, empId: string) => {
    e.dataTransfer.setData('text/plain', empId);
    e.dataTransfer.setData('application/x-rota-drag', JSON.stringify({ type: 'employee', empId }));
    e.dataTransfer.effectAllowed = 'copy';
    setDragEmpId(empId);
  };

  const onRowReorderDragStart = (e: React.DragEvent, empId: string) => {
    e.stopPropagation();
    e.dataTransfer.setData('application/x-rota-row-reorder', empId);
    e.dataTransfer.setData('text/plain', JSON.stringify({ type: 'row-reorder', empId }));
    e.dataTransfer.effectAllowed = 'move';
    setRowDragId(empId);
    setRowDropId(null);
    closeEmpMenu();
    closeShiftMenu();
  };

  const onRowReorderDragOver = (e: React.DragEvent, empId: string) => {
    if (!e.dataTransfer.types.includes('application/x-rota-row-reorder') && rowDragId == null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (rowDropId !== empId) setRowDropId(empId);
  };

  const onRowReorderDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const fromId =
      e.dataTransfer.getData('application/x-rota-row-reorder') ||
      rowDragId ||
      '';
    setRowDragId(null);
    setRowDropId(null);
    if (!fromId || fromId === targetId) return;
    const ids = state.employees.map((emp) => emp.id);
    const from = ids.indexOf(fromId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const next = [...ids];
    next.splice(from, 1);
    next.splice(to, 0, fromId);
    reorderEmployees(next);
  };

  const onShiftDragStart = (e: React.DragEvent, empId: string, dk: string, idx: number) => {
    e.stopPropagation();
    const payload = JSON.stringify({ type: 'shift', empId, dk, idx });
    e.dataTransfer.setData('application/x-rota-drag', payload);
    e.dataTransfer.setData('text/plain', payload);
    e.dataTransfer.effectAllowed = 'move';
    setDragEmpId(null);
    setRowDragId(null);
    setDraggingShift(true);
    setDropDayKey(null);
    setDropEmpId(null);
  };

  const onDragEnd = () => {
    setDragEmpId(null);
    setRowDragId(null);
    setRowDropId(null);
    setDraggingShift(false);
    setDropDayKey(null);
    setDropEmpId(null);
  };

  const onDayDragOver = (e: React.DragEvent, dk: string, rowEmpId?: string) => {
    if (e.dataTransfer.types.includes('application/x-rota-row-reorder')) return;
    e.preventDefault();
    const raw = e.dataTransfer.types.includes('application/x-rota-drag') || e.dataTransfer.types.includes('text/plain');
    e.dataTransfer.dropEffect = raw ? 'move' : 'copy';
    if (dropDayKey !== dk) setDropDayKey(dk);
    const nextEmp = rowEmpId ?? null;
    if (dropEmpId !== nextEmp) setDropEmpId(nextEmp);
  };

  const clearDropHighlight = () => {
    setDropDayKey(null);
    setDropEmpId(null);
  };

  const parseDragPayload = (e: React.DragEvent): { type: 'employee'; empId: string } | { type: 'shift'; empId: string; dk: string; idx: number } | null => {
    const typed = e.dataTransfer.getData('application/x-rota-drag') || e.dataTransfer.getData('text/plain');
    if (!typed) return null;
    try {
      const parsed = JSON.parse(typed);
      if (parsed?.type === 'shift' && parsed.empId && parsed.dk != null && typeof parsed.idx === 'number') {
        return { type: 'shift', empId: String(parsed.empId), dk: String(parsed.dk), idx: parsed.idx };
      }
      if (parsed?.type === 'employee' && parsed.empId) {
        return { type: 'employee', empId: String(parsed.empId) };
      }
    } catch {
      // legacy plain employee id
      if (typed && !typed.startsWith('{')) return { type: 'employee', empId: typed };
    }
    return null;
  };

  const onDropDay = (e: React.DragEvent, dk: string, rowEmpId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const payload = parseDragPayload(e);
    setDragEmpId(null);
    setDraggingShift(false);
    clearDropHighlight();
    if (!payload) return;
    if (payload.type === 'employee') {
      openAddShift(dk, payload.empId);
      return;
    }
    // Move timeslot to this day (same employee, or the row employee in table view)
    const destEmp = rowEmpId || payload.empId;
    if (payload.dk === dk && payload.empId === destEmp) return;
    moveShiftToDay(payload.empId, payload.dk, payload.idx, dk, destEmp);
    toast.success('Shift moved');
  };

  const toggleShiftMenu = (e: React.MouseEvent<HTMLButtonElement>, empId: string, dk: string, idx: number, shiftsBelow: number) => {
    const open = shiftMenu?.empId === empId && shiftMenu?.dk === dk && shiftMenu?.idx === idx;
    if (open) {
      closeShiftMenu();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    closeEmpMenu();
    setShiftMenu({ empId, dk, idx });
    setShiftMenuAnchor(placeMenu(rect, 192, SHIFT_MENU_H, shiftsBelow > 0));
  };

  const toggleEmpMenu = (e: React.MouseEvent<HTMLButtonElement>, empId: string) => {
    const open = empMenu === empId;
    if (open) {
      closeEmpMenu();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    closeShiftMenu();
    setEmpMenu(empId);
    setEmpMenuAnchor(placeMenu(rect, 256, EMP_MENU_H, false));
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

  if (planLoading) {
    return (
      <div className="container mx-auto px-4 py-16 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading rota…
      </div>
    );
  }

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
    <div className="container mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 h-8" type="button" onClick={() => router.push('/rota')}>
            <ArrowLeft className="size-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2 min-w-0 max-w-xl group">
            {nameEditing ? (
              <Input
                autoFocus
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={commitRotaName}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitRotaName();
                  }
                  if (e.key === 'Escape') {
                    setNameDraft(state.rotaName || '');
                    setNameEditing(false);
                  }
                }}
                placeholder="Enter a clear rota name"
                aria-label="Edit rota name"
                className="text-xl font-bold h-10 border-primary bg-background shadow-sm px-2"
              />
            ) : (
              <button
                type="button"
                className="text-xl font-bold h-10 px-0 text-left truncate hover:underline decoration-muted-foreground/40 underline-offset-4 max-w-full"
                onClick={() => {
                  setNameDraft(state.rotaName || '');
                  setNameEditing(true);
                }}
                title="Click to rename this rota"
                aria-label="Rename rota"
              >
                {state.rotaName || 'Untitled rota'}
              </button>
            )}
            <button
              type="button"
              className="shrink-0 rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => {
                setNameDraft(state.rotaName || '');
                setNameEditing(true);
              }}
              title="Rename rota"
              aria-label="Rename rota"
            >
              <Pencil className="size-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {nameEditing ? 'Press Enter to save the new name, or Esc to cancel.' : 'Click the name or pencil to rename this rota.'}
          </p>
          <p className="text-sm text-muted-foreground">{meta}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href="/rota/attendance-report">Attendance report</Link>
          </Button>
          {publishedGuardIds.size > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="border-sky-500/50 text-sky-800 dark:text-sky-200 hover:bg-sky-50 dark:hover:bg-sky-950"
              type="button"
              onClick={unpublishAll}
              disabled={unpublishing || publishing}
            >
              {unpublishing ? 'Unpublishing…' : 'Unpublish'}
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-pink-600 hover:bg-pink-700"
              type="button"
              onClick={publish}
              disabled={publishing || unpublishing}
            >
              {publishing ? 'Publishing…' : 'Publish'}
            </Button>
          )}
        </div>
      </div>

      {shiftCount === 0 && state.employees.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          This rota has staff but no shifts yet. Click <strong>+</strong> in a day cell to add a shift, then click <strong>Publish</strong> to save to Assignments.
        </div>
      )}

      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="bg-pink-600 hover:bg-pink-700" type="button" onClick={() => setPickOpen(true)}>
            Add / manage shifts
          </Button>
          <div className="flex rounded-md border p-0.5 bg-muted/40">
            {(['table', 'timeline'] as const).map((v) => (
              <Button
                key={v}
                type="button"
                variant={state.rotaView === v ? 'secondary' : 'ghost'}
                size="sm"
                className="text-xs capitalize"
                onClick={() => setRotaView(v)}
              >
                {v}
              </Button>
            ))}
          </div>
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | AttStatus)}
            aria-label="Filter by attendance status"
          >
            <option value="all">All statuses</option>
            {ATT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <Button variant="outline" size="sm" type="button" onClick={openReorder}>
            <ArrowUpDown className="size-3.5 mr-1" />
            Reorder employees
          </Button>
          <Button variant="outline" size="sm" type="button" onClick={openDaysEditor}>
            <CalendarPlus className="size-3.5 mr-1" />
            Add days
          </Button>
          <div className="relative" ref={exportMenuRef}>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setExportMenuOpen((open) => !open)}
              disabled={!state.days.length || exporting}
            >
              <Download className="size-3.5 mr-1" />
              Export rota
              <ChevronDown className="size-3.5 ml-1 opacity-70" />
            </Button>
            {exportMenuOpen ? (
              <div className="absolute right-0 z-50 mt-1 w-52 rounded-md border bg-popover text-popover-foreground shadow-md py-1">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                  onClick={exportRotaCsv}
                >
                  <FileSpreadsheet className="size-3.5 shrink-0" />
                  CSV spreadsheet
                </button>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left disabled:opacity-50"
                  onClick={() => void exportRotaPdf()}
                  disabled={exporting}
                >
                  {exporting ? <Loader2 className="size-3.5 shrink-0 animate-spin" /> : <Download className="size-3.5 shrink-0" />}
                  PDF (shareable)
                </button>
              </div>
            ) : null}
          </div>
          {employeeSelectMode ? (
            <>
              <Button variant="outline" size="sm" type="button" onClick={exitEmployeeSelectMode}>
                Cancel selection
              </Button>
              {selectedEmpIds.size > 0 ? (
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="text-destructive border-destructive/40 hover:bg-destructive/10"
                  onClick={removeSelectedEmployees}
                >
                  <Trash2 className="size-3.5 mr-1" />
                  Remove selected ({selectedEmpIds.size})
                </Button>
              ) : null}
            </>
          ) : (
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => setEmployeeSelectMode(true)}
              disabled={rows.length === 0}
            >
              Select employees
            </Button>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 xl:justify-end">
          <span className="text-xs rounded-full bg-sky-100 dark:bg-sky-950/50 text-sky-900 dark:text-sky-100 px-2 py-1 tabular-nums">
            Total {formatHoursDecimal(totalRotaHours)}
            <span className="text-muted-foreground font-normal ml-1">
              ({state.inclBreaks ? 'incl. breaks' : 'excl. breaks'})
            </span>
          </span>
          <span className="text-xs rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100 px-2 py-1 tabular-nums">
            Payable {formatMoney(totalRotaPayable)}
          </span>
        </div>
      </div>

      {state.rotaView === 'table' && (
        <div className="rounded-lg border bg-card">
          {daysOpen ? (
            <div className="px-3 py-2 border-b bg-muted/40 text-xs flex flex-wrap gap-3 items-center">
              <span className="font-medium">Day length preview</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-emerald-500" /> Adding
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-red-500" /> Removing
              </span>
              <span className="text-muted-foreground">Changes apply when you click Done</span>
            </div>
          ) : null}
          <div
            className="overflow-auto max-h-[min(72vh,calc(100dvh-14rem))] min-h-[280px] overscroll-contain"
            ref={menuRef}
          >
          <table
            className="table-fixed w-full text-sm border-separate border-spacing-0"
            style={{
              minWidth: `${ROTA_EMP_COL_W + tableDays.length * 128 + ROTA_HOURS_COL_W + ROTA_PAY_COL_W}px`,
            }}
          >
            <colgroup>
              <col style={{ width: ROTA_EMP_COL_W }} />
              {tableDays.map((dk) => (
                <col key={dk} style={{ width: 128 }} />
              ))}
              <col style={{ width: ROTA_HOURS_COL_W }} />
              <col style={{ width: ROTA_PAY_COL_W }} />
            </colgroup>
            <thead>
              <tr className="bg-muted">
                <th
                  className="rota-sticky-emp sticky top-0 left-0 z-[70] p-2 text-left align-top border-b border-r shadow-[2px_2px_8px_-2px_rgba(0,0,0,0.2)] overflow-hidden isolate"
                  style={{ ...ROTA_STICKY_EMP_BG }}
                >
                  <div className="flex items-start gap-1.5 mb-2 min-w-0">
                    <span className="mt-2 shrink-0 w-5" aria-hidden />
                    {employeeSelectMode ? (
                      <input
                        type="checkbox"
                        className="mt-2.5 size-4 shrink-0 rounded border-input"
                        checked={allVisibleSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                        }}
                        onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                        aria-label="Select all visible employees"
                        title="Select all"
                        disabled={rows.length === 0}
                      />
                    ) : null}
                    <Input placeholder="Name, job title…" value={empFilter} onChange={(e) => setEmpFilter(e.target.value)} className="h-8 text-xs flex-1 min-w-0" />
                  </div>
                  <button type="button" className="text-xs text-pink-600 font-medium hover:underline" onClick={openReorder}>
                    ⇅ Employee custom order
                  </button>
                  <p className="text-[10px] text-muted-foreground mt-1">Green Publish / blue Unpublish on each row</p>
                  <p className="text-[10px] text-muted-foreground">Or drag the ⋮⋮ handle on a row</p>
                </th>
                {tableDays.map((dk, dayIdx) => {
                  const mark = dayEditMark(dayIdx);
                  return (
                  <th
                    key={dk}
                    className={cn(
                      'sticky top-0 z-30 p-1.5 text-center text-xs font-medium border-l border-b whitespace-nowrap overflow-hidden text-ellipsis shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1)]',
                      mark === 'adding' && 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100',
                      mark === 'removing' && 'bg-red-100 text-red-900 line-through dark:bg-red-950 dark:text-red-100',
                      !mark && 'bg-muted'
                    )}
                    style={{ backgroundClip: 'padding-box' }}
                    title={
                      mark === 'adding'
                        ? 'Will be added'
                        : mark === 'removing'
                          ? 'Will be removed'
                          : undefined
                    }
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{fmtShortDate(dk)}</span>
                      {mark === 'adding' ? <span className="text-[9px] font-semibold no-underline tracking-wide">ADD</span> : null}
                      {mark === 'removing' ? <span className="text-[9px] font-semibold no-underline tracking-wide">REMOVE</span> : null}
                      {!mark && dayHasConflict.has(dk) ? (
                        <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" aria-label="Shift conflicts on this day" />
                      ) : null}
                    </div>
                  </th>
                  );
                })}
                <th
                  className="rota-sticky-hours sticky top-0 z-[60] p-2 text-center text-xs border-l border-b align-top shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1),-2px_0_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden isolate"
                  style={{ right: ROTA_PAY_COL_W, ...ROTA_STICKY_HOURS_BG }}
                >
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
                <th
                  className="rota-sticky-pay sticky top-0 right-0 z-[60] p-2 text-center text-xs border-l border-b align-top shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1),-2px_0_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden isolate"
                  style={{ ...ROTA_STICKY_PAY_BG }}
                >
                  <div className="font-semibold">Payable</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((emp) => (
                <tr
                  key={emp.id}
                  className={cn(
                    'border-b border-border/60',
                    employeeSelectMode && selectedEmpIds.has(emp.id) && 'bg-muted',
                    empHasConflict(emp.id) && 'bg-amber-50 dark:bg-amber-950',
                    rowDragId === emp.id && 'opacity-50',
                    rowDropId === emp.id && rowDragId && rowDragId !== emp.id && 'ring-2 ring-inset ring-pink-500/70'
                  )}
                  onDragOver={(e) => onRowReorderDragOver(e, emp.id)}
                  onDrop={(e) => onRowReorderDrop(e, emp.id)}
                >
                  <td
                    className="rota-sticky-emp sticky left-0 z-50 p-2 align-top border-r border-b shadow-[2px_0_8px_-2px_rgba(0,0,0,0.18)] isolate"
                    style={
                      {
                        ['--rota-emp-cell-bg' as string]:
                          employeeSelectMode && selectedEmpIds.has(emp.id)
                            ? 'var(--muted)'
                            : empHasConflict(emp.id)
                              ? 'var(--rota-emp-conflict-bg)'
                              : 'var(--rota-emp-bg)',
                        backgroundClip: 'padding-box',
                        isolation: 'isolate',
                      } as CSSProperties
                    }
                  >
                    <div className="flex gap-1.5 items-start min-w-0">
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => onRowReorderDragStart(e, emp.id)}
                        onDragEnd={onDragEnd}
                        className="mt-2 shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted cursor-grab active:cursor-grabbing"
                        aria-label={`Drag to reorder ${emp.name}`}
                        title="Drag to reorder"
                      >
                        <GripVertical className="size-4" />
                      </button>
                      {employeeSelectMode ? (
                        <input
                          type="checkbox"
                          className="mt-2.5 size-4 shrink-0 rounded border-input"
                          checked={selectedEmpIds.has(emp.id)}
                          onChange={(e) => toggleEmpSelected(emp.id, e.target.checked)}
                          aria-label={`Select ${emp.name}`}
                        />
                      ) : null}
                      <div className="flex-1 min-w-0 space-y-1">
                        <button
                          type="button"
                          className="flex gap-2 text-left w-full min-w-0 rounded-md hover:bg-muted/60 p-1 -m-1"
                          onClick={(e) => toggleEmpMenu(e, emp.id)}
                        >
                          <EmployeeAvatar emp={emp} className="size-9 text-[11px] shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="font-medium flex items-start gap-1 break-words whitespace-normal">
                              <span className="break-words">{emp.name}</span>
                              {empHasConflict(emp.id) ? (
                                <AlertTriangle className="size-3.5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" aria-label="Has shift conflicts" />
                              ) : null}
                            </span>
                            <span className="text-[11px] text-muted-foreground block break-words">{emp.role}</span>
                          </span>
                          <MoreHorizontal className="size-4 shrink-0 text-muted-foreground mt-1" />
                        </button>
                        <button
                          type="button"
                          disabled={publishingEmpId === emp.id || publishing || unpublishing}
                          onClick={() => toggleEmployeePublished(emp, !isEmployeePublished(emp.id))}
                          className={cn(
                            'w-full text-[10px] font-semibold rounded px-2 py-1 border transition-colors',
                            isEmployeePublished(emp.id)
                              ? 'bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-100 dark:border-sky-700'
                              : 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-100 dark:border-emerald-700'
                          )}
                          title={
                            isEmployeePublished(emp.id)
                              ? 'Published — click to unpublish this staff'
                              : 'Not published — click to publish this staff'
                          }
                          aria-label={
                            isEmployeePublished(emp.id)
                              ? `Unpublish ${emp.name}`
                              : `Publish ${emp.name}`
                          }
                        >
                          {publishingEmpId === emp.id
                            ? 'Saving…'
                            : isEmployeePublished(emp.id)
                              ? 'Unpublish'
                              : 'Publish'}
                        </button>
                      </div>
                    </div>
                  </td>
                  {tableDays.map((dk, dayIdx) => {
                    const mark = dayEditMark(dayIdx);
                    const list = mark === 'adding' ? [] : state.shifts[emp.id]?.[dk] || [];
                    const showCell = statusFilter === 'all' || list.some((_, idx) => {
                      const a = state.attendance[attKey(emp.id, dk, idx)];
                      return a && normalizeAttStatus(a.status) === statusFilter;
                    });
                    if (statusFilter !== 'all' && list.length > 0 && !showCell) {
                      return (
                        <td
                          key={dk}
                          className={cn(
                            'relative z-0 align-top p-1 border-l border-b border-border overflow-hidden',
                            mark === 'removing' ? 'bg-red-50 dark:bg-red-950/40 opacity-60' : 'bg-muted'
                          )}
                        />
                      );
                    }
                    return (
                      <td
                        key={dk}
                        className={cn(
                          'relative z-0 align-top p-1 border-l border-b border-border overflow-hidden transition-colors',
                          mark === 'adding' && 'bg-emerald-50 dark:bg-emerald-950/40 ring-1 ring-inset ring-emerald-400/50',
                          mark === 'removing' && 'bg-red-50 dark:bg-red-950/40 opacity-55',
                          !mark && 'bg-muted',
                          !mark &&
                            list.some((_, idx) => (shiftConflicts.get(shiftConflictKey(emp.id, dk, idx)) || []).length > 0) &&
                            'bg-amber-50 dark:bg-amber-950',
                          !mark &&
                            draggingShift &&
                            dropDayKey === dk &&
                            dropEmpId === emp.id &&
                            'bg-pink-100 dark:bg-pink-950 ring-2 ring-inset ring-pink-500/70'
                        )}
                        onDragOver={mark ? undefined : (e) => onDayDragOver(e, dk, emp.id)}
                        onDragLeave={
                          mark
                            ? undefined
                            : (e) => {
                                if (!e.currentTarget.contains(e.relatedTarget as Node)) clearDropHighlight();
                              }
                        }
                        onDrop={mark ? undefined : (e) => onDropDay(e, dk, emp.id)}
                      >
                        <div className="flex flex-col gap-1 min-h-[48px] min-w-0">
                          {list.map((sh, idx) => {
                            const att = state.attendance[attKey(emp.id, dk, idx)];
                            const attStatus = att ? normalizeAttStatus(att.status) : null;
                            if (statusFilter !== 'all' && attStatus !== statusFilter) return null;
                            const menuOpen = shiftMenu?.empId === emp.id && shiftMenu?.dk === dk && shiftMenu.idx === idx;
                            const conflicts = shiftConflicts.get(shiftConflictKey(emp.id, dk, idx)) || [];
                            const tip = [
                              sh.start && sh.end ? `${sh.start} – ${sh.end}` : '',
                              sh.site,
                              attStatus ? attStatusLabel(attStatus) : '',
                              conflicts.length
                                ? `${conflicts.length} shift conflict${conflicts.length === 1 ? '' : 's'}`
                                : '',
                            ]
                              .filter(Boolean)
                              .join('\n');
                            return (
                            <div key={idx} className="min-w-0">
                              <button
                                type="button"
                                draggable={!mark}
                                onDragStart={mark ? undefined : (e) => onShiftDragStart(e, emp.id, dk, idx)}
                                onDragEnd={mark ? undefined : onDragEnd}
                                className={cn(
                                  'w-full max-w-full min-w-0 overflow-hidden rounded border border-border bg-card px-1 py-1 text-left text-[9px] leading-tight shadow-sm relative',
                                  mark ? 'pointer-events-none' : 'hover:bg-muted cursor-grab active:cursor-grabbing',
                                  menuOpen && 'ring-2 ring-pink-500/60',
                                  conflicts.length > 0 && 'border-amber-500 bg-amber-50 dark:bg-amber-950'
                                )}
                                onClick={mark ? undefined : (e) => toggleShiftMenu(e, emp.id, dk, idx, list.length - idx - 1)}
                                title={tip || 'Drag to another day to move this shift'}
                              >
                                <div className="h-0.5 rounded-full mb-0.5" style={{ backgroundColor: sh.color }} />
                                {conflicts.length > 0 ? (
                                  <AlertTriangle className="absolute top-1 right-1 size-3 text-amber-600 dark:text-amber-400" />
                                ) : null}
                                <ShiftRotaSections shift={sh} attendance={att} compact />
                                {conflicts.length > 0 ? (
                                  <div className="mt-0.5 flex items-center gap-0.5 text-[8px] font-semibold text-amber-700 dark:text-amber-300">
                                    <span>
                                      {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'}
                                    </span>
                                  </div>
                                ) : null}
                              </button>
                            </div>
                            );
                          })}
                          {mark === 'removing' ? (
                            <span className="text-[9px] text-center text-red-700 dark:text-red-300 py-2">Removing</span>
                          ) : mark === 'adding' ? (
                            <span className="text-[9px] text-center text-emerald-700 dark:text-emerald-300 py-2">New day</span>
                          ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 w-full shrink-0 font-normal text-muted-foreground/80 hover:text-foreground"
                            onClick={() => openAddShift(dk, emp.id)}
                            aria-label="Add shift"
                          >
                            <Plus className="size-3 stroke-[1.5]" />
                          </Button>
                          )}
                        </div>
                      </td>
                    );
                  })}
                  <td
                    className="rota-sticky-hours sticky z-50 text-center align-top p-2 border-l border-b text-xs tabular-nums font-medium shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden isolate"
                    style={{ right: ROTA_PAY_COL_W, ...ROTA_STICKY_HOURS_BG }}
                  >
                    {formatHoursDecimal(empTotalHours(emp.id))}
                  </td>
                  <td
                    className="rota-sticky-pay sticky right-0 z-50 text-center align-top p-2 border-l border-b text-xs tabular-nums font-medium shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden isolate"
                    style={{ ...ROTA_STICKY_PAY_BG }}
                  >
                    {formatMoney(empTotalPayable(emp.id))}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-muted font-medium text-xs">
                <td
                  className="rota-sticky-emp sticky left-0 bottom-0 z-[55] p-2 border-r border-t shadow-[2px_0_8px_-2px_rgba(0,0,0,0.18),0_-2px_4px_-2px_rgba(0,0,0,0.12)] overflow-hidden isolate"
                  style={{ ...ROTA_STICKY_EMP_BG }}
                >
                  Daily total
                </td>
                {tableDays.map((dk, dayIdx) => {
                  const mark = dayEditMark(dayIdx);
                  return (
                  <td
                    key={dk}
                    className={cn(
                      'sticky bottom-0 z-30 text-center p-2 border-l border-t tabular-nums shadow-[0_-2px_4px_-2px_rgba(0,0,0,0.1)]',
                      mark === 'adding' && 'bg-emerald-100 dark:bg-emerald-950',
                      mark === 'removing' && 'bg-red-100 opacity-60 dark:bg-red-950',
                      !mark && 'bg-muted'
                    )}
                    style={{ backgroundClip: 'padding-box' }}
                  >
                    {mark === 'adding' ? '—' : formatHoursDecimal(dayTotalHours(dk))}
                  </td>
                  );
                })}
                <td
                  className="rota-sticky-hours sticky bottom-0 z-[55] text-center p-2 border-l border-t tabular-nums shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.18),0_-2px_4px_-2px_rgba(0,0,0,0.12)] overflow-hidden isolate"
                  style={{ right: ROTA_PAY_COL_W, ...ROTA_STICKY_HOURS_BG }}
                >
                  {formatHoursDecimal(totalRotaHours)}
                </td>
                <td
                  className="rota-sticky-pay sticky right-0 bottom-0 z-[55] text-center p-2 border-l border-t tabular-nums shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.18),0_-2px_4px_-2px_rgba(0,0,0,0.12)] overflow-hidden isolate"
                  style={{ ...ROTA_STICKY_PAY_BG }}
                >
                  {formatMoney(totalRotaPayable)}
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
          <div className="mx-3 mb-3 rounded-lg border bg-muted/30 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Status legend</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {STATUS_LEGEND.map(({ status, description }) => (
                <div key={status} className="flex items-start gap-2 text-xs">
                  <span className="mt-1 h-1 w-8 rounded-full shrink-0" style={{ backgroundColor: attStatusBarColor(status) }} />
                  <span>
                    <span className="font-medium">{attStatusLabel(status)}</span>
                    <span className="text-muted-foreground"> — {description}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
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
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Timeline shows shifts in chronological order along a 24-hour time flow for each day.
          </p>
          {state.days.map((dk) => {
            const dayShifts = state.employees
              .flatMap((emp) =>
                (state.shifts[emp.id]?.[dk] || []).map((sh, idx) => {
                  const [shH, shM] = (sh.start || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
                  const [eh, em] = (sh.end || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
                  let startMin = shH * 60 + shM;
                  let endMin = eh * 60 + em;
                  if (endMin <= startMin) endMin += 24 * 60;
                  return { emp, sh, idx, startMin, endMin };
                })
              )
              .sort((a, b) => a.startMin - b.startMin || a.emp.name.localeCompare(b.emp.name));
            const axisHours = [0, 6, 12, 18, 24];
            return (
              <div
                key={dk}
                className={cn(
                  'rounded-lg border bg-card transition-colors overflow-hidden',
                  (draggingShift || dragEmpId) && dropDayKey === dk && 'ring-2 ring-pink-500/70 bg-pink-50/40 dark:bg-pink-950/20'
                )}
                onDragOver={(e) => onDayDragOver(e, dk)}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) clearDropHighlight();
                }}
                onDrop={(e) => onDropDay(e, dk)}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
                  <span className="font-medium text-sm">{fmtShortDate(dk)}</span>
                  <Button type="button" variant="link" size="sm" className="h-8 text-pink-600" onClick={() => rows[0] && openAddShift(dk, rows[0].id)}>
                    Add shift
                  </Button>
                </div>
                <div className="p-3 space-y-3 overflow-x-auto">
                  <div className="relative h-6 min-w-[720px] border-b border-border">
                    {axisHours.map((h) => (
                      <div
                        key={h}
                        className="absolute top-0 bottom-0 border-l border-border/60"
                        style={{ left: `${(h / 24) * 100}%` }}
                      >
                        <span className="absolute top-0 left-1 text-[10px] text-muted-foreground tabular-nums">
                          {String(h).padStart(2, '0')}:00
                        </span>
                      </div>
                    ))}
                  </div>
                  {dayShifts.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-4 text-center">No shifts on this day.</p>
                  ) : (
                    <div className="relative min-w-[720px] space-y-2">
                      {dayShifts.map(({ emp, sh, idx, startMin, endMin }) => {
                        const left = (startMin / (24 * 60)) * 100;
                        const width = Math.max(((endMin - startMin) / (24 * 60)) * 100, 4);
                        return (
                          <div key={`${emp.id}-${idx}`} className="relative h-11">
                            <button
                              type="button"
                              draggable
                              onDragStart={(e) => onShiftDragStart(e, emp.id, dk, idx)}
                              onDragEnd={onDragEnd}
                              className="absolute top-0 h-full rounded-md border bg-card text-left px-2 py-1 text-[10px] hover:bg-muted/50 cursor-grab active:cursor-grabbing overflow-hidden shadow-sm"
                              style={{
                                left: `${Math.min(left, 96)}%`,
                                width: `${Math.min(width, 100 - Math.min(left, 96))}%`,
                                borderLeftWidth: 4,
                                borderLeftColor: sh.color || emp.avatarColor,
                              }}
                              onClick={() => openEditShift(emp.id, dk, idx)}
                              title={`${emp.name} · ${sh.start}–${sh.end}${sh.site ? ` · ${sh.site}` : ''}`}
                            >
                              <span className="font-medium block truncate">{emp.name}</span>
                              <span className="text-muted-foreground tabular-nums block truncate">
                                {sh.start}–{sh.end}
                                {sh.site ? ` · ${sh.site}` : ''}
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <button
            type="button"
            className="w-full py-3 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/40"
            onClick={() => setPickOpen(true)}
          >
            + Add guard
          </button>
        </div>
      )}

      <ShiftDialog
        open={shiftOpen}
        onOpenChange={(v) => {
          setShiftOpen(v);
          if (!v) setShiftEdit(null);
        }}
        employees={state.employees.map((e) => {
          const fromPool = pool.find((p) => p.id === e.id);
          return fromPool?.hourlyRate != null ? { ...e, hourlyRate: fromPool.hourlyRate } : e;
        })}
        defaultDk={shiftEdit?.dk ?? shiftPref.dk}
        defaultEmpId={shiftPref.empId}
        edit={shiftEdit}
        allShifts={state.shifts}
        onApply={onApplyShift}
      />

      <Dialog
        open={!!descCtx}
        onOpenChange={(v) => {
          if (!v) setDescCtx(null);
        }}
      >
        <DialogContent showCloseButton className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Description</DialogTitle>
            <DialogDescription>
              {descCtx
                ? `${state.employees.find((e) => e.id === descCtx.empId)?.name ?? 'Shift'} · ${fmtShortDate(descCtx.dk)}`
                : 'Shift details'}
            </DialogDescription>
          </DialogHeader>
          {descCtx && state.shifts[descCtx.empId]?.[descCtx.dk]?.[descCtx.idx] ? (
            <div className="space-y-3">
              <ShiftRotaSections
                shift={state.shifts[descCtx.empId][descCtx.dk][descCtx.idx]}
                attendance={state.attendance[attKey(descCtx.empId, descCtx.dk, descCtx.idx)]}
              />
              {(shiftConflicts.get(shiftConflictKey(descCtx.empId, descCtx.dk, descCtx.idx)) || []).length > 0 ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      {(shiftConflicts.get(shiftConflictKey(descCtx.empId, descCtx.dk, descCtx.idx)) || []).length}{' '}
                      shift conflict
                      {(shiftConflicts.get(shiftConflictKey(descCtx.empId, descCtx.dk, descCtx.idx)) || []).length === 1
                        ? ''
                        : 's'}
                    </span>
                  </div>
                  <ul className="mt-1.5 space-y-0.5 pl-6">
                    {(shiftConflicts.get(shiftConflictKey(descCtx.empId, descCtx.dk, descCtx.idx)) || []).map((c) => (
                      <li key={`${c.dk}-${c.idx}`}>{c.label}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Shift not found.</p>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setDescCtx(null)}>
              Close
            </Button>
            {descCtx ? (
              <Button
                type="button"
                className="bg-pink-600 hover:bg-pink-700"
                onClick={() => {
                  const { empId, dk, idx } = descCtx;
                  setDescCtx(null);
                  openEditShift(empId, dk, idx);
                }}
              >
                Edit shift
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={copyOpen}
        onOpenChange={(v) => {
          setCopyOpen(v);
          if (!v) {
            setCopyCtx(null);
            setCopyToEmployeeId(null);
          }
        }}
      >
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copy shift</DialogTitle>
          </DialogHeader>
          {copyCtx ? (
            <p className="text-xs text-muted-foreground">
              {fmtShortDate(copyCtx.dk)} · {state.employees.find((e) => e.id === copyCtx.empId)?.name ?? copyCtx.empId} ·{' '}
              {state.shifts[copyCtx.empId]?.[copyCtx.dk]?.[copyCtx.idx]
                ? `${state.shifts[copyCtx.empId][copyCtx.dk][copyCtx.idx].start}–${state.shifts[copyCtx.empId][copyCtx.dk][copyCtx.idx].end} · ${shiftSiteLine(state.shifts[copyCtx.empId][copyCtx.dk][copyCtx.idx])}`
                : ''}
            </p>
          ) : null}
          <p className="text-xs font-medium">Copy to dates (same employee)</p>
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
          <div className="max-h-40 overflow-y-auto space-y-1 border rounded-md p-2">
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
          <p className="text-xs font-medium pt-1">Copy to employee (same day)</p>
          <div className="grid gap-1 max-h-36 overflow-y-auto">
            {copyCtx
              ? state.employees
                  .filter((e) => e.id !== copyCtx.empId)
                  .map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setCopyToEmployeeId((id) => (id === e.id ? null : e.id))}
                      className={cn(
                        'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                        copyToEmployeeId === e.id ? 'border-pink-500 bg-pink-50 dark:bg-pink-950/30' : 'hover:bg-muted'
                      )}
                    >
                      <span className="size-7 rounded-full flex items-center justify-center text-[10px] text-white font-semibold shrink-0" style={{ backgroundColor: e.avatarColor }}>
                        {initials(e.name)}
                      </span>
                      <span className="truncate">{e.name}</span>
                    </button>
                  ))
              : null}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCopyTargets(new Set());
                setCopyToEmployeeId(null);
              }}
            >
              Clear
            </Button>
            <Button type="button" className="bg-pink-600 hover:bg-pink-700" onClick={doCopy}>
              Copy shift
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reorderOpen} onOpenChange={setReorderOpen}>
        <DialogContent showCloseButton className="sm:max-w-md max-h-[min(90vh,720px)] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>Employee custom order</DialogTitle>
            <DialogDescription>
              Drag rows to reorder, or use the arrows. Order is saved for this rota.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex-1 min-h-0 overflow-y-auto px-6 py-2 space-y-1">
            {orderDraft.map((id, i) => {
              const emp = state.employees.find((e) => e.id === id);
              if (!emp) return null;
              return (
                <li
                  key={id}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/x-rota-order-draft', String(i));
                    e.dataTransfer.effectAllowed = 'move';
                    setRowDragId(id);
                  }}
                  onDragEnd={() => {
                    setRowDragId(null);
                    setRowDropId(null);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (rowDropId !== id) setRowDropId(id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const fromRaw = e.dataTransfer.getData('application/x-rota-order-draft');
                    const from = fromRaw !== '' ? parseInt(fromRaw, 10) : -1;
                    setRowDropId(null);
                    setRowDragId(null);
                    if (Number.isNaN(from) || from < 0 || from === i) return;
                    setOrderDraft((d) => {
                      const n = [...d];
                      const [item] = n.splice(from, 1);
                      n.splice(i, 0, item);
                      return n;
                    });
                  }}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-2 py-2 text-sm bg-card cursor-grab active:cursor-grabbing',
                    rowDragId === id && 'opacity-50',
                    rowDropId === id && rowDragId && rowDragId !== id && 'ring-2 ring-pink-500/60'
                  )}
                >
                  <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                  <span className="size-8 rounded-full flex items-center justify-center text-[10px] text-white font-semibold shrink-0" style={{ backgroundColor: emp.avatarColor }}>
                    {initials(emp.name)}
                  </span>
                  <span className="flex-1 truncate">{emp.name}</span>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={i === 0}
                      aria-label={`Move ${emp.name} up`}
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
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      disabled={i === orderDraft.length - 1}
                      aria-label={`Move ${emp.name} down`}
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
          <DialogFooter className="shrink-0 px-6 py-4 border-t bg-muted/30">
            <Button type="button" variant="outline" onClick={() => setReorderOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-pink-600 hover:bg-pink-700" onClick={saveReorder}>
              Save order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={daysOpen}
        onOpenChange={(open) => {
          if (!open) setDaysOpen(false);
        }}
      >
        <DialogContent
          showCloseButton
          overlayClassName="bg-black/20"
          className="sm:max-w-md sm:top-auto sm:bottom-6 sm:left-auto sm:right-6 sm:translate-x-0 sm:translate-y-0"
        >
          <DialogHeader>
            <DialogTitle>Add / remove days</DialogTitle>
            <DialogDescription>
              Preview highlights on the rota: green = add, red = remove. Nothing is saved until Done.
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm tabular-nums">
            Current length: <span className="font-semibold">{pendingDayCount}</span> days
            {pendingDayCount !== daysBaselineCount ? (
              <span className="text-muted-foreground"> (was {daysBaselineCount})</span>
            ) : null}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => adjustPendingDays(1)}>
              +1 day
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => adjustPendingDays(7)}>
              +7 days
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pendingDayCount <= 1}
              onClick={() => adjustPendingDays(-1)}
            >
              −1 day
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={pendingDayCount <= 1}
              onClick={() => adjustPendingDays(-7)}
            >
              −7 days
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={pendingDayCount === daysBaselineCount}
              onClick={resetPendingDays}
            >
              Reset
            </Button>
          </div>
          <DialogFooter className="gap-2 sm:justify-between">
            <Button type="button" variant="ghost" onClick={() => setDaysOpen(false)}>
              Cancel
            </Button>
            <Button type="button" className="bg-pink-600 hover:bg-pink-700" onClick={applyPendingDays}>
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
              {viewShiftsList.map(({ dk, idx, sh }) => {
                const conflicts = shiftConflicts.get(shiftConflictKey(viewShiftsEmpId!, dk, idx)) || [];
                return (
                <li
                  key={`${dk}-${idx}`}
                  className={cn(
                    'flex items-center gap-2 rounded-lg border p-3 text-sm',
                    conflicts.length > 0 && 'border-amber-300 bg-amber-50/70 dark:bg-amber-950/30'
                  )}
                >
                  <span className="h-8 w-1 rounded-full shrink-0" style={{ backgroundColor: sh.color }} />
                  <div className="min-w-0 flex-1 overflow-hidden">
                    <div className="font-medium flex items-center gap-1.5">
                      {fmtShortDate(dk)}
                      {conflicts.length > 0 ? (
                        <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
                      ) : null}
                    </div>
                    <div className="text-xs text-muted-foreground tabular-nums truncate">
                      {sh.start} – {sh.end}
                      {sh.site ? ` · ${sh.site}` : !sh.notes ? ' · One-off' : ''}
                      {sh.label ? ` · ${sh.label}` : ''}
                    </div>
                    {sh.notes ? <div className="text-[11px] text-muted-foreground italic line-clamp-2 break-all">{sh.notes}</div> : null}
                    <div className="text-[11px] text-muted-foreground">
                      Break {(sh.breakH || 0) > 0 || (sh.breakM || 0) > 0 ? `${sh.breakH}h ${sh.breakM}m` : 'none'} ·{' '}
                      {formatHoursDecimal(calcHours(sh, state.inclBreaks))}
                      {sh.shiftRate != null ? ` · £${Number(sh.shiftRate).toFixed(2)}/hr` : ''}
                    </div>
                    {conflicts.length > 0 ? (
                      <div className="mt-1 text-[11px] font-medium text-amber-800 dark:text-amber-200">
                        Conflicts with: {conflicts.map((c) => c.label).join('; ')}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={() => {
                        setViewShiftsOpen(false);
                        startCopy(viewShiftsEmpId!, dk, idx);
                      }}
                    >
                      Copy
                    </Button>
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
                      onClick={() => openDeleteShifts(viewShiftsEmpId!, dk)}
                    >
                      Delete
                    </Button>
                  </div>
                </li>
                );
              })}
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

      <DeleteShiftsDialog
        open={deleteShiftsOpen}
        onOpenChange={(open) => {
          setDeleteShiftsOpen(open);
          if (!open) {
            setDeleteShiftsEmpId(null);
            setDeleteShiftsDayKey(null);
          }
        }}
        employeeName={deleteShiftsEmp?.name || 'Employee'}
        dayKey={deleteShiftsDayKey}
        rows={deleteShiftsRows}
        onDeleteRow={handleDeleteShiftRow}
        onDeleteAll={handleDeleteAllShifts}
      />

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

      <Dialog
        open={moveOpen}
        onOpenChange={(o) => {
          setMoveOpen(o);
          if (!o) setMoveCtx(null);
        }}
      >
        <DialogContent showCloseButton className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Move shift to another employee</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 max-h-64 overflow-y-auto">
            {moveCtx
              ? state.employees
                  .filter((e) => e.id !== moveCtx.empId)
                  .map((e) => (
                    <Button
                      key={e.id}
                      type="button"
                      variant="outline"
                      className="justify-start h-auto py-2"
                      onClick={() => {
                        moveShiftToEmployee(moveCtx.empId, moveCtx.dk, moveCtx.idx, e.id);
                        setMoveOpen(false);
                        setMoveCtx(null);
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
                  {ATT_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              {attRec.status === 'late' ? (
                <div className="space-y-1">
                  <LabelMini>Lateness (hours + minutes)</LabelMini>
                  <DurationHmField
                    aria-label="Lateness"
                    maxHours={12}
                    hours={Math.floor(Math.max(0, Number(attRec.lateMinutes) || 0) / 60)}
                    minutes={Math.max(0, Number(attRec.lateMinutes) || 0) % 60}
                    onChange={({ hours, minutes }) => {
                      const lateMinutes = hours * 60 + minutes;
                      const sh = attCtx ? state.shifts[attCtx.empId]?.[attCtx.dk]?.[attCtx.idx] : null;
                      if (!sh) {
                        setAttRec({ ...attRec, lateMinutes: lateMinutes || undefined });
                        return;
                      }
                      const scheduled = sh.scheduledStart || sh.start;
                      const next =
                        lateMinutes > 0
                          ? { ...sh, scheduledStart: scheduled, start: addMinutesToTime(scheduled, lateMinutes) }
                          : sh;
                      setAttRec({
                        ...attRec,
                        lateMinutes: lateMinutes || undefined,
                        hours: calcHours(next).toFixed(2),
                      });
                    }}
                  />
                </div>
              ) : null}
              <div className="space-y-1">
                <LabelMini>Actual hours</LabelMini>
                <Input value={attRec.hours} onChange={(e) => setAttRec({ ...attRec, hours: e.target.value })} />
              </div>
              <div className="space-y-1">
                <LabelMini>
                  Note{attRec.status !== 'on_time' ? ' (required)' : ' (optional)'}
                </LabelMini>
                <textarea
                  className="w-full min-h-[64px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={attRec.note}
                  onChange={(e) => setAttRec({ ...attRec, note: e.target.value })}
                  placeholder={attRec.status === 'on_time' ? 'Optional note' : 'Required for Late / Absent / No show'}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" className="bg-pink-600 hover:bg-pink-700" disabled={attSaving} onClick={() => void saveAtt()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={otOpen} onOpenChange={setOtOpen}>
        <DialogContent showCloseButton className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Overtime</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <LabelMini>New end time</LabelMini>
              <TimeHmField aria-label="Overtime end time" value={otEnd} onChange={setOtEnd} />
            </div>
            <div className="space-y-1">
              <LabelMini>Reason (required)</LabelMini>
              <textarea
                className="w-full min-h-[64px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={otReason}
                onChange={(e) => setOtReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" className="bg-pink-600 hover:bg-pink-700" disabled={adjSaving} onClick={() => void saveOvertime()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={efOpen} onOpenChange={setEfOpen}>
        <DialogContent showCloseButton className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Finished early</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1">
              <LabelMini>Actual end time</LabelMini>
              <TimeHmField aria-label="Early finish end time" value={efEnd} onChange={setEfEnd} />
            </div>
            <div className="space-y-1">
              <LabelMini>Reason (required)</LabelMini>
              <textarea
                className="w-full min-h-[64px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={efReason}
                onChange={(e) => setEfReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" className="bg-pink-600 hover:bg-pink-700" disabled={adjSaving} onClick={() => void saveEarlyFinish()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {typeof document !== 'undefined' && shiftMenu && shiftMenuAnchor && createPortal(
        (() => {
          const menuSh = state.shifts[shiftMenu.empId]?.[shiftMenu.dk]?.[shiftMenu.idx];
          const menuAtt = state.attendance[attKey(shiftMenu.empId, shiftMenu.dk, shiftMenu.idx)];
          const hasAttendance = !!normalizeAttStatus(menuAtt?.status);
          const menuOt = menuSh ? latestShiftAdjustment(menuSh, 'overtime') : null;
          const menuEf = menuSh ? latestShiftAdjustment(menuSh, 'early_finish') : null;
          const hasOvertime = !!(menuOt && minutesBetweenTimes(menuOt.scheduledEnd, menuOt.actualEnd) > 0);
          const hasEarlyFinish = !!(menuEf && minutesBetweenTimes(menuEf.actualEnd, menuEf.scheduledEnd) > 0);
          return (
        <div
          ref={shiftMenuPortalRef}
          className="fixed z-[200] rounded-md border border-border bg-background text-foreground shadow-xl overflow-hidden isolate py-1 text-xs"
          style={{ left: shiftMenuAnchor.x, top: shiftMenuAnchor.y, width: shiftMenuAnchor.w }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-muted"
            onClick={() => {
              closeShiftMenu();
              openShiftDescription(shiftMenu.empId, shiftMenu.dk, shiftMenu.idx);
            }}
          >
            Description
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-muted"
            onClick={() => {
              closeShiftMenu();
              openEditShift(shiftMenu.empId, shiftMenu.dk, shiftMenu.idx);
            }}
          >
            Edit
          </button>
          <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => startCopy(shiftMenu.empId, shiftMenu.dk, shiftMenu.idx)}>
            Copy shift…
          </button>
          <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => startMove(shiftMenu.empId, shiftMenu.dk, shiftMenu.idx)}>
            Move shift
          </button>
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-muted"
            onClick={() => {
              closeShiftMenu();
              openAddShift(shiftMenu.dk, shiftMenu.empId);
            }}
          >
            Add another shift
          </button>
          <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => startAtt(shiftMenu.empId, shiftMenu.dk, shiftMenu.idx)}>
            {hasAttendance ? 'Edit attendance' : 'Mark attendance'}
          </button>
          {hasAttendance ? (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive"
              onClick={() => clearShiftAttendance(shiftMenu.empId, shiftMenu.dk, shiftMenu.idx)}
            >
              Undo attendance
            </button>
          ) : null}
          <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => startOvertime(shiftMenu.empId, shiftMenu.dk, shiftMenu.idx)}>
            {hasOvertime ? 'Edit overtime' : 'Overtime'}
          </button>
          {hasOvertime ? (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive"
              onClick={() => clearShiftOvertime(shiftMenu.empId, shiftMenu.dk, shiftMenu.idx)}
            >
              Undo overtime
            </button>
          ) : null}
          <button type="button" className="w-full text-left px-3 py-1.5 hover:bg-muted" onClick={() => startEarlyFinish(shiftMenu.empId, shiftMenu.dk, shiftMenu.idx)}>
            {hasEarlyFinish ? 'Edit finished early' : 'Finished early'}
          </button>
          {hasEarlyFinish ? (
            <button
              type="button"
              className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive"
              onClick={() => clearShiftEarlyFinish(shiftMenu.empId, shiftMenu.dk, shiftMenu.idx)}
            >
              Undo finished early
            </button>
          ) : null}
          <button
            type="button"
            className="w-full text-left px-3 py-1.5 hover:bg-muted text-destructive"
            onClick={() => {
              const { empId, dk } = shiftMenu;
              openDeleteShifts(empId, dk);
            }}
          >
            Delete
          </button>
        </div>
          );
        })(),
        document.body
      )}

      {typeof document !== 'undefined' && empMenu && empMenuAnchor && createPortal(
        <div
          ref={empMenuPortalRef}
          className="fixed z-[200] rounded-md border border-border bg-background text-foreground shadow-xl overflow-hidden isolate py-1 text-sm"
          style={{ left: empMenuAnchor.x, top: empMenuAnchor.y, width: empMenuAnchor.w }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className="w-full text-left px-4 py-2.5 text-sky-600 hover:bg-muted font-medium"
            onClick={() => {
              setXferFrom(empMenu);
              setXferOpen(true);
              closeEmpMenu();
            }}
          >
            Copy shifts to another employee
          </button>
          <button type="button" className="w-full text-left px-4 py-2.5 text-sky-600 hover:bg-muted font-medium" onClick={() => openViewShifts(empMenu)}>
            Edit/view employee shifts
          </button>
          <button
            type="button"
            className="w-full text-left px-4 py-2.5 text-sky-600 hover:bg-muted font-medium"
            onClick={() => {
              setPreviewEmpId(empMenu);
              closeEmpMenu();
            }}
          >
            Shift preview
          </button>
          <button type="button" className="w-full text-left px-4 py-2.5 text-destructive hover:bg-muted font-medium" onClick={() => deleteAllEmpShifts(empMenu)}>
            Delete employee shifts
          </button>
          <button type="button" className="w-full text-left px-4 py-2.5 text-destructive hover:bg-muted font-medium" onClick={() => removeEmpFromRota(empMenu)}>
            Remove from rota
          </button>
        </div>,
        document.body
      )}

      <ShiftPreviewDialog
        open={!!previewEmpId}
        onOpenChange={(o) => !o && setPreviewEmpId(null)}
        employee={previewEmployee}
        state={state}
      />
    </div>
  );
}

function LabelMini({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-muted-foreground">{children}</label>;
}
