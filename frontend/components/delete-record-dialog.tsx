'use client';

/**
 * The two ways to remove a Site, Client or staff record, put side by side so the
 * difference is a choice rather than an accident.
 *
 * **Archive** is the safe one and the default: the record leaves every list and picker
 * while its history — shifts, invoices, payroll — stays readable, and it can be
 * restored. **Delete permanently** destroys the record and everything cascading from it.
 *
 * The permanent side reads the server's delete-impact first, so instead of a generic
 * "are you sure" it names what would be destroyed and refuses outright when something
 * still depends on the record. It also needs an explicit acknowledgement tick, on the
 * principle that the irreversible action should cost one more deliberate click than the
 * reversible one.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Archive, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/lib/toast';
import type { DeleteImpact } from '@/lib/types';
import { cn } from '@/lib/utils';

export type DeleteRecordTarget = {
  id: number;
  name: string;
  /** True when the record is already archived, so only the permanent path is offered. */
  archived?: boolean;
};

type Props = {
  target: DeleteRecordTarget | null;
  onClose: () => void;
  /** What the record is called in prose, e.g. "site", "client", "staff member". */
  noun: string;
  /** Reads what a permanent delete would destroy. */
  loadImpact: (id: number) => Promise<DeleteImpact>;
  onArchive: (id: number) => Promise<unknown>;
  onDeletePermanently: (id: number) => Promise<unknown>;
  canArchive?: boolean;
  canDeletePermanently?: boolean;
  /** One line on what archiving means for this record type. */
  archiveHint: string;
};

export function DeleteRecordDialog({
  target,
  onClose,
  noun,
  loadImpact,
  onArchive,
  onDeletePermanently,
  canArchive = true,
  canDeletePermanently = true,
  archiveHint,
}: Props) {
  const [mode, setMode] = useState<'archive' | 'permanent'>('archive');
  const [impact, setImpact] = useState<DeleteImpact | null>(null);
  const [impactLoading, setImpactLoading] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);

  const open = target != null;
  // An already-archived record has only one thing left to do to it.
  const archiveAvailable = canArchive && !target?.archived;

  useEffect(() => {
    if (!open) return;
    setMode(archiveAvailable ? 'archive' : 'permanent');
    setAcknowledged(false);
    setImpact(null);
  }, [open, archiveAvailable, target?.id]);

  // Loaded when the permanent tab is opened rather than up front: most deletes are
  // archives, and this is an extra round trip.
  useEffect(() => {
    if (!open || mode !== 'permanent' || !target || impact || impactLoading) return;
    setImpactLoading(true);
    loadImpact(target.id)
      .then(setImpact)
      .catch(() => setImpact(null))
      .finally(() => setImpactLoading(false));
  }, [open, mode, target, impact, impactLoading, loadImpact]);

  const run = useCallback(async () => {
    if (!target) return;
    setBusy(true);
    try {
      if (mode === 'archive') {
        await onArchive(target.id);
      } else {
        await onDeletePermanently(target.id);
      }
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not complete that');
    } finally {
      setBusy(false);
    }
  }, [target, mode, onArchive, onDeletePermanently, onClose]);

  if (!target) return null;

  const blocked = mode === 'permanent' && (impact?.blockers.length ?? 0) > 0;
  const confirmDisabled =
    busy || blocked || (mode === 'permanent' && (!acknowledged || impactLoading || !canDeletePermanently));

  return (
    <Dialog open={open} onOpenChange={(v) => (!v && !busy ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === 'archive' ? 'Archive' : 'Permanently delete'} {target.name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {archiveAvailable ? (
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['archive', 'Archive', Archive, 'Reversible'],
                  ['permanent', 'Delete permanently', Trash2, 'Cannot be undone'],
                ] as const
              ).map(([id, label, Icon, hint]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setMode(id)}
                  disabled={busy || (id === 'permanent' && !canDeletePermanently)}
                  className={cn(
                    'rounded-lg border p-3 text-left transition-colors disabled:opacity-50',
                    mode === id
                      ? id === 'permanent'
                        ? 'border-destructive bg-destructive/5'
                        : 'border-primary bg-primary/5'
                      : 'hover:bg-muted/50'
                  )}
                >
                  <span className="flex items-center gap-2 text-sm font-medium">
                    <Icon className="size-4" />
                    {label}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
                </button>
              ))}
            </div>
          ) : null}

          {mode === 'archive' ? (
            <div className="space-y-2 text-sm">
              <p>
                <strong>{target.name}</strong> will be hidden from the {noun} list and from every
                dropdown, but nothing is destroyed.
              </p>
              <p className="text-muted-foreground">{archiveHint}</p>
              <p className="text-muted-foreground">You can restore it from the Archived tab at any time.</p>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <p>
                Are you sure you want to <strong>permanently delete</strong> {target.name} and all of
                their records? This cannot be undone.
              </p>

              {impactLoading ? (
                <p className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Checking what this would affect…
                </p>
              ) : null}

              {blocked ? (
                <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">This {noun} cannot be deleted yet.</p>
                    <p>Still used by {impact?.blockers.join(', ')}.</p>
                    <p>Archive it instead — the history stays readable and it leaves every list.</p>
                  </div>
                </div>
              ) : impact && impact.records.length > 0 ? (
                <div className="flex gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">This will also remove:</p>
                    <ul className="list-disc pl-4">
                      {impact.records.map((r) => (
                        <li key={r.label}>
                          {r.count} {r.label}
                        </li>
                      ))}
                    </ul>
                    <p>Payroll and invoices already raised from these records will no longer add up.</p>
                  </div>
                </div>
              ) : null}

              {!blocked ? (
                <label className="flex cursor-pointer select-none items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    className="size-4 rounded border-input"
                    checked={acknowledged}
                    onChange={(e) => setAcknowledged(e.target.checked)}
                    disabled={busy}
                  />
                  I understand this action cannot be reversed
                </label>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            variant={mode === 'permanent' ? 'destructive' : 'default'}
            onClick={() => void run()}
            disabled={confirmDisabled}
          >
            {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {mode === 'archive' ? 'Archive' : 'Delete permanently'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
