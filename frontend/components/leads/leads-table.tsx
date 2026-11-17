'use client';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { can } from '@/lib/permissions';
import { designationLabel, leadLabel, priorityClass, priorityLabel, statusClass } from '@/lib/leads';
import type { Lead } from '@/lib/types';
import type { User } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Pencil } from 'lucide-react';
import { RowCheckbox, SelectAllCheckbox, type BulkSelection } from '@/components/bulk-select';

type Props = {
  leads: Lead[];
  isLoading: boolean;
  user: User | null;
  onEdit: (lead: Lead) => void;
  onDelete?: (id: number) => void;
  showDates?: boolean;
  /** When given, a checkbox column is shown for bulk actions. */
  selection?: BulkSelection;
};

export function LeadsTable({ leads, isLoading, user, onEdit, onDelete, showDates, selection }: Props) {
  const cols = (showDates ? 9 : 8) + (selection ? 1 : 0);
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {selection ? (
            <TableHead className="w-8 pl-4">
              <SelectAllCheckbox selection={selection} ids={leads.map((l) => l.id)} />
            </TableHead>
          ) : null}
          <TableHead>Organization</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Designation</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Priority</TableHead>
          <TableHead>Source</TableHead>
          {showDates ? <TableHead>Scheduled</TableHead> : null}
          <TableHead>Value</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {isLoading ? (
          <TableRow>
            <TableCell colSpan={cols} className="text-center text-muted-foreground py-8">
              Loading…
            </TableCell>
          </TableRow>
        ) : leads.length === 0 ? (
          <TableRow>
            <TableCell colSpan={cols} className="text-center text-muted-foreground py-8">
              No leads match your filters
            </TableCell>
          </TableRow>
        ) : (
          leads.map((l) => (
            <TableRow key={l.id} href={`/leads/${l.id}`} className={selection?.isSelected(l.id) ? 'bg-primary/5' : undefined}>
              {selection ? (
                <TableCell className="w-8 pl-4">
                  <RowCheckbox selection={selection} id={l.id} label={`Select ${l.organization || l.title}`} />
                </TableCell>
              ) : null}
              <TableCell>
                <div className="font-medium">{l.organization || l.title}</div>
                <div className="text-xs text-muted-foreground">{[l.city, l.postcode].filter(Boolean).join(', ') || '—'}</div>
              </TableCell>
              <TableCell>
                <div className="text-sm">{l.contact_name || '—'}</div>
                <div className="text-xs text-muted-foreground">{l.email || l.phone || '—'}</div>
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {l.designation ? designationLabel(l.designation) : '—'}
              </TableCell>
              <TableCell>
                <span className={cn('text-xs rounded-full px-2 py-0.5', statusClass(l.status))}>{leadLabel(l.status)}</span>
              </TableCell>
              <TableCell className={cn('text-sm', priorityClass(l.priority || ''))}>{priorityLabel(l.priority || '—')}</TableCell>
              <TableCell className="text-sm">{l.source ? leadLabel(l.source) : '—'}</TableCell>
              {showDates ? (
                <TableCell className="text-xs text-muted-foreground">
                  {l.next_follow_up_at ? `Follow-up: ${new Date(l.next_follow_up_at).toLocaleString()}` : null}
                  {l.meeting_at ? `Meeting: ${new Date(l.meeting_at).toLocaleString()}` : null}
                  {!l.next_follow_up_at && !l.meeting_at ? '—' : null}
                </TableCell>
              ) : null}
              <TableCell className="tabular-nums">£{(l.estimated_value || 0).toLocaleString()}</TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-1">
                  {can(user, 'leads.write') ? (
                    <Button variant="ghost" size="sm" onClick={() => onEdit(l)}>
                      <Pencil className="size-4 mr-1" />
                      Edit
                    </Button>
                  ) : null}
                  {can(user, 'leads.delete') && onDelete ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => {
                        if (confirm('Delete this lead?')) onDelete(l.id);
                      }}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
