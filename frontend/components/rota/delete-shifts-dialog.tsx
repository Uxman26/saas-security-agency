'use client';

import { Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtRotaDeleteDate, shiftSiteLine } from '@/lib/rota-shifts-utils';
import type { ShiftRec } from '@/lib/rota-shifts-types';

export type DeleteShiftRow = {
  dayKey: string;
  idx: number;
  shift: ShiftRec;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeName: string;
  dayKey?: string | null;
  rows: DeleteShiftRow[];
  onDeleteRow: (dayKey: string, idx: number) => void;
  onDeleteAll: () => void;
};

export function DeleteShiftsDialog({
  open,
  onOpenChange,
  employeeName,
  dayKey,
  rows,
  onDeleteRow,
  onDeleteAll,
}: Props) {
  const showDateCol = !dayKey || new Set(rows.map((r) => r.dayKey)).size > 1;
  const contextLabel = dayKey
    ? `${fmtRotaDeleteDate(dayKey)} ${employeeName}`
    : `${employeeName}${rows.length ? ` · ${rows.length} shift${rows.length === 1 ? '' : 's'}` : ''}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg gap-0 p-0 overflow-hidden">
        <div className="flex items-center justify-between bg-sky-800 px-4 py-3 text-white">
          <DialogTitle className="text-base font-semibold text-white">Delete shifts</DialogTitle>
          <DialogClose asChild>
            <button
              type="button"
              className="rounded-sm text-white/90 transition-opacity hover:text-white focus:outline-none focus:ring-2 focus:ring-white/40"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </DialogClose>
        </div>

        <div className="px-4 py-4 space-y-4">
          <p className="text-sm font-medium">{contextLabel}</p>

          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No shifts to delete.</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60 hover:bg-muted/60">
                    {showDateCol ? <TableHead className="text-xs font-semibold">Date</TableHead> : null}
                    <TableHead className="text-xs font-semibold">Site</TableHead>
                    <TableHead className="text-xs font-semibold">Start</TableHead>
                    <TableHead className="text-xs font-semibold">Finish</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(({ dayKey: dk, idx, shift }) => (
                    <TableRow key={`${dk}-${idx}-${shift.start}-${shift.end}`}>
                      {showDateCol ? (
                        <TableCell className="text-xs whitespace-nowrap">{fmtRotaDeleteDate(dk)}</TableCell>
                      ) : null}
                      <TableCell className="text-xs font-medium max-w-[140px] break-words" title={shiftSiteLine(shift)}>
                        {shiftSiteLine(shift)}
                      </TableCell>
                      <TableCell className="text-xs tabular-nums">{shift.start}</TableCell>
                      <TableCell className="text-xs tabular-nums">{shift.end}</TableCell>
                      <TableCell className="text-right">
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded p-1 text-sky-700 hover:bg-sky-50 dark:hover:bg-sky-950/40"
                          aria-label="Delete shift"
                          onClick={() => onDeleteRow(dk, idx)}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {rows.length > 0 ? (
            <p className="text-sm text-muted-foreground">
              Clicking below will delete all of the above shifts, this cannot be undone
            </p>
          ) : null}
        </div>

        <DialogFooter className="px-4 pb-4 sm:justify-between gap-2">
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={rows.length === 0}
            onClick={onDeleteAll}
          >
            Delete all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
