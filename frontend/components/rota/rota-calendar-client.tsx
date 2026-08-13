'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal, flushSync } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TimeHmField, DurationHmField } from '@/components/ui/time-hm-field';
import { useRotaShifts } from '@/contexts/rota-shifts-context';
import { attKey, addMinutesToTime, attStatusLabel, buildDayRange, buildShiftConflictMap, calcHours, countedHoursForAttendance, dateKey, fmtShortDate, formatHoursDecimal, formatMoney, initials, latestShiftAdjustment, minutesBetweenTimes, normalizeAttStatus, parseDateKey, payableHoursForAttendance, shiftConflictKey, shiftSiteLine, shiftsInTimeOrder, timeMins } from '@/lib/rota-shifts-utils';
import { downloadPlannerRotaCsv, downloadPlannerRotaPdf } from '@/lib/rota-planner-export';
import type { AttStatus, AttendanceRec, EmployeeRec, RotaViewMode, ShiftAdjustment, ShiftRec } from '@/lib/rota-shifts-types';
import type { RotaPlanListItem } from '@/lib/types';
import { ShiftDialog } from '@/components/rota/shift-dialog';
import { DeleteShiftsDialog } from '@/components/rota/delete-shifts-dialog';
import { ShiftPreviewDialog } from '@/components/rota/shift-preview-dialog';
import { RatePreviewDialog } from '@/components/rota/rate-preview-dialog';
import { ShiftRotaSections } from '@/components/rota/shift-rota-sections';
import { GuardFormWizard } from '@/app/guards/guard-form-wizard';
import { useCreateGuard } from '@/hooks/use-guards';
import { useDirectoryContractorsList } from '@/hooks/use-directory-contractors';
import { guardFormDefaults, formToGuardPayload } from '@/lib/guard-form-map';
import { guardSubmitSchema, type GuardFormData } from '@/lib/validation';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpDown,
  CalendarPlus,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  GripVertical,
  MoreHorizontal,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { addDays } from 'date-fns';

/* Rough rendered heights, used only to decide whether a menu opens down or up.
   Keep these close to reality: overestimating makes menus flip away from the
   cursor when there was actually room below. */
const SHIFT_MENU_H = 300;
const EMP_MENU_H = 348;
/* Desktop grid column widths. The same numbers are mirrored as CSS custom properties
   on `.rota-grid-table` in globals.css, which narrows them below `sm` so a phone can
   reach every column in fewer swipes. These constants stay the desktop values and are
   only used for scroll maths, which is a no-op on mobile where nothing is frozen. */
const ROTA_PAY_COL_W = 62;
const ROTA_HOURS_COL_W = 68;
const ROTA_PUBLISH_COL_W = 92;
const ROTA_EMP_COL_W = 210;
const ROTA_DAY_COL_W = 160;
/** Column widths as CSS vars so the media query in globals.css can override them. */
const COL_VAR = {
  emp: 'var(--rota-emp-w)',
  day: 'var(--rota-day-w)',
  hours: 'var(--rota-hours-w)',
  pay: 'var(--rota-pay-w)',
  publish: 'var(--rota-publish-w)',
} as const;
/** Timeline: px per hour — wide enough that the day is horizontally scrollable */
const TIMELINE_PX_PER_HOUR = 72;
const TIMELINE_WIDTH_PX = TIMELINE_PX_PER_HOUR * 24;

/** Alternating soft tints so consecutive date sections are visually distinct */
const TIMELINE_DAY_TONES = [
  {
    shell: 'border-sky-200/70 bg-sky-50/70 dark:border-sky-800/50 dark:bg-sky-950/35',
    header: 'border-sky-200/70 bg-sky-100/80 dark:border-sky-800/50 dark:bg-sky-900/50',
    accent: '#0ea5e9',
  },
  {
    shell: 'border-violet-200/70 bg-violet-50/70 dark:border-violet-800/50 dark:bg-violet-950/35',
    header: 'border-violet-200/70 bg-violet-100/80 dark:border-violet-800/50 dark:bg-violet-900/50',
    accent: '#8b5cf6',
  },
  {
    shell: 'border-emerald-200/70 bg-emerald-50/70 dark:border-emerald-800/50 dark:bg-emerald-950/35',
    header: 'border-emerald-200/70 bg-emerald-100/80 dark:border-emerald-800/50 dark:bg-emerald-900/50',
    accent: '#10b981',
  },
  {
    shell: 'border-amber-200/70 bg-amber-50/70 dark:border-amber-800/50 dark:bg-amber-950/35',
    header: 'border-amber-200/70 bg-amber-100/80 dark:border-amber-800/50 dark:bg-amber-900/50',
    accent: '#f59e0b',
  },
  {
    shell: 'border-rose-200/70 bg-rose-50/70 dark:border-rose-800/50 dark:bg-rose-950/35',
    header: 'border-rose-200/70 bg-rose-100/80 dark:border-rose-800/50 dark:bg-rose-900/50',
    accent: '#f43f5e',
  },
  {
    shell: 'border-cyan-200/70 bg-cyan-50/70 dark:border-cyan-800/50 dark:bg-cyan-950/35',
    header: 'border-cyan-200/70 bg-cyan-100/80 dark:border-cyan-800/50 dark:bg-cyan-900/50',
    accent: '#06b6d4',
  },
  {
    shell: 'border-orange-200/70 bg-orange-50/70 dark:border-orange-800/50 dark:bg-orange-950/35',
    header: 'border-orange-200/70 bg-orange-100/80 dark:border-orange-800/50 dark:bg-orange-900/50',
    accent: '#f97316',
  },
] as const;

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
const ROTA_STICKY_PUBLISH_BG = {
  backgroundColor: 'var(--rota-publish-bg)',
  backgroundClip: 'padding-box',
  isolation: 'isolate',
} as const;

const ATT_STATUS_OPTIONS: { value: AttStatus; label: string }[] = [
  { value: 'on_time', label: 'On time' },
  { value: 'late', label: 'Late' },
  { value: 'absent', label: 'Absent' },
  { value: 'no_show', label: 'No show' },
];

function EmployeeAvatar({ emp, className }: { emp: EmployeeRec; className?: string }) {
  // Initials only on the rota — staff photos belong on the staff profile / add form.
  return (
    <span
      className={cn('rounded-full shrink-0 flex items-center justify-center text-white font-semibold', className)}
      style={{ backgroundColor: emp.avatarColor }}
    >
      {initials(emp.name)}
    </span>
  );
}

/** Per-staff publish state + actions. Independent of the whole-rota toolbar buttons. */
function EmployeePublishCell({
  published,
  busy,
  disabled,
  name,
  onPublish,
  onUnpublish,
}: {
  published: boolean;
  busy: boolean;
  disabled: boolean;
  name: string;
  onPublish: () => void;
  onUnpublish: () => void;
}) {
  const btn = 'w-full rounded px-1.5 py-1 text-[10px] font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed';
  return (
    <div className="flex flex-col items-stretch gap-1">
      {/* Brand orange + check reads as "done" at a glance; draft stays deliberately quiet. */}
      <span
        className={cn(
          'flex items-center justify-center gap-0.5 rounded-full px-1.5 py-0.5 text-center text-[9px] font-bold leading-tight ring-1',
          busy
            ? 'bg-muted text-muted-foreground ring-transparent'
            : published
              ? 'bg-primary text-primary-foreground ring-primary'
              : 'bg-muted text-muted-foreground ring-border'
        )}
      >
        {busy ? null : published ? <Check className="size-2.5 shrink-0" aria-hidden /> : null}
        {busy ? 'Saving…' : published ? 'Published' : 'Draft'}
      </span>
      {/* Publish carries the brand orange like the header action; Unpublish stays
          outline so emphasis reads from fill vs outline as well as hue. */}
      <button
        type="button"
        className={cn(btn, 'bg-primary text-primary-foreground border-primary hover:bg-primary/90')}
        disabled={disabled || published}
        onClick={onPublish}
        title={published ? `${name} is already published` : `Publish ${name} only`}
        aria-label={`Publish ${name}`}
      >
        Publish
      </button>
      <button
        type="button"
        className={cn(btn, 'bg-background text-foreground border-input hover:bg-muted')}
        disabled={disabled || !published}
        onClick={onUnpublish}
        title={published ? `Unpublish ${name} only` : `${name} is not published`}
        aria-label={`Unpublish ${name}`}
      >
        Unpublish
      </button>
    </div>
  );
}

/** sm:max-w-md, plus size estimates for the first paint before the panel is measured. */
const DAYS_PANEL_EST_W = 448;
const DAYS_PANEL_EST_H = 400;

type AnchorBox = { bottom: number; left: number };

/** Drop the days panel just under the button that opened it, kept inside the viewport. */
function placeDaysPanel(anchor: AnchorBox, panelW: number, panelH: number) {
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - margin - panelW);
  const maxTop = Math.max(margin, window.innerHeight - margin - panelH);
  return {
    left: Math.min(Math.max(margin, anchor.left), maxLeft),
    top: Math.min(Math.max(margin, anchor.bottom + 8), maxTop),
  };
}

