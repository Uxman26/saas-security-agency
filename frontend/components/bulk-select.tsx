'use client';

/**
 * Multi-select + bulk actions for list tables.
 *
 * Bulk delete deliberately goes through each module's existing single-record DELETE
 * endpoint rather than a new bulk route: every per-record rule the server already
 * enforces (permissions, "can't delete a paid invoice", recycle-bin capture, audit
 * log) applies unchanged, and a failure on one record doesn't roll back the others.
 * The runner reports how many succeeded and why the rest didn't.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/lib/toast';

type Id = number | string;

export type BulkSelection<T extends Id = number> = {
  selected: Set<T>;
  count: number;
  ids: T[];
  isSelected: (id: T) => boolean;
  toggle: (id: T, on?: boolean) => void;
  setMany: (ids: T[], on: boolean) => void;
  clear: () => void;
};

/**
 * Selection state. Pass the ids currently visible/available (`availableIds`) and any
 * selected id that drops out of that list (filtered away, deleted, page changed data)
 * is pruned, so a bulk action never touches a row the user can no longer see.
 */
export function useBulkSelection<T extends Id = number>(availableIds?: T[]): BulkSelection<T> {
  const [selected, setSelected] = useState<Set<T>>(() => new Set());

  const availableKey = availableIds ? availableIds.join(',') : null;
  useEffect(() => {
    if (!availableIds) return;
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const avail = new Set(availableIds);
      let changed = false;
      const next = new Set<T>();
      prev.forEach((id) => {
        if (avail.has(id)) next.add(id);
        else changed = true;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableKey]);

  const toggle = useCallback((id: T, on?: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const want = on ?? !next.has(id);
      if (want) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: T[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return useMemo(
    () => ({
      selected,
      count: selected.size,
      ids: Array.from(selected),
      isSelected: (id: T) => selected.has(id),
      toggle,
      setMany,
      clear,
    }),
    [selected, toggle, setMany, clear]
  );
}

const checkboxClass = 'size-4 cursor-pointer accent-primary align-middle';

/** Header checkbox: selects / clears every id passed (normally the rows on this page). */
export function SelectAllCheckbox<T extends Id>({
  selection,
  ids,
  label = 'Select all on this page',
}: {
  selection: BulkSelection<T>;
  ids: T[];
  label?: string;
}) {
  const all = ids.length > 0 && ids.every((id) => selection.selected.has(id));
  const some = !all && ids.some((id) => selection.selected.has(id));
  return (
    <input
      type="checkbox"
      aria-label={label}
      className={checkboxClass}
      checked={all}
      ref={(el) => {
        if (el) el.indeterminate = some;
      }}
      onChange={(e) => selection.setMany(ids, e.target.checked)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

export function RowCheckbox<T extends Id>({
  selection,
  id,
  label,
  disabled,
}: {
  selection: BulkSelection<T>;
  id: T;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label ?? `Select row ${id}`}
      className={checkboxClass}
      checked={selection.selected.has(id)}
      disabled={disabled}
      onChange={(e) => selection.toggle(id, e.target.checked)}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** Strip shown above the table while anything is selected. */
export function BulkActionBar<T extends Id>({
  selection,
  children,
  noun = 'item',
  allIds,
}: {
  selection: BulkSelection<T>;
  children: ReactNode;
  noun?: string;
  /** Every id matching the current filters (all pages); enables "Select all N". */
  allIds?: T[];
}) {
  if (selection.count === 0) return null;
  const canSelectAll = allIds && allIds.length > selection.count;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
      <span className="font-medium">
        {selection.count} {selection.count === 1 ? noun : pluralise(noun)} selected
      </span>
      {canSelectAll ? (
        <Button size="sm" variant="link" className="h-auto px-1" onClick={() => selection.setMany(allIds, true)}>
          Select all {allIds.length}
        </Button>
      ) : null}
      {children}
      <Button size="sm" variant="ghost" onClick={selection.clear}>
        <X className="mr-1 size-4" />
        Clear
      </Button>
    </div>
  );
}

function pluralise(noun: string) {
  if (/(s|x|ch|sh)$/i.test(noun)) return `${noun}es`;
  if (/[^aeiou]y$/i.test(noun)) return `${noun.slice(0, -1)}ies`;
  return `${noun}s`;
}

export type BulkResult<T extends Id = number> = { ok: T[]; failed: { id: T; message: string }[] };

/**
 * Runs `fn` for each id with small concurrency and summarises the outcome in a toast.
 * Never throws; inspect the result if the caller needs to.
 */
export async function runBulk<T extends Id>(
  ids: T[],
  fn: (id: T) => Promise<unknown>,
  opts: { noun: string; verb?: string; concurrency?: number }
): Promise<BulkResult<T>> {
  const verb = opts.verb ?? 'deleted';
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const result: BulkResult<T> = { ok: [], failed: [] };
  const queue = [...ids];
  const toastId = toast.loading(`Working on ${ids.length} ${ids.length === 1 ? opts.noun : pluralise(opts.noun)}…`);

  async function worker() {
    for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
      try {
        await fn(id);
        result.ok.push(id);
      } catch (e) {
        result.failed.push({ id, message: e instanceof Error ? e.message : 'Failed' });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  toast.dismiss(toastId);

  const okN = result.ok.length;
  const failN = result.failed.length;
  const okText = `${okN} ${okN === 1 ? opts.noun : pluralise(opts.noun)} ${verb}`;
  if (failN === 0) {
    toast.success(okText);
  } else {
    // Group identical reasons so 30 "Paid invoices can't be deleted" collapse to one line.
    const reasons = new Map<string, number>();
    result.failed.forEach((f) => reasons.set(f.message, (reasons.get(f.message) ?? 0) + 1));
    const detail = Array.from(reasons.entries())
      .slice(0, 3)
      .map(([m, n]) => (n > 1 ? `${m} (×${n})` : m))
      .join(' · ');
    const msg = okN > 0 ? `${okText}; ${failN} could not be ${verb}` : `None could be ${verb} (${failN} failed)`;
    toast.error(msg, { description: detail, duration: 8000 });
  }
  return result;
}

/**
 * Confirmation dialog for a bulk action. `requireAck` adds an "I understand" tick for
 * irreversible actions, matching the single-record permanent-delete dialog.
 */
export function BulkConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Delete',
  destructive = true,
  requireAck = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requireAck?: boolean;
  onConfirm: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [ack, setAck] = useState(false);
  useEffect(() => {
    if (open) setAck(false);
  }, [open]);

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (!busy ? onOpenChange(v) : undefined)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1 text-sm">
          {description ? <div className="text-muted-foreground">{description}</div> : null}
          {requireAck ? (
            <label className="flex cursor-pointer select-none items-center gap-2 font-medium">
              <input
                type="checkbox"
                className="size-4 rounded border-input"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                disabled={busy}
              />
              I understand this action cannot be reversed
            </label>
          ) : null}
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={destructive ? 'destructive' : 'default'}
            onClick={() => void run()}
            disabled={busy || (requireAck && !ack)}
          >
            {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The common case in one component: a "Delete selected" button + its confirmation.
 * Drop it inside <BulkActionBar>.
 */
export function BulkDeleteButton<T extends Id>({
  selection,
  noun,
  deleteOne,
  onDone,
  description = 'This cannot be undone.',
  label = 'Delete selected',
  confirmLabel = 'Delete',
  verb = 'deleted',
  requireAck = false,
  disabled,
}: {
  selection: BulkSelection<T>;
  noun: string;
  deleteOne: (id: T) => Promise<unknown>;
  /** Called after the run (refetch here). Selection of succeeded ids is cleared automatically. */
  onDone?: (result: BulkResult<T>) => void | Promise<unknown>;
  description?: ReactNode;
  label?: string;
  confirmLabel?: string;
  verb?: string;
  requireAck?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const n = selection.count;
  return (
    <>
      <Button size="sm" variant="destructive" disabled={disabled || n === 0} onClick={() => setOpen(true)}>
        <Trash2 className="mr-1.5 size-4" />
        {label}
      </Button>
      <BulkConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`${confirmLabel} ${n} ${n === 1 ? noun : pluralise(noun)}?`}
        description={description}
        confirmLabel={confirmLabel}
        requireAck={requireAck}
        onConfirm={async () => {
          const result = await runBulk(selection.ids, deleteOne, { noun, verb });
          selection.setMany(result.ok, false);
          await onDone?.(result);
        }}
      />
    </>
  );
}
