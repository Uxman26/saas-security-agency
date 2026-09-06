'use client';

/**
 * Employee Profile → Absence.
 *
 * Four cards for the four kinds, each with the button that records one; a date range the
 * whole tab obeys; and the history below in List, Month or Year.
 *
 * Everything is in hours because the rest of the system is — a half-day against a
 * 12-hour shift does not reconcile as "0.5 days". Only approved absence counts as taken;
 * pending is shown separately so a booking awaiting a decision is visible without
 * quietly spending the balance.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { formatDateUK } from '@/lib/date-format';
import { toast } from '@/lib/toast';
import type { AbsenceKind, AbsenceRecord, AbsenceSummary } from '@/lib/types';
import { cn } from '@/lib/utils';

const KINDS: { key: AbsenceKind; label: string; add: string; dot: string }[] = [
  { key: 'annual_leave', label: 'Annual leave', add: 'Add annual leave', dot: 'bg-sky-500' },
  { key: 'sickness', label: 'Sickness', add: 'Add sickness', dot: 'bg-amber-500' },
  { key: 'lateness', label: 'Lateness', add: 'Add lateness', dot: 'bg-red-500' },
  { key: 'other', label: 'Other', add: 'Add other', dot: 'bg-emerald-500' },
];

const KIND_LABEL: Record<string, string> = Object.fromEntries(KINDS.map((k) => [k.key, k.label]));

type HistoryView = 'list' | 'month' | 'year';

function hrs(n?: number | null) {
  if (n == null) return '—';
  const whole = Math.floor(n);
  const mins = Math.round((n - whole) * 60);
  return `${whole}h ${mins}m`;
}

function isoOf(d: Date) {
  return d.toISOString().slice(0, 10);
}

function startOfYear(d = new Date()) {
  return isoOf(new Date(d.getFullYear(), 0, 1));
}

function endOfYear(d = new Date()) {
  return isoOf(new Date(d.getFullYear(), 11, 31));
}

export function AbsenceTab({ guardId, canEdit }: { guardId: number; canEdit: boolean }) {
  const [from, setFrom] = useState(startOfYear());
  const [to, setTo] = useState(endOfYear());
  const [filter, setFilter] = useState<'all' | AbsenceKind>('all');
  // Keyed by the window it was fetched for, so changing the dates reads as "loading"
  // without a synchronous state write in the effect body.
  const [loaded, setLoaded] = useState<{ key: string; summary: AbsenceSummary | null; rows: AbsenceRecord[] } | null>(
    null
  );
  const [reloadToken, setReloadToken] = useState(0);
  const [historyView, setHistoryView] = useState<HistoryView>('month');
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());
  const [showDeclined, setShowDeclined] = useState(true);
  const [showWeekends, setShowWeekends] = useState(true);
  const [addKind, setAddKind] = useState<AbsenceKind | null>(null);

  const queryKey = `${guardId}|${from}|${to}|${reloadToken}`;

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.absence.summary(guardId, from, to),
      api.absence.list({ guard_id: guardId, start_date: from, end_date: to }),
    ])
      .then(([s, r]) => alive && setLoaded({ key: queryKey, summary: s, rows: r }))
      .catch(() => alive && setLoaded({ key: queryKey, summary: null, rows: [] }));
    return () => {
      alive = false;
    };
  }, [queryKey, guardId, from, to]);

  /** Re-runs the current window — after adding or deleting an absence. */
  const load = useCallback(() => setReloadToken((n) => n + 1), []);

  const loading = loaded?.key !== queryKey;
  const summary = loaded?.key === queryKey ? loaded.summary : null;
  const rows = useMemo(() => (loaded?.key === queryKey ? loaded.rows : []), [loaded, queryKey]);

  const visible = useMemo(
    () =>
      rows
        .filter((r) => filter === 'all' || r.kind === filter)
        .filter((r) => showDeclined || r.status !== 'declined'),
    [rows, filter, showDeclined]
  );

  /** Shift the whole range by a year — what the < > either side of the dates do. */
  const shiftRange = (dir: -1 | 1) => {
    const s = new Date(`${from}T12:00:00`);
    const e = new Date(`${to}T12:00:00`);
    s.setFullYear(s.getFullYear() + dir);
    e.setFullYear(e.getFullYear() + dir);
    setFrom(isoOf(s));
    setTo(isoOf(e));
  };

  const remove = (row: AbsenceRecord) => {
    toast.confirm(
      `Delete this ${KIND_LABEL[row.kind]?.toLowerCase() ?? 'absence'}?`,
      async () => {
        try {
          await api.absence.delete(row.id);
          load();
          toast.success('Absence deleted');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Delete failed');
        }
      },
      { label: 'Delete', description: 'The balance is recalculated straight away.' }
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {([['all', 'All absences'], ...KINDS.map((k) => [k.key, k.label])] as [string, string][]).map(
            ([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFilter(id as 'all' | AbsenceKind)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  filter === id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {label}
              </button>
            )
          )}
        </div>
        <div className="flex items-center gap-1 rounded-md border px-1 py-0.5">
          <Button variant="ghost" size="icon" className="size-7" onClick={() => shiftRange(-1)} title="Previous year">
            <ChevronLeft className="size-4" />
          </Button>
          <CalendarDays className="size-3.5 text-muted-foreground" />
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-7 w-[132px] border-0 px-1 text-xs shadow-none focus-visible:ring-0"
            aria-label="Period from"
          />
          <span className="text-xs text-muted-foreground">–</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-7 w-[132px] border-0 px-1 text-xs shadow-none focus-visible:ring-0"
            aria-label="Period to"
          />
          <Button variant="ghost" size="icon" className="size-7" onClick={() => shiftRange(1)} title="Next year">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KINDS.map((k) => {
          const cell = summary?.[k.key];
          return (
            <Card key={k.key}>
              <CardContent className="space-y-3 p-4">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <span className={cn('size-2 rounded-full', k.dot)} />
                  {k.label}
                </p>
                <div className="flex items-end justify-between gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {k.key === 'lateness' || k.key === 'other' ? 'Logged' : 'Taken'}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {k.key === 'lateness' || k.key === 'other'
                        ? (cell?.logged ?? 0)
                        : hrs(cell?.taken_hours)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">
                      {cell?.remaining_hours != null ? 'Remaining' : 'Total'}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {cell?.remaining_hours != null ? hrs(cell.remaining_hours) : hrs(cell?.taken_hours)}
                    </p>
                  </div>
                </div>
                {cell && cell.pending_hours > 0 ? (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {hrs(cell.pending_hours)} pending approval
                  </p>
                ) : null}
                {canEdit ? (
                  <Button variant="outline" size="sm" className="w-full" onClick={() => setAddKind(k.key)}>
                    <Plus className="mr-1.5 size-3.5" />
                    {k.add}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold">Absence history</h3>
        <div className="flex items-center gap-1 rounded-md border p-0.5">
          {(['list', 'month', 'year'] as HistoryView[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setHistoryView(v)}
              className={cn(
                'rounded px-3 py-1 text-xs font-medium capitalize transition-colors',
                historyView === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          {loading ? (
            <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Loading absence…
            </p>
          ) : historyView === 'list' ? (
            <AbsenceList rows={visible} canEdit={canEdit} onDelete={remove} />
          ) : historyView === 'month' ? (
            <MonthGrid
              rows={visible}
              anchor={monthAnchor}
              onAnchor={setMonthAnchor}
              showWeekends={showWeekends}
              onShowWeekends={setShowWeekends}
              showDeclined={showDeclined}
              onShowDeclined={setShowDeclined}
            />
          ) : (
            <YearGrid rows={visible} year={new Date(`${from}T12:00:00`).getFullYear()} />
          )}
        </CardContent>
      </Card>

      <AddAbsenceDialog
        guardId={guardId}
        kind={addKind}
        onClose={() => setAddKind(null)}
        onSaved={() => {
          setAddKind(null);
          load();
        }}
      />
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    pending: 'bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-300',
    declined: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  return (
    <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', styles[status])}>
      {status}
    </span>
  );
}

function AbsenceList({
  rows,
  canEdit,
  onDelete,
}: {
  rows: AbsenceRecord[];
  canEdit: boolean;
  onDelete: (r: AbsenceRecord) => void;
}) {
  if (!rows.length) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No absence in this period.</p>;
  }
  return (
    <div className="divide-y">
      {rows.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-3 py-2.5">
          <span className="w-32 shrink-0 text-sm font-medium">{KIND_LABEL[r.kind] ?? r.kind}</span>
          <span className="text-sm text-muted-foreground">
            {formatDateUK(r.start_date)}
            {r.end_date !== r.start_date ? ` – ${formatDateUK(r.end_date)}` : ''}
            {r.start_time ? ` · ${r.start_time}${r.end_time ? `–${r.end_time}` : ''}` : ''}
          </span>
          <span className="text-sm tabular-nums">{hrs(r.hours)}</span>
          <StatusPill status={r.status} />
          {r.reason ? <span className="truncate text-xs text-muted-foreground">{r.reason}</span> : null}
          {canEdit ? (
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-8 text-destructive hover:text-destructive"
              onClick={() => onDelete(r)}
              title="Delete"
            >
              <Trash2 className="size-4" />
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function MonthGrid({
  rows,
  anchor,
  onAnchor,
  showWeekends,
  onShowWeekends,
  showDeclined,
  onShowDeclined,
}: {
  rows: AbsenceRecord[];
  anchor: Date;
  onAnchor: (d: Date) => void;
  showWeekends: boolean;
  onShowWeekends: (v: boolean) => void;
  showDeclined: boolean;
  onShowDeclined: (v: boolean) => void;
}) {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  const first = new Date(year, month, 1);
  // Monday-first, matching the rest of the product's calendars.
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  /** date string → the absences touching that day. */
  const byDay = useMemo(() => {
    const m = new Map<string, AbsenceRecord[]>();
    for (const r of rows) {
      const s = new Date(`${r.start_date}T12:00:00`);
      const e = new Date(`${r.end_date}T12:00:00`);
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
        const key = isoOf(d);
        m.set(key, [...(m.get(key) ?? []), r]);
      }
    }
    return m;
  }, [rows]);

  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
  ];

  const counts = KINDS.map((k) => ({
    ...k,
    n: rows.filter((r) => r.kind === k.key && new Date(`${r.start_date}T12:00:00`).getMonth() === month).length,
  }));

  const step = (dir: -1 | 1) => onAnchor(new Date(year, month + dir, 1));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-8" onClick={() => step(-1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-8" onClick={() => step(1)}>
            <ChevronRight className="size-4" />
          </Button>
          <Button variant="link" size="sm" onClick={() => onAnchor(new Date())}>
            Today
          </Button>
          <span className="ml-2 font-medium">
            {first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              className="size-3.5 rounded border-input"
              checked={showDeclined}
              onChange={(e) => onShowDeclined(e.target.checked)}
            />
            Show declined
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              className="size-3.5 rounded border-input"
              checked={showWeekends}
              onChange={(e) => onShowWeekends(e.target.checked)}
            />
            Show weekends
          </label>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
        {counts.map((c) => (
          <span key={c.key} className="flex items-center gap-1.5">
            <span className={cn('size-2 rounded-full', c.dot)} />
            {c.label}: {c.n}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[560px] grid-cols-7 gap-px rounded-md border bg-border">
          {DOW.map((d, i) =>
            !showWeekends && i > 4 ? null : (
              <div key={d} className="bg-muted/50 px-2 py-1.5 text-center text-xs font-medium">
                {d}
              </div>
            )
          )}
          {cells.map((d, i) => {
            const weekendCol = d ? [0, 6].includes(d.getDay()) : (i - DOW.length) % 7 > 4;
            if (!showWeekends && weekendCol) return null;
            const key = d ? isoOf(d) : `pad-${i}`;
            const items = d ? byDay.get(isoOf(d)) ?? [] : [];
            return (
              <div key={key} className="min-h-[72px] bg-card p-1.5">
                {d ? (
                  <>
                    <span className="text-xs text-muted-foreground">{d.getDate()}</span>
                    <div className="mt-1 space-y-0.5">
                      {items.map((r) => {
                        const kind = KINDS.find((k) => k.key === r.kind);
                        return (
                          <span
                            key={`${r.id}-${key}`}
                            className={cn(
                              'block truncate rounded px-1 py-0.5 text-[10px] text-white',
                              kind?.dot ?? 'bg-slate-400',
                              r.status === 'declined' && 'opacity-50 line-through'
                            )}
                            title={`${KIND_LABEL[r.kind]} · ${r.status}`}
                          >
                            {KIND_LABEL[r.kind]}
                          </span>
                        );
                      })}
                    </div>
                  </>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function YearGrid({ rows, year }: { rows: AbsenceRecord[]; year: number }) {
  const perMonth = useMemo(() => {
    const m = Array.from({ length: 12 }, () => ({ total: 0, hours: 0 }));
    for (const r of rows) {
      const d = new Date(`${r.start_date}T12:00:00`);
      if (d.getFullYear() !== year) continue;
      m[d.getMonth()].total += 1;
      m[d.getMonth()].hours += r.hours || 0;
    }
    return m;
  }, [rows, year]);

  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {perMonth.map((m, i) => (
        <div key={i} className="rounded-md border p-3">
          <p className="text-sm font-medium">
            {new Date(year, i, 1).toLocaleDateString('en-GB', { month: 'long' })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {m.total} absence{m.total === 1 ? '' : 's'} · {hrs(m.hours)}
          </p>
        </div>
      ))}
    </div>
  );
}

function AddAbsenceDialog({
  guardId,
  kind,
  onClose,
  onSaved,
}: {
  guardId: number;
  kind: AbsenceKind | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [hours, setHours] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('approved');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!kind) return;
    const today = isoOf(new Date());
    setStart(today);
    setEnd(today);
    setHours('');
    setReason('');
    setNotes('');
    setStatus('approved');
  }, [kind]);

  if (!kind) return null;
  const label = KIND_LABEL[kind] ?? 'absence';

  const save = async () => {
    if (!start) return;
    setBusy(true);
    try {
      await api.absence.create({
        guard_id: guardId,
        kind,
        start_date: start,
        end_date: end || start,
        hours: hours.trim() ? parseFloat(hours) : undefined,
        status,
        reason: reason.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      toast.success(`${label} recorded`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not record that');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => (!v && !busy ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record {label.toLowerCase()}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>From</Label>
              <Input type="date" value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>To</Label>
              <Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Hours</Label>
            <Input
              type="number"
              step="0.25"
              min="0"
              placeholder="Leave blank to use the average working day"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Blank bills this employee&rsquo;s own average working day for each day in the range.
            </p>
          </div>
          <div className="space-y-1">
            <Label>Status</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="approved">Approved</option>
              <option value="pending">Pending</option>
              <option value="declined">Declined</option>
            </select>
            <p className="text-xs text-muted-foreground">Only approved absence comes off the balance.</p>
          </div>
          <div className="space-y-1">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label>Notes</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy || !start}>
            {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