/**
 * A zero-size rect at the mouse position, so menus open next to the cursor.
 * Keyboard-activated clicks report clientX/Y of 0 — fall back to the element.
 */
function pointerRect(e: { clientX: number; clientY: number }, fallback: Element): DOMRect {
  if (!e.clientX && !e.clientY) return fallback.getBoundingClientRect();
  return new DOMRect(e.clientX, e.clientY, 0, 0);
}

/**
 * Places a menu next to `rect` (a zero-size rect at the cursor for click-opened
 * menus). It opens down-and-right of the anchor like a native context menu, and
 * only flips when that side genuinely lacks room — flipping eagerly used to throw
 * the menu hundreds of pixels away from where the user clicked.
 */
function placeMenu(rect: DOMRect, w: number, menuH: number, _preferUp?: boolean) {
  const GAP = 4;
  const M = 8; // viewport margin
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const width = Math.min(Math.max(w, 160), vw - M * 2);
  // Right of the anchor; flip left only if it would overflow, then clamp.
  let x = rect.right + GAP;
  if (x + width > vw - M) x = rect.left - width - GAP;
  x = Math.min(Math.max(M, x), Math.max(M, vw - width - M));

  // Height is an estimate, so cap it to whichever side we open into and let the
  // menu scroll internally rather than run off-screen. maxH must always describe
  // the space actually available from the chosen y, or the menu overflows.
  const below = vh - M - (rect.bottom + GAP);
  const above = rect.top - GAP - M;
  const wanted = Math.min(menuH, vh - M * 2);

  let y: number;
  let maxH: number;
  if (wanted <= below || below >= above) {
    // Open downward from the anchor — the common case, and it stays at the cursor.
    y = rect.bottom + GAP;
    maxH = Math.max(160, below);
  } else {
    // Not enough room below and more room above: bottom-align just above the anchor.
    const h = Math.min(wanted, Math.max(160, above));
    y = Math.max(M, rect.top - GAP - h);
    maxH = rect.top - GAP - y;
  }
  return { x, y, w: width, maxH };
}

export function RotaCalendarClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planIdParam = searchParams.get('id');
  const { user } = useAuth();
  const canCreateStaff = canModule(user, 'guards', 'create');
  /** Payable money is a separate permission — the column collapses entirely without it. */
  const showPayable = canModule(user, 'rota_payable', 'view');
  const payColW = showPayable ? ROTA_PAY_COL_W : 0;
  const stickyRightW = ROTA_HOURS_COL_W + payColW + ROTA_PUBLISH_COL_W;
  const createGuard = useCreateGuard();
  const { data: dirRows = [] } = useDirectoryContractorsList({ is_active: true });
  const mains = useMemo(
    () => dirRows.filter((c) => c.type === 'main').map((c) => ({ id: c.id, name: c.name })),
    [dirRows]
  );
  const subs = useMemo(
    () => dirRows.filter((c) => c.type === 'sub').map((c) => ({ id: c.id, name: c.name })),
    [dirRows]
  );
  const addStaffForm = useForm<GuardFormData>({
    resolver: zodResolver(guardSubmitSchema) as Resolver<GuardFormData>,
    defaultValues: guardFormDefaults,
  });
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
    copyShiftToTargets,
    addEmployeesById,
    refreshPool,
    removeEmployee,
    removeEmployees,
    reorderEmployees,
    setEmployeeRotaPending,
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
    saveRotaPlan,
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
  const [siblingPlans, setSiblingPlans] = useState<RotaPlanListItem[]>([]);
  const [switchingPlan, setSwitchingPlan] = useState<'prev' | 'next' | null>(null);
  const [previewEmpId, setPreviewEmpId] = useState<string | null>(null);
  const [ratePreviewEmpId, setRatePreviewEmpId] = useState<string | null>(null);
  const previewEmployee = useMemo(() => {
    if (!previewEmpId) return null;
    const emp = state.employees.find((e) => e.id === previewEmpId);
    if (!emp) return null;
    const fromPool = pool.find((p) => p.id === previewEmpId);
    return fromPool ? { ...emp, phone: emp.phone || fromPool.phone } : emp;
  }, [previewEmpId, state.employees, pool]);
  const ratePreviewEmployee = useMemo(() => {
    if (!ratePreviewEmpId) return null;
    const emp = state.employees.find((e) => e.id === ratePreviewEmpId);
    if (!emp) return null;
    const fromPool = pool.find((p) => p.id === ratePreviewEmpId);
    return fromPool
      ? { ...emp, phone: emp.phone || fromPool.phone, hourlyRate: emp.hourlyRate ?? fromPool.hourlyRate }
      : emp;
  }, [ratePreviewEmpId, state.employees, pool]);

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

  /** Backs the Previous/Next rota buttons — the list is small, so one fetch is enough. */
  useEffect(() => {
    let cancelled = false;
    void api.rotaPlans
      .list()
      .then((plans) => {
        if (!cancelled) setSiblingPlans(plans);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Neighbours in date order, which is how rotas are read — "previous" is the
   * earlier period, not the previously created record.
   */
  const { prevPlan, nextPlan } = useMemo(() => {
    const currentId = parseInt(planIdParam || '', 10);
    if (!currentId || siblingPlans.length < 2) return { prevPlan: null, nextPlan: null };
    const ordered = [...siblingPlans].sort(
      (a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id
    );
    const idx = ordered.findIndex((p) => p.id === currentId);
    if (idx === -1) return { prevPlan: null, nextPlan: null };
    return {
      prevPlan: idx > 0 ? ordered[idx - 1] : null,
      nextPlan: idx < ordered.length - 1 ? ordered[idx + 1] : null,
    };
  }, [planIdParam, siblingPlans]);

  const planRangeLabel = (plan: RotaPlanListItem) =>
    `${plan.name} · ${fmtShortDate(plan.start_date)} – ${fmtShortDate(plan.end_date)}`;

  /** Flushes the debounced autosave first so switching rotas cannot drop recent edits. */
  const goToPlan = async (plan: RotaPlanListItem | null, dir: 'prev' | 'next') => {
    if (!plan || switchingPlan) return;
    setSwitchingPlan(dir);
    try {
      await saveRotaPlan();
    } catch {
      toast.error('Could not save this rota — staying here so your changes are not lost');
      setSwitchingPlan(null);
      return;
    }
    router.push(`/rota/calendar?id=${plan.id}`);
    setSwitchingPlan(null);
  };

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
  const [copyToEmployeeIds, setCopyToEmployeeIds] = useState<Set<string>>(() => new Set());
  const [copyEmpSearch, setCopyEmpSearch] = useState('');
  const [xferOpen, setXferOpen] = useState(false);
  const [xferFrom, setXferFrom] = useState<string | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveCtx, setMoveCtx] = useState<{ empId: string; dk: string; idx: number } | null>(null);
  const [moveEmpSearch, setMoveEmpSearch] = useState('');
  const [moveTargetDate, setMoveTargetDate] = useState('');
  const [moveToEmployeeId, setMoveToEmployeeId] = useState<string | null>(null);
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
  const [daysEditEdge, setDaysEditEdge] = useState<'start' | 'end'>('end');
  /** Where the Add days button sat when clicked, so the panel opens against it. */
  const [daysAnchor, setDaysAnchor] = useState<AnchorBox | null>(null);
  const [daysPanelPos, setDaysPanelPos] = useState<{ top: number; left: number } | null>(null);
  const daysPanelRef = useRef<HTMLDivElement>(null);
  /** After Done adds days, scroll this column index into view once the table commits. */
  const scrollDayAfterApplyRef = useRef<number | null>(null);
  const timelineDayScrollRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const timelineScrolledFor = useRef<string | null>(null);
  const [nowMins, setNowMins] = useState(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  const [pickOpen, setPickOpen] = useState(false);
  const [pickSel, setPickSel] = useState<Set<string>>(new Set());
  const [pickSearch, setPickSearch] = useState('');
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [addStaffPhoto, setAddStaffPhoto] = useState<File | null>(null);
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
  const [shiftMenuAnchor, setShiftMenuAnchor] = useState<{ x: number; y: number; w: number; maxH: number } | null>(null);
  const [empMenu, setEmpMenu] = useState<string | null>(null);
  const [empMenuAnchor, setEmpMenuAnchor] = useState<{ x: number; y: number; w: number; maxH: number } | null>(null);
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
    const fn = (e?: Event) => {
      // Scrolling inside an open menu must not dismiss it.
      const t = e?.target as Node | undefined;
      if (t && (shiftMenuPortalRef.current?.contains(t) || empMenuPortalRef.current?.contains(t))) return;
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
        return;
      }
      // Delete/Backspace removes the selected shift. Ignored while typing so it
      // never eats a character out of an input, textarea or contenteditable.
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      if (!shiftMenu) return;
      const t = e.target as HTMLElement | null;
      if (t?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t?.tagName || '')) return;
      e.preventDefault();
      const { empId, dk, idx } = shiftMenu;
      closeShiftMenu();
      deleteShift(empId, dk, idx);
      toast.snack('1 shift deleted');
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [shiftMenu, empMenu, deleteShift]);

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

  /** Published count for the rows actually on screen — filters change the denominator. */
  const publishedRowCount = useMemo(
    () => rows.reduce((n, e) => n + (isEmployeePublished(e.id) ? 1 : 0), 0),
    [rows, isEmployeePublished]
  );

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

  const todayKey = dateKey(new Date());

  // Keep "now" marker fresh while timeline is open
  useEffect(() => {
    if (state.rotaView !== 'timeline') {
      timelineScrolledFor.current = null;
      return;
    }
    const tick = () => {
      const n = new Date();
      setNowMins(n.getHours() * 60 + n.getMinutes());
    };
    tick();
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [state.rotaView]);

  // Auto-scroll each day's time axis to current time (today), or to morning for other days
  useEffect(() => {
    if (state.rotaView !== 'timeline' || !state.days.length) return;
    const stamp = `${state.rotaView}:${state.days.join(',')}`;
    if (timelineScrolledFor.current === stamp) return;
    const timer = window.setTimeout(() => {
      // Re-read "now" at scroll time so we don't depend on the ticking state
      const n = new Date();
      const mins = n.getHours() * 60 + n.getMinutes();
      const today = dateKey(n);
      timelineScrolledFor.current = stamp;
      for (const dk of state.days) {
        const el = timelineDayScrollRefs.current.get(dk);
        if (!el) continue;
        const targetMins = dk === today ? mins : 8 * 60;
        const px = (targetMins / (24 * 60)) * TIMELINE_WIDTH_PX;
        const left = Math.max(0, px - el.clientWidth * 0.25);
        el.scrollTo({ left, behavior: 'smooth' });
      }
    }, 100);
    return () => window.clearTimeout(timer);
  }, [state.rotaView, state.days]);

  const meta = useMemo(() => {
    if (!state.days.length) return '';
    let days: string[];
    if (daysOpen) {
      if (daysEditEdge === 'start') {
        if (pendingDayCount >= daysBaselineCount) {
          const add = pendingDayCount - daysBaselineCount;
          const newStart = dateKey(addDays(parseDateKey(state.days[0]), -add));
          days = buildDayRange(newStart, pendingDayCount);
        } else {
          const remove = daysBaselineCount - pendingDayCount;
          days = state.days.slice(remove);
        }
      } else {
        days = buildDayRange(state.days[0], Math.max(1, pendingDayCount));
      }
    } else {
      days = state.days;
    }
    const a = fmtShortDate(days[0]);
    const b = fmtShortDate(days[days.length - 1]);
    const preview = daysOpen && pendingDayCount !== daysBaselineCount ? ' (preview)' : '';
    return `${a} – ${b} | ${days.length} days${preview} | ${state.employees.length} employees`;
  }, [state.days, state.employees.length, daysOpen, pendingDayCount, daysBaselineCount, daysEditEdge]);

  /** Days shown in the table — includes preview columns while editing length. */
  const tableDays = useMemo(() => {
    if (!state.days.length) return [] as string[];
    if (!daysOpen) return state.days;
    if (daysEditEdge === 'start') {
      if (pendingDayCount >= daysBaselineCount) {
        const add = pendingDayCount - daysBaselineCount;
        const newStart = dateKey(addDays(parseDateKey(state.days[0]), -add));
        return buildDayRange(newStart, Math.max(1, pendingDayCount));
      }
      // Removing from start — keep full baseline so leading days can show as red
      return state.days;
    }
    const len = Math.max(daysBaselineCount, pendingDayCount, 1);
    return buildDayRange(state.days[0], len);
  }, [state.days, daysOpen, daysBaselineCount, pendingDayCount, daysEditEdge]);

  const dayEditMark = useCallback(
    (index: number): 'adding' | 'removing' | null => {
      if (!daysOpen) return null;
      if (daysEditEdge === 'start') {
        if (pendingDayCount > daysBaselineCount) {
          const add = pendingDayCount - daysBaselineCount;
          return index < add ? 'adding' : null;
        }
        if (pendingDayCount < daysBaselineCount) {
          const remove = daysBaselineCount - pendingDayCount;
          return index < remove ? 'removing' : null;
        }
        return null;
      }
      if (index >= pendingDayCount) return 'removing';
      if (index >= daysBaselineCount) return 'adding';
      return null;
    },
    [daysOpen, pendingDayCount, daysBaselineCount, daysEditEdge]
  );

  /** Keep the latest preview / target day visible beside sticky Total hours / Payable cols. */
  const scrollDayColumnIntoView = useCallback((dayIndex: number) => {
    const scroller = menuRef.current;
    if (!scroller || dayIndex < 0) return;

    const cell = scroller.querySelector(`[data-rota-day-idx="${dayIndex}"]`) as HTMLElement | null;

    if (cell) {
      const scRect = scroller.getBoundingClientRect();
      const cellRect = cell.getBoundingClientRect();
      const visibleRight = scRect.right - stickyRightW;
      const visibleLeft = scRect.left + ROTA_EMP_COL_W;
      if (cellRect.right > visibleRight - 4) {
        scroller.scrollBy({ left: cellRect.right - visibleRight + 12, behavior: 'smooth' });
      } else if (cellRect.left < visibleLeft + 4) {
        scroller.scrollBy({ left: cellRect.left - visibleLeft - 12, behavior: 'smooth' });
      }
      return;
    }

    // Fallback before paint finds the cell (new columns just added)
    const targetLeft = ROTA_EMP_COL_W + dayIndex * ROTA_DAY_COL_W;
    const scrollLeft = targetLeft + ROTA_DAY_COL_W - (scroller.clientWidth - stickyRightW);
    scroller.scrollTo({ left: Math.max(0, scrollLeft), behavior: 'smooth' });
  }, [stickyRightW]);

  const openDaysEditor = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const anchor: AnchorBox = { bottom: r.bottom, left: r.left };
    setDaysAnchor(anchor);
    setDaysPanelPos(placeDaysPanel(anchor, DAYS_PANEL_EST_W, DAYS_PANEL_EST_H));
    const n = state.days.length;
    setDaysBaselineCount(n);
    setPendingDayCount(n);
    setDaysEditEdge('end');
    setDaysOpen(true);
  };

  /** Re-clamp against the panel's real size once rendered, on resize, and as it grows. */
  useEffect(() => {
    if (!daysOpen || !daysAnchor) return;
    const reposition = () => {
      const el = daysPanelRef.current;
      setDaysPanelPos(
        placeDaysPanel(
          daysAnchor,
          el?.offsetWidth || DAYS_PANEL_EST_W,
          el?.offsetHeight || DAYS_PANEL_EST_H
        )
      );
    };
    reposition();
    window.addEventListener('resize', reposition);
    return () => window.removeEventListener('resize', reposition);
  }, [daysOpen, daysAnchor, pendingDayCount, daysEditEdge]);

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
      const removing =
        daysEditEdge === 'start'
          ? state.days.slice(0, state.days.length - next)
          : state.days.slice(next);
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
            setDayCount(next, daysEditEdge);
            setDaysOpen(false);
            toast.snack(
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
    if (added > 0) {
      scrollDayAfterApplyRef.current = daysEditEdge === 'start' ? 0 : next - 1;
    }
    setDayCount(next, daysEditEdge);
    setDaysOpen(false);
    if (added > 0) {
      toast.snack(
        added === 1
          ? `Added 1 day at the ${daysEditEdge}`
          : `Added ${added} days at the ${daysEditEdge}`
      );
    } else {
      toast.snack(Math.abs(added) === 1 ? 'Removed 1 day' : `Removed ${Math.abs(added)} days`);
    }
  };

  // While previewing length changes, keep the latest add / first remove in view.
  useEffect(() => {
    if (!daysOpen) return;
    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      if (pendingDayCount > daysBaselineCount) {
        scrollDayColumnIntoView(daysEditEdge === 'start' ? 0 : pendingDayCount - 1);
      } else if (pendingDayCount < daysBaselineCount) {
        const idx =
          daysEditEdge === 'start'
            ? 0
            : Math.min(pendingDayCount, Math.max(0, tableDays.length - 1));
        scrollDayColumnIntoView(idx);
      }
    };
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(run);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(id);
    };
  }, [daysOpen, pendingDayCount, daysBaselineCount, tableDays.length, scrollDayColumnIntoView, daysEditEdge]);

  // After Done commits new days, scroll to the newest column.
  useEffect(() => {
    if (daysOpen) return;
    const idx = scrollDayAfterApplyRef.current;
    if (idx == null) return;
    scrollDayAfterApplyRef.current = null;
    const id = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => scrollDayColumnIntoView(idx));
    });
    return () => window.cancelAnimationFrame(id);
  }, [state.days.length, daysOpen, scrollDayColumnIntoView]);

  useEffect(() => {
    if (!exportMenuOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [exportMenuOpen]);

  const exportRotaCsv = useCallback(() => {
    if (!downloadPlannerRotaCsv(state, resolveShiftRate, showPayable)) {
      toast.warning('No days to export');
      return;
    }
    setExportMenuOpen(false);
    toast.snack('Rota exported as CSV');
  }, [state, resolveShiftRate, showPayable]);

  const exportRotaPdf = useCallback(async () => {
    if (!state.days.length) {
      toast.warning('No days to export');
      return;
    }
    setExporting(true);
    try {
      await downloadPlannerRotaPdf(state);
      setExportMenuOpen(false);
      toast.snack('Rota exported as PDF');
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
    setCopyToEmployeeIds(new Set());
    setCopyEmpSearch('');
    setCopyOpen(true);
  };

  /**
   * Newest staff first (rota appends on add), then filter by name/role.
   * Source employee is excluded — you can't copy a shift onto yourself.
   */
  const copyEmployeeTargets = useMemo(() => {
    if (!copyCtx) return [] as EmployeeRec[];
    const q = copyEmpSearch.trim().toLowerCase();
    return [...state.employees]
      .reverse()
      .filter((e) => e.id !== copyCtx.empId)
      .filter((e) => !q || e.name.toLowerCase().includes(q) || (e.role || '').toLowerCase().includes(q));
  }, [copyCtx, copyEmpSearch, state.employees]);

  const moveEmployeeTargets = useMemo(() => {
    if (!moveCtx) return [] as EmployeeRec[];
    const q = moveEmpSearch.trim().toLowerCase();
    return [...state.employees]
      .reverse()
      .filter((e) => e.id !== moveCtx.empId)
      .filter((e) => !q || e.name.toLowerCase().includes(q) || (e.role || '').toLowerCase().includes(q));
  }, [moveCtx, moveEmpSearch, state.employees]);

  const startMove = (empId: string, dk: string, idx: number) => {
    closeShiftMenu();
    setMoveCtx({ empId, dk, idx });
    setMoveTargetDate(dk);
    setMoveEmpSearch('');
    setMoveToEmployeeId(null);
    setMoveOpen(true);
  };

  const confirmMove = () => {
    if (!moveCtx || !moveToEmployeeId || !moveTargetDate) {
      toast.warning('Select a date and an employee to move to');
      return;
    }
    moveShiftToDay(moveCtx.empId, moveCtx.dk, moveCtx.idx, moveTargetDate, moveToEmployeeId);
    setMoveOpen(false);
    setMoveCtx(null);
    setMoveToEmployeeId(null);
    setMoveEmpSearch('');
    toast.snack('Shift moved');
  };

  /** dates × staff, so one shift can be copied across both at once. */
  const copyPlan = useMemo(() => {
    const dates = [...copyTargets];
    const emps = [...copyToEmployeeIds];
    if (!copyCtx) return { dates, emps, count: 0 };
    const dayCount = dates.length || 1;
    const empCount = emps.length || 1;
    // The source slot itself is skipped, so it never counts as a new copy.
    const hitsSource = (!dates.length || dates.includes(copyCtx.dk)) && (!emps.length || emps.includes(copyCtx.empId));
    return { dates, emps, count: dayCount * empCount - (hitsSource ? 1 : 0) };
  }, [copyTargets, copyToEmployeeIds, copyCtx]);

  const copySummary = copyPlan.count > 0
    ? `Will create ${copyPlan.count} shift${copyPlan.count === 1 ? '' : 's'}.`
    : 'Pick at least one date or staff member.';

  const doCopy = () => {
    if (!copyCtx) return;
    if (copyPlan.count <= 0) {
      toast.warning('Select dates and/or staff to copy to');
      return;
    }
    copyShiftToTargets(copyCtx.empId, copyCtx.dk, copyCtx.idx, copyPlan.emps, copyPlan.dates);
    setCopyOpen(false);
    setCopyCtx(null);
    setCopyToEmployeeIds(new Set());
    setCopyTargets(new Set());
    toast.snack(copyPlan.count === 1 ? 'Shift copied' : `${copyPlan.count} shifts created`);
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
    const published = isEmployeePublished(attCtx.empId);
    const guardId = parseInt(attCtx.empId, 10);

    if (rec.status === 'late' && lateM > 0) {
      const scheduled = sh.scheduledStart || sh.start;
      const newStart = addMinutesToTime(scheduled, lateM);
      rec = { ...rec, status: 'late', lateMinutes: lateM };
      nextShift = { ...sh, scheduledStart: scheduled, start: newStart };
      rec.hours = calcHours(nextShift).toFixed(2);
      flushSync(() => updateShift(attCtx.empId, attCtx.dk, attCtx.idx, nextShift));
    } else if (rec.status !== 'late' && sh.scheduledStart) {
      nextShift = { ...sh, start: sh.scheduledStart, scheduledStart: undefined };
      rec = { ...rec, lateMinutes: undefined, synced: undefined };
      flushSync(() => updateShift(attCtx.empId, attCtx.dk, attCtx.idx, nextShift));
    } else if (rec.status === 'late' && lateM <= 0) {
      rec = { ...rec, lateMinutes: undefined };
    } else {
      rec = { ...rec, lateMinutes: rec.status === 'late' ? lateM || undefined : undefined };
    }

    // Persist resolved rate onto shift so Payable stays correct after save
    if ((rec.status === 'on_time' || rec.status === 'late') && !(Number(nextShift.shiftRate) > 0)) {
      const rate = resolveShiftRate(nextShift, attCtx.empId);
      if (rate > 0) {
        nextShift = { ...nextShift, shiftRate: rate };
        flushSync(() => updateShift(attCtx.empId, attCtx.dk, attCtx.idx, nextShift));
      }
    }

    if (published && guardId) {
      setAttSaving(true);
      try {
        // Flush planner then re-publish this staff so new/edited shifts have assignments.
        await saveRotaPlan();
        await publishRota(guardId);

        const lookupStarts = Array.from(
          new Set(
            [nextShift.scheduledStart || nextShift.start, nextShift.start, sh.scheduledStart || sh.start, sh.start]
              .map((t) => (t || '').trim())
              .filter(Boolean)
          )
        );
        const siteName = (nextShift.site || sh.site || '').trim();

        if (rec.status === 'late' && lateM > 0) {
          let lateOk = false;
          let lateErr: unknown;
          for (const start of lookupStarts) {
            try {
              await api.assignments.latenessByShift({
                guard_id: guardId,
                date: attCtx.dk,
                shift_start: start,
                site_name: siteName,
                late_minutes: lateM,
                note: noteTrimmed || undefined,
              });
              lateOk = true;
              break;
            } catch (e) {
              lateErr = e;
            }
          }
          if (!lateOk) {
            throw lateErr instanceof Error ? lateErr : new Error('Failed to record lateness');
          }
        }

        let attOk = false;
        let attErr: unknown;
        for (const start of lookupStarts) {
          try {
            await api.attendance.upsertByShift({
              guard_id: guardId,
              date: attCtx.dk,
              shift_start: start,
              site_name: siteName,
              status: rec.status,
              note: rec.note || undefined,
              hours: rec.hours,
            });
            attOk = true;
            break;
          } catch (e) {
            attErr = e;
          }
        }
        if (!attOk) {
          throw attErr instanceof Error ? attErr : new Error('Failed to sync attendance');
        }
        rec.synced = true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed to sync attendance');
        setAttSaving(false);
        return;
      }
      setAttSaving(false);
    }

    setAttendance(k, rec);
    setAttOpen(false);
    toast.snack('Attendance saved');
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
      toast.snack('Attendance removed');
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
      toast.snack('Overtime removed');
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
      toast.snack('Early finish removed');
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
            toast.snack('Early finish removed — enter an overtime end time');
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
            toast.snack('Overtime removed — enter a finish time earlier than scheduled end');
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
      toast.snack('Overtime recorded');
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
      toast.snack('Early finish recorded');
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
            ? `${skipped} shift(s) skipped — check site names or site plan quota`
            : 'Nothing was saved'
        );
      } else {
        toast.snack(
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
      toast.snack('Unpublished for this employee');
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
          toast.snack('Rota unpublished');
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
      toast.snack('Rota name updated');
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

  const sortOrderDraftAlphabetically = () => {
    const byId = new Map(state.employees.map((e) => [e.id, e.name]));
    setOrderDraft((ids) =>
      [...ids].sort((a, b) => {
        const na = (byId.get(a) || '').toLocaleLowerCase();
        const nb = (byId.get(b) || '').toLocaleLowerCase();
        return na.localeCompare(nb, undefined, { sensitivity: 'base' });
      })
    );
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
    toast.snack('1 shift deleted');
    if (deleteShiftsRows.length <= 1) {
      setDeleteShiftsOpen(false);
      setDeleteShiftsEmpId(null);
      setDeleteShiftsDayKey(null);
      if (viewShiftsEmpId === deleteShiftsEmpId) setViewShiftsOpen(false);
    }
  };

  const handleDeleteAllShifts = () => {
    if (!deleteShiftsEmpId) return;
    const count = deleteShiftsDayKey
      ? (state.shifts[deleteShiftsEmpId]?.[deleteShiftsDayKey] || []).length
      : Object.values(state.shifts[deleteShiftsEmpId] || {}).reduce((n, list) => n + list.length, 0);
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
    toast.snack(count === 1 ? '1 shift deleted' : `${count} shifts deleted`);
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
      if (ratePreviewEmpId === empId) setRatePreviewEmpId(null);
      toast.snack('Employee removed from rota');
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
      if (ratePreviewEmpId && ids.includes(ratePreviewEmpId)) setRatePreviewEmpId(null);
      toast.snack(ids.length === 1 ? 'Employee removed from rota' : `${ids.length} employees removed from rota`);
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
    toast.snack('Shift moved');
  };

  /**
   * Opens the shift menu at the pointer. Anchoring to the tile put the menu far
   * from the click on wide tiles, so we use the cursor position instead.
   */
  const openShiftMenuAt = (
    e: React.MouseEvent<HTMLElement>,
    empId: string,
    dk: string,
    idx: number,
    shiftsBelow: number
  ) => {
    const rect = pointerRect(e, e.currentTarget);
    closeEmpMenu();
    setShiftMenu({ empId, dk, idx });
    setShiftMenuAnchor(placeMenu(rect, 192, SHIFT_MENU_H, shiftsBelow > 0));
  };

  const toggleShiftMenu = (e: React.MouseEvent<HTMLButtonElement>, empId: string, dk: string, idx: number, shiftsBelow: number) => {
    const open = shiftMenu?.empId === empId && shiftMenu?.dk === dk && shiftMenu?.idx === idx;
    if (open) {
      closeShiftMenu();
      return;
    }
    openShiftMenuAt(e, empId, dk, idx, shiftsBelow);
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
      <div className="flex flex-1 items-center justify-center gap-2 px-4 py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
        Loading rota…
      </div>
    );
  }

  if (!state.days.length) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
        <p className="text-muted-foreground">No rota loaded yet.</p>
        <Button asChild>
          <Link href="/rota/create">Create a rota</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full max-w-none flex-1 flex-col gap-3 overflow-hidden px-3 py-3 sm:gap-4 sm:px-4 sm:py-4 lg:px-5 lg:py-5 xl:px-6">
      <div className="flex shrink-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-1">
          <Button variant="ghost" size="sm" className="-ml-2 h-8" type="button" onClick={() => router.push('/rota')}>
            <ArrowLeft className="size-4 mr-1" />
            Back
          </Button>
          <div className="group flex min-w-0 max-w-full items-center gap-2 sm:max-w-2xl">
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
          {nameEditing ? (
            <p className="text-xs text-muted-foreground">
              Press Enter to save the new name, or Esc to cancel.
            </p>
          ) : null}
          <p className="text-sm text-muted-foreground">{meta}</p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button variant="outline" size="sm" asChild>
            <Link href="/rota/attendance-report">Attendance report</Link>
          </Button>
        </div>
      </div>

      {shiftCount === 0 && state.employees.length > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          This rota has staff but no shifts yet. Click <strong>+</strong> in a day cell to add a shift, then click <strong>Publish</strong> to save to Assignments.
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" type="button" onClick={() => setPickOpen(true)}>
            Add Staff
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
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => void goToPlan(prevPlan, 'prev')}
            disabled={!prevPlan || !!switchingPlan}
            title={prevPlan ? `Open ${planRangeLabel(prevPlan)}` : 'No earlier rota'}
          >
            {switchingPlan === 'prev' ? (
              <Loader2 className="size-3.5 mr-1 animate-spin" />
            ) : (
              <ChevronLeft className="size-3.5 mr-1" />
            )}
            View Previous Rota
          </Button>
          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={() => void goToPlan(nextPlan, 'next')}
            disabled={!nextPlan || !!switchingPlan}
            title={nextPlan ? `Open ${planRangeLabel(nextPlan)}` : 'No later rota'}
          >
            View Next Rota
            {switchingPlan === 'next' ? (
              <Loader2 className="size-3.5 ml-1 animate-spin" />
            ) : (
              <ChevronRight className="size-3.5 ml-1" />
            )}
          </Button>
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
          <select
            className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | AttStatus)}
            aria-label="Status"
          >
            <option value="all">Status: All</option>
            {ATT_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                Status: {o.label}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            type="button"
            onClick={publish}
            disabled={publishing || unpublishing}
          >
            {publishing ? 'Publishing…' : 'Publish'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            type="button"
            onClick={unpublishAll}
            disabled={unpublishing || publishing || publishedGuardIds.size === 0}
          >
            {unpublishing ? 'Unpublishing…' : 'Unpublish'}
          </Button>
          <span className="text-xs rounded-full bg-sky-100 dark:bg-sky-950/50 text-sky-900 dark:text-sky-100 px-2 py-1 tabular-nums">
            Total {formatHoursDecimal(totalRotaHours)}
            <span className="text-muted-foreground font-normal ml-1">
              ({state.inclBreaks ? 'incl. breaks' : 'excl. breaks'})
            </span>
          </span>
          {showPayable ? (
            <span className="text-xs rounded-full bg-emerald-100 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-100 px-2 py-1 tabular-nums">
              Payable {formatMoney(totalRotaPayable)}
            </span>
          ) : null}
        </div>
      </div>

      {state.rotaView === 'table' && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
          {daysOpen ? (
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b bg-muted/40 px-3 py-2 text-xs">
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
            className="rota-grid-scroll min-h-[min(50vh,420px)] flex-1 sm:min-h-[min(60vh,520px)] lg:min-h-0"
            ref={menuRef}
          >
          <table
            className="rota-grid-table w-full table-fixed border-separate border-spacing-0 text-sm"
            style={{
              // Widths come from CSS vars so the mobile media query can shrink the
              // whole grid in one place and keep min-width in step with the columns.
              minWidth: `calc(${COL_VAR.emp} + ${tableDays.length} * ${COL_VAR.day} + ${COL_VAR.hours}${
                showPayable ? ` + ${COL_VAR.pay}` : ''
              } + ${COL_VAR.publish})`,
              width: '100%',
            }}
          >
            <colgroup>
              <col style={{ width: COL_VAR.emp, minWidth: COL_VAR.emp }} />
              {tableDays.map((dk) => (
                <col key={dk} style={{ width: COL_VAR.day, minWidth: COL_VAR.day }} />
              ))}
              <col style={{ width: COL_VAR.hours, minWidth: COL_VAR.hours }} />
              {showPayable ? <col style={{ width: COL_VAR.pay, minWidth: COL_VAR.pay }} /> : null}
              <col style={{ width: COL_VAR.publish, minWidth: COL_VAR.publish }} />
            </colgroup>
            <thead>
              <tr>
                <th
                  className="rota-sticky-emp sticky top-0 left-0 z-[70] p-2 text-left align-top border-b border-r shadow-[2px_2px_8px_-2px_rgba(0,0,0,0.2)] overflow-hidden isolate"
                  style={{ ...ROTA_STICKY_EMP_BG }}
                >
                  <div className="flex items-start justify-start gap-1.5 mb-2 min-w-0 w-full">
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
                    <Input
                      placeholder="Name, job title…"
                      value={empFilter}
                      onChange={(e) => setEmpFilter(e.target.value)}
                      className="h-8 text-xs flex-1 min-w-0 text-left"
                    />
                  </div>
                  <button
                    type="button"
                    className="text-xs text-pink-600 dark:text-pink-300 font-medium hover:underline"
                    onClick={openReorder}
                  >
                    ⇅ Employee custom order
                  </button>
                  <p className="text-[10px] text-muted-foreground mt-1">Publish each staff in the Status column</p>
                  <p className="text-[10px] text-muted-foreground">Or drag the ⋮⋮ handle on a row</p>
                </th>
                {tableDays.map((dk, dayIdx) => {
                  const mark = dayEditMark(dayIdx);
                  return (
                  <th
                    key={dk}
                    data-rota-day-idx={dayIdx}
                    className={cn(
                      'sticky top-0 z-30 p-1.5 text-center text-[13px] font-medium border-l border-b whitespace-nowrap overflow-hidden text-ellipsis shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1)]',
                      mark === 'adding' && 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100',
                      mark === 'removing' && 'bg-red-100 text-red-900 line-through dark:bg-red-950 dark:text-red-100',
                      !mark && 'rota-day-header'
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
                  className="rota-sticky-hours sticky top-0 z-[60] p-1.5 text-center text-[11px] border-l border-b align-top shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1),-2px_0_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden isolate"
                  style={{ right: `calc(${COL_VAR.publish}${showPayable ? ` + ${COL_VAR.pay}` : ''})`, ...ROTA_STICKY_HOURS_BG }}
                >
                  <div className="font-semibold leading-tight">Total hours</div>
                  <label className="mt-1 flex items-start justify-center gap-1 font-normal text-[9px] leading-tight text-muted-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      className="size-3 shrink-0 rounded border-input"
                      checked={state.inclBreaks}
                      onChange={(e) => setInclBreaks(e.target.checked)}
                    />
                    Incl. breaks?
                  </label>
                </th>
                {showPayable ? (
                  <th
                    className="rota-sticky-pay sticky top-0 z-[60] p-1.5 text-center text-[11px] border-l border-b align-top shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1),-2px_0_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden isolate"
                    style={{ right: COL_VAR.publish, ...ROTA_STICKY_PAY_BG }}
                  >
                    <div className="font-semibold leading-tight">Payable</div>
                  </th>
                ) : null}
                <th
                  className="rota-sticky-publish sticky top-0 right-0 z-[60] p-1.5 text-center text-[11px] border-l border-b align-top shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1),-2px_0_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden isolate"
                  style={{ ...ROTA_STICKY_PUBLISH_BG }}
                >
                  <div className="font-semibold leading-tight">Status</div>
                  <p
                    className={cn(
                      'mt-1 font-semibold text-[9px] leading-tight tabular-nums',
                      publishedRowCount > 0 && publishedRowCount === rows.length
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-muted-foreground'
                    )}
                  >
                    {publishedRowCount}/{rows.length} published
                  </p>
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
                    (empHasConflict(emp.id) || emp.rotaPending) && 'bg-amber-50 dark:bg-amber-950',
                    rowDragId === emp.id && 'opacity-50',
                    rowDropId === emp.id && rowDragId && rowDragId !== emp.id && 'ring-2 ring-inset ring-pink-500/70'
                  )}
                  onDragOver={(e) => onRowReorderDragOver(e, emp.id)}
                  onDrop={(e) => onRowReorderDrop(e, emp.id)}
                >
                  <td
                    className={cn(
                      'rota-sticky-emp sticky left-0 z-50 p-2 align-top border-r border-b shadow-[2px_0_8px_-2px_rgba(0,0,0,0.18)] isolate',
                      emp.rotaPending && 'border-amber-500',
                      // Published marker lives on the sticky name cell so it stays
                      // visible however far the grid is scrolled sideways.
                      isEmployeePublished(emp.id) &&
                        'border-l-[3px] border-l-emerald-500 dark:border-l-emerald-400'
                    )}
                    style={
                      {
                        ['--rota-emp-cell-bg' as string]:
                          employeeSelectMode && selectedEmpIds.has(emp.id)
                            ? 'var(--muted)'
                            : empHasConflict(emp.id) || emp.rotaPending
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
                      <div className="flex-1 min-w-0">
                        <button
                          type="button"
                          className={cn(
                            'flex gap-1.5 text-left w-full min-w-0 rounded-md hover:bg-muted/60 p-1 -m-1',
                            emp.rotaPending && 'border border-amber-500 bg-amber-50 dark:bg-amber-950'
                          )}
                          onClick={(e) => toggleEmpMenu(e, emp.id)}
                        >
                          <EmployeeAvatar emp={emp} className="size-9 text-[11px] shrink-0" />
                          <span className="min-w-0 flex-1">
                            {/* Block (not flex) so a long name wraps across lines and the
                                warning icon flows inline after it rather than squashing it. */}
                            <span className="text-[13px] font-semibold block break-words whitespace-normal leading-snug">
                              {emp.name}
                              {empHasConflict(emp.id) || emp.rotaPending ? (
                                <AlertTriangle
                                  className="inline size-3.5 ml-1 -mt-0.5 align-middle text-amber-600 dark:text-amber-400"
                                  aria-label={emp.rotaPending ? 'Rota pending' : 'Has shift conflicts'}
                                />
                              ) : null}
                            </span>
                            <span className="text-[11px] text-muted-foreground block break-words leading-tight">{emp.role}</span>
                            {emp.rotaPending ? (
                              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">Pending</span>
                            ) : null}
                          </span>
                          <MoreHorizontal className="size-3.5 shrink-0 text-muted-foreground mt-0.5" />
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
                        <div className="flex flex-col gap-1 min-h-[72px] min-w-0">
                          {shiftsInTimeOrder(list).map(({ shift: sh, idx }) => {
                            const att = state.attendance[attKey(emp.id, dk, idx)];
                            const attStatus = att ? normalizeAttStatus(att.status) : null;
                            if (statusFilter !== 'all' && attStatus !== statusFilter) return null;
                            const menuOpen = shiftMenu?.empId === emp.id && shiftMenu?.dk === dk && shiftMenu.idx === idx;
                            const conflicts = shiftConflicts.get(shiftConflictKey(emp.id, dk, idx)) || [];
                            const tip = [
                              sh.start && sh.end ? `${sh.start} – ${sh.end}` : '',
                              sh.site,
                              (sh.notes || '').trim() || (sh.label || '').trim(),
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
                                  'w-full max-w-full min-w-0 overflow-hidden rounded border border-border bg-card px-1 py-1 text-left text-[10px] leading-tight shadow-sm relative',
                                  mark ? 'pointer-events-none' : 'hover:bg-muted cursor-grab active:cursor-grabbing',
                                  menuOpen && 'ring-2 ring-pink-500/60',
                                  conflicts.length > 0 && 'border-amber-500 bg-amber-50 dark:bg-amber-950'
                                )}
                                onClick={mark ? undefined : (e) => toggleShiftMenu(e, emp.id, dk, idx, list.length - idx - 1)}
                                onContextMenu={
                                  mark
                                    ? undefined
                                    : (e) => {
                                        e.preventDefault();
                                        openShiftMenuAt(e, emp.id, dk, idx, list.length - idx - 1);
                                      }
                                }
                                title={tip || 'Drag to another day to move this shift'}
                              >
                                <div className="h-1 rounded-full mb-1" style={{ backgroundColor: sh.color }} />
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
                    className="rota-sticky-hours sticky z-50 text-center align-top p-1.5 border-l border-b text-[11px] tabular-nums font-medium shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden isolate"
                    style={{ right: `calc(${COL_VAR.publish}${showPayable ? ` + ${COL_VAR.pay}` : ''})`, ...ROTA_STICKY_HOURS_BG }}
                  >
                    {formatHoursDecimal(empTotalHours(emp.id))}
                  </td>
                  {showPayable ? (
                    <td
                      className="rota-sticky-pay sticky z-50 text-center align-top p-1.5 border-l border-b text-[11px] tabular-nums font-medium shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden isolate"
                      style={{ right: COL_VAR.publish, ...ROTA_STICKY_PAY_BG }}
                    >
                      {formatMoney(empTotalPayable(emp.id))}
                    </td>
                  ) : null}
                  <td
                    className="rota-sticky-publish sticky right-0 z-50 align-top p-1.5 border-l border-b shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.18)] overflow-hidden isolate"
                    style={{ ...ROTA_STICKY_PUBLISH_BG }}
                  >
                    <EmployeePublishCell
                      published={isEmployeePublished(emp.id)}
                      busy={publishingEmpId === emp.id}
                      disabled={publishingEmpId === emp.id || publishing || unpublishing}
                      name={emp.name}
                      onPublish={() => toggleEmployeePublished(emp, true)}
                      onUnpublish={() => toggleEmployeePublished(emp, false)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-medium text-xs">
                <td
                  className="rota-sticky-emp sticky left-0 bottom-0 z-[55] p-2 border-r border-t text-center shadow-[2px_0_8px_-2px_rgba(0,0,0,0.18),0_-2px_4px_-2px_rgba(0,0,0,0.12)] overflow-hidden isolate"
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
                      !mark && 'rota-day-total'
                    )}
                    style={{ backgroundClip: 'padding-box' }}
                  >
                    {mark === 'adding' ? '—' : formatHoursDecimal(dayTotalHours(dk))}
                  </td>
                  );
                })}
                <td
                  className="rota-sticky-hours sticky bottom-0 z-[55] text-center p-1.5 border-l border-t tabular-nums shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.18),0_-2px_4px_-2px_rgba(0,0,0,0.12)] overflow-hidden isolate"
                  style={{ right: `calc(${COL_VAR.publish}${showPayable ? ` + ${COL_VAR.pay}` : ''})`, ...ROTA_STICKY_HOURS_BG }}
                >
                  {formatHoursDecimal(totalRotaHours)}
                </td>
                {showPayable ? (
                  <td
                    className="rota-sticky-pay sticky bottom-0 z-[55] text-center p-1.5 border-l border-t tabular-nums shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.18),0_-2px_4px_-2px_rgba(0,0,0,0.12)] overflow-hidden isolate"
                    style={{ right: COL_VAR.publish, ...ROTA_STICKY_PAY_BG }}
                  >
                    {formatMoney(totalRotaPayable)}
                  </td>
                ) : null}
                <td
                  className="rota-sticky-publish sticky right-0 bottom-0 z-[55] text-center p-1.5 border-l border-t text-[10px] font-normal text-muted-foreground shadow-[-2px_0_8px_-2px_rgba(0,0,0,0.18),0_-2px_4px_-2px_rgba(0,0,0,0.12)] overflow-hidden isolate"
                  style={{ ...ROTA_STICKY_PUBLISH_BG }}
                >
                  {publishedRowCount}/{rows.length} published
                </td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>
      )}

      {state.rotaView === 'timeline' && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card">
          <div className="rota-grid-scroll min-h-[min(50vh,420px)] flex-1 space-y-3 p-3 sm:min-h-[min(60vh,520px)] lg:min-h-0">
            <p className="text-xs text-muted-foreground shrink-0">
              Scroll each day left/right along the 24-hour axis. Today auto-scrolls to the current time.
            </p>
            {state.days.map((dk, dayIdx) => {
              const tone = TIMELINE_DAY_TONES[dayIdx % TIMELINE_DAY_TONES.length];
              const isToday = dk === todayKey;
              const dayShifts = state.employees
                .flatMap((emp) =>
                  (state.shifts[emp.id]?.[dk] || []).map((sh, idx) => {
                    const [shH, shM] = (sh.start || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
                    const [eh, em] = (sh.end || '00:00').split(':').map((n) => parseInt(n, 10) || 0);
                    const startMin = shH * 60 + shM;
                    let endMin = eh * 60 + em;
                    if (endMin <= startMin) endMin += 24 * 60;
                    return { emp, sh, idx, startMin, endMin };
                  })
                )
                .sort((a, b) => a.startMin - b.startMin || a.emp.name.localeCompare(b.emp.name));
              const axisHours = Array.from({ length: 25 }, (_, h) => h);
              const nowLeftPx = (nowMins / (24 * 60)) * TIMELINE_WIDTH_PX;
              return (
                <div
                  key={dk}
                  className={cn(
                    'rounded-lg border transition-colors',
                    tone.shell,
                    (draggingShift || dragEmpId) && dropDayKey === dk && 'ring-2 ring-pink-500/70'
                  )}
                  onDragOver={(e) => onDayDragOver(e, dk)}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) clearDropHighlight();
                  }}
                  onDrop={(e) => onDropDay(e, dk)}
                >
                  <div className={cn('flex items-center justify-between px-3 py-2 border-b', tone.header)}>
                    <span className="font-medium text-sm flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: tone.accent }}
                        aria-hidden
                      />
                      {fmtShortDate(dk)}
                      {isToday ? (
                        <span className="text-[10px] font-semibold uppercase tracking-wide rounded px-1.5 py-0.5 bg-primary text-primary-foreground">
                          Today
                        </span>
                      ) : null}
                    </span>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-8 text-pink-600"
                      onClick={() => rows[0] && openAddShift(dk, rows[0].id)}
                    >
                      Add shift
                    </Button>
                  </div>
                  <div
                    className="overflow-x-scroll overflow-y-hidden overscroll-x-contain p-3 [scrollbar-gutter:stable] [scrollbar-width:auto]"
                    ref={(el) => {
                      if (el) timelineDayScrollRefs.current.set(dk, el);
                      else timelineDayScrollRefs.current.delete(dk);
                    }}
                  >
                    <div className="relative space-y-3" style={{ width: TIMELINE_WIDTH_PX }}>
                      <div className="relative h-6 border-b border-border/70">
                        {axisHours.map((h) => (
                          <div
                            key={h}
                            className="absolute top-0 bottom-0 border-l border-border/50"
                            style={{ left: (h / 24) * TIMELINE_WIDTH_PX }}
                          >
                            <span className="absolute top-0 left-1 text-[10px] text-muted-foreground tabular-nums whitespace-nowrap">
                              {String(h).padStart(2, '0')}:00
                            </span>
                          </div>
                        ))}
                        {isToday ? (
                          <div
                            className="pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 bg-primary"
                            style={{ left: nowLeftPx }}
                            title="Current time"
                          >
                            <span className="absolute -top-0.5 left-1/2 -translate-x-1/2 rounded bg-primary px-1 text-[9px] font-semibold text-primary-foreground whitespace-nowrap">
                              Now
                            </span>
                          </div>
                        ) : null}
                      </div>
                      {dayShifts.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-4 text-center">No shifts on this day.</p>
                      ) : (
                        <div className="relative space-y-2">
                          {dayShifts.map(({ emp, sh, idx, startMin, endMin }) => {
                            const left = (startMin / (24 * 60)) * TIMELINE_WIDTH_PX;
                            const width = Math.max(((endMin - startMin) / (24 * 60)) * TIMELINE_WIDTH_PX, 48);
                            return (
                              <div key={`${emp.id}-${idx}`} className="relative h-14">
                                <button
                                  type="button"
                                  draggable
                                  onDragStart={(e) => onShiftDragStart(e, emp.id, dk, idx)}
                                  onDragEnd={onDragEnd}
                                  className="absolute top-0 h-full rounded-md border bg-card/95 text-left px-2 py-1 text-[10px] hover:bg-muted/50 cursor-grab active:cursor-grabbing overflow-hidden shadow-sm"
                                  style={{
                                    left,
                                    width,
                                    borderLeftWidth: 4,
                                    borderLeftColor: sh.color || emp.avatarColor,
                                  }}
                                  onClick={() => openEditShift(emp.id, dk, idx)}
                                  title={`${emp.name}${emp.role ? ` · ${emp.role}` : ''} · ${sh.start}–${sh.end}${sh.site ? ` · ${sh.site}` : ''}`}
                                >
                                  <span className="font-medium block truncate leading-tight">{emp.name}</span>
                                  {emp.role ? (
                                    <span className="text-muted-foreground block truncate leading-tight">{emp.role}</span>
                                  ) : null}
                                  <span className="text-muted-foreground tabular-nums block truncate leading-tight">
                                    {sh.start}–{sh.end}
                                    {sh.site ? ` · ${sh.site}` : ''}
                                  </span>
                                </button>
                                {isToday ? (
                                  <div
                                    className="pointer-events-none absolute inset-y-0 z-[5] w-0.5 bg-pink-500/70"
                                    style={{ left: nowLeftPx }}
                                    aria-hidden
                                  />
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            <button
              type="button"
              className="w-full py-3 rounded-lg border border-dashed text-sm text-muted-foreground hover:bg-muted/40"
              onClick={() => setPickOpen(true)}
            >
              + Add Staff
            </button>
          </div>
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
            setCopyToEmployeeIds(new Set());
            setCopyTargets(new Set());
            setCopyEmpSearch('');
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
          <p className="text-xs font-medium">
            Copy to dates <span className="font-normal text-muted-foreground">(leave empty to keep the same day)</span>
          </p>
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
          <div className="flex items-baseline justify-between gap-2 pt-1">
            <p className="text-xs font-medium">
              Copy to staff <span className="font-normal text-muted-foreground">(leave empty to keep the same person)</span>
            </p>
            {copyToEmployeeIds.size > 0 ? (
              <button
                type="button"
                className="text-[11px] text-muted-foreground hover:text-foreground underline"
                onClick={() => setCopyToEmployeeIds(new Set())}
              >
                Clear {copyToEmployeeIds.size}
              </button>
            ) : null}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={copyEmpSearch}
              onChange={(e) => setCopyEmpSearch(e.target.value)}
              placeholder="Search staff…"
              className="h-8 pl-8 text-xs"
              aria-label="Search staff"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setCopyToEmployeeIds(new Set(copyEmployeeTargets.map((e) => e.id)))}
            >
              Select all shown
            </Button>
          </div>
          <div className="grid gap-1 max-h-36 overflow-y-auto">
            {copyEmployeeTargets.length === 0 ? (
              <p className="px-1 py-2 text-xs text-muted-foreground">
                {copyEmpSearch.trim() ? 'No staff match that search.' : 'No other staff on this rota.'}
              </p>
            ) : (
              copyEmployeeTargets.map((e) => {
                const picked = copyToEmployeeIds.has(e.id);
                return (
                  <button
                    key={e.id}
                    type="button"
                    aria-pressed={picked}
                    onClick={() =>
                      setCopyToEmployeeIds((prev) => {
                        const n = new Set(prev);
                        if (n.has(e.id)) n.delete(e.id);
                        else n.add(e.id);
                        return n;
                      })
                    }
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors',
                      picked ? 'border-pink-500 bg-pink-50 dark:bg-pink-950/30' : 'hover:bg-muted'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={picked}
                      readOnly
                      tabIndex={-1}
                      className="size-3.5 shrink-0 rounded border-input pointer-events-none"
                    />
                    <EmployeeAvatar emp={e} className="size-7 text-[10px] shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="truncate block">{e.name}</span>
                      {e.role ? <span className="truncate block text-[10px] text-muted-foreground">{e.role}</span> : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">{copySummary}</p>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCopyTargets(new Set());
                setCopyToEmployeeIds(new Set());
              }}
            >
              Clear
            </Button>
            <Button type="button" onClick={doCopy}>
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
            <div className="pt-2">
              <Button type="button" variant="outline" size="sm" className="h-8" onClick={sortOrderDraftAlphabetically}>
                Arrange A–Z
              </Button>
            </div>
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
                  <span className="flex-1 min-w-0">
                    <span className="block truncate font-medium">{emp.name}</span>
                    {emp.role ? (
                      <span className="block truncate text-[11px] text-muted-foreground">{emp.role}</span>
                    ) : null}
                  </span>
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
            <Button type="button" onClick={saveReorder}>
              Save order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={daysOpen}
        modal={false}
        onOpenChange={(open) => {
          if (!open) setDaysOpen(false);
        }}
      >
        <DialogContent
          ref={daysPanelRef}
          showCloseButton
          overlayClassName="pointer-events-none bg-transparent"
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="sm:max-w-md"
          style={
            daysPanelPos
              ? { top: daysPanelPos.top, left: daysPanelPos.left, right: 'auto', bottom: 'auto', transform: 'none' }
              : undefined
          }
        >
          <DialogHeader>
            <DialogTitle>Add / remove days</DialogTitle>
            <DialogDescription>
              Preview highlights on the rota: green = add, red = remove. Nothing is saved until Done.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-muted-foreground">Apply changes at</p>
            <div className="flex rounded-md border p-0.5 bg-muted/40">
              <button
                type="button"
                className={cn(
                  'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  daysEditEdge === 'start' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setDaysEditEdge('start')}
              >
                Start of rota
              </button>
              <button
                type="button"
                className={cn(
                  'flex-1 rounded px-3 py-1.5 text-sm font-medium transition-colors',
                  daysEditEdge === 'end' ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
                )}
                onClick={() => setDaysEditEdge('end')}
              >
                End of rota
              </button>
            </div>
          </div>
          <p className="text-sm tabular-nums">
            Current length: <span className="font-semibold">{pendingDayCount}</span> days
            {pendingDayCount !== daysBaselineCount ? (
              <span className="text-muted-foreground"> (was {daysBaselineCount})</span>
            ) : null}
          </p>
          <p className="text-xs text-muted-foreground">
            {daysEditEdge === 'start'
              ? 'Days are added or removed before the first date.'
              : 'Days are added or removed after the last date.'}
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
            <Button type="button" onClick={applyPendingDays}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pickOpen}
        onOpenChange={(o) => {
          setPickOpen(o);
          if (!o) {
            setPickSel(new Set());
            setPickSearch('');
          }
        }}
      >
        <DialogContent showCloseButton className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Choose staff to add in rota</DialogTitle>
          </DialogHeader>
          <Input placeholder="Search by name" value={pickSearch} onChange={(e) => setPickSearch(e.target.value)} className="mb-3" />
          {poolLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Loading guards…</p>
          ) : pool.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              No staff yet. Use <strong>Add New Staff</strong> below, or add them under Staff in the sidebar.
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
          <DialogFooter className="gap-2 sm:justify-between">
            {canCreateStaff ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  addStaffForm.reset(guardFormDefaults);
                  setAddStaffOpen(true);
                }}
              >
                <UserPlus className="size-4 mr-1.5" />
                Add New Staff
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              disabled={poolLoading || pickSel.size === 0}
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
        open={addStaffOpen}
        onOpenChange={(o) => {
          setAddStaffOpen(o);
          if (!o) addStaffForm.reset(guardFormDefaults);
        }}
      >
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0 z-[110]">
          <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
            <DialogTitle>Add New Staff</DialogTitle>
            <DialogDescription className="sr-only">
              Create a new staff member and add them to this rota.
            </DialogDescription>
          </DialogHeader>
          <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6">
            <GuardFormWizard
              form={addStaffForm}
              mains={mains}
              subs={subs}
              isPending={createGuard.isPending}
              submitLabel="Create staff"
              photoFile={addStaffPhoto}
              onPhotoFileChange={setAddStaffPhoto}
              allowLogin
              onSubmit={async (data) => {
                try {
                  const created = await createGuard.mutateAsync(formToGuardPayload(data));
                  if (addStaffPhoto && created?.id) {
                    try {
                      await api.guards.uploadPhoto(created.id, addStaffPhoto);
                    } catch {
                      toast.error('Staff created, but photo upload failed');
                    }
                  }
                  setAddStaffPhoto(null);
                  await refreshPool();
                  setPickSel((prev) => new Set([...prev, String(created.id)]));
                  setAddStaffOpen(false);
                  addStaffForm.reset(guardFormDefaults);
                } catch {
                  /* toast via mutation hook */
                }
              }}
            />
          </div>
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
          if (!o) {
            setMoveCtx(null);
            setMoveEmpSearch('');
            setMoveTargetDate('');
            setMoveToEmployeeId(null);
          }
        }}
      >
        <DialogContent showCloseButton className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move shift to another employee</DialogTitle>
          </DialogHeader>
          {moveCtx ? (
            <p className="text-xs text-muted-foreground">
              From {fmtShortDate(moveCtx.dk)} ·{' '}
              {state.employees.find((e) => e.id === moveCtx.empId)?.name ?? moveCtx.empId} ·{' '}
              {state.shifts[moveCtx.empId]?.[moveCtx.dk]?.[moveCtx.idx]
                ? `${state.shifts[moveCtx.empId][moveCtx.dk][moveCtx.idx].start}–${state.shifts[moveCtx.empId][moveCtx.dk][moveCtx.idx].end} · ${shiftSiteLine(state.shifts[moveCtx.empId][moveCtx.dk][moveCtx.idx])}`
                : ''}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <p className="text-xs font-medium">Move to date</p>
            <select
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={moveTargetDate}
              onChange={(e) => setMoveTargetDate(e.target.value)}
              aria-label="Move to date"
            >
              {state.days.map((dk) => (
                <option key={dk} value={dk}>
                  {fmtShortDate(dk)}
                  {moveCtx && dk === moveCtx.dk ? ' (current)' : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs font-medium">Move to employee</p>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={moveEmpSearch}
                onChange={(e) => setMoveEmpSearch(e.target.value)}
                placeholder="Search staff…"
                className="h-8 pl-8 text-xs"
                aria-label="Search staff"
              />
            </div>
            <div className="grid gap-1.5 max-h-64 overflow-y-auto">
              {moveEmployeeTargets.length === 0 ? (
                <p className="px-1 py-2 text-xs text-muted-foreground">
                  {moveEmpSearch.trim() ? 'No staff match that search.' : 'No other staff on this rota.'}
                </p>
              ) : (
                moveEmployeeTargets.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setMoveToEmployeeId((id) => (id === e.id ? null : e.id))}
                    className={cn(
                      'flex items-center gap-2 rounded-md border px-2 py-2 text-left text-xs transition-colors',
                      moveToEmployeeId === e.id
                        ? 'border-pink-500 bg-pink-50 dark:bg-pink-950/30'
                        : 'hover:bg-muted'
                    )}
                  >
                    <EmployeeAvatar emp={e} className="size-8 text-[10px] shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="font-medium truncate block">{e.name}</span>
                      {e.role ? <span className="truncate block text-[10px] text-muted-foreground">{e.role}</span> : null}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setMoveOpen(false);
                setMoveCtx(null);
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={confirmMove} disabled={!moveToEmployeeId || !moveTargetDate}>
              Move shift
            </Button>
          </DialogFooter>
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
            <Button type="button" disabled={attSaving} onClick={() => void saveAtt()}>
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
            <Button type="button" disabled={adjSaving} onClick={() => void saveOvertime()}>
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
            <Button type="button" disabled={adjSaving} onClick={() => void saveEarlyFinish()}>
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
          style={{ left: shiftMenuAnchor.x, top: shiftMenuAnchor.y, width: shiftMenuAnchor.w, maxHeight: shiftMenuAnchor.maxH, overflowY: 'auto' }}
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
        (() => {
          const menuEmp = state.employees.find((e) => e.id === empMenu);
          const isPending = !!menuEmp?.rotaPending;
          return (
        <div
          ref={empMenuPortalRef}
          className="fixed z-[200] rounded-md border border-border bg-background text-foreground shadow-xl overflow-hidden isolate py-1 text-sm"
          style={{ left: empMenuAnchor.x, top: empMenuAnchor.y, width: empMenuAnchor.w, maxHeight: empMenuAnchor.maxH, overflowY: 'auto' }}
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
            className="w-full text-left px-4 py-2.5 text-amber-700 dark:text-amber-400 hover:bg-muted font-medium"
            onClick={() => {
              setEmployeeRotaPending(empMenu, !isPending);
              closeEmpMenu();
              toast.snack(isPending ? 'Pending highlight cleared' : 'Marked as pending');
            }}
          >
            {isPending ? 'Clear pending highlight' : 'Mark rota as pending'}
          </button>
          <button
            type="button"
            className="w-full text-left px-4 py-2.5 text-sky-600 hover:bg-muted font-medium"
            onClick={() => {
              const id = parseInt(empMenu, 10);
              closeEmpMenu();
              if (id) router.push(`/guards/${id}`);
            }}
          >
            Staff profile / add photo
          </button>
          <button
            type="button"
            className="w-full text-left px-4 py-2.5 text-sky-600 hover:bg-muted font-medium"
            onClick={() => {
              setRatePreviewEmpId(empMenu);
              closeEmpMenu();
            }}
          >
            Rate preview
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
        </div>
          );
        })(),
        document.body
      )}

      <ShiftPreviewDialog
        open={!!previewEmpId}
        onOpenChange={(o) => !o && setPreviewEmpId(null)}
        employee={previewEmployee}
        state={state}
      />
      <RatePreviewDialog
        open={!!ratePreviewEmpId}
        onOpenChange={(o) => !o && setRatePreviewEmpId(null)}
        employee={ratePreviewEmployee}
        state={state}
        resolveShiftRate={resolveShiftRate}
      />
    </div>
  );
}

function LabelMini({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-medium text-muted-foreground">{children}</label>;
}
