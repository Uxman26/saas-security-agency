'use client';

/**
 * The "Quick view" panel behind every employee card and list row.
 *
 * It answers "who is this and how do I reach them" without leaving the hub — the full
 * record is a click away but most of the time is not what was wanted. It loads the full
 * staff record on open rather than relying on the hub row, so it can show contact
 * details, contract basics and compliance dates the list does not carry.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, Mail, Phone, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatDateUK } from '@/lib/date-format';
import type { EmployeeHubRow, Guard } from '@/lib/types';
import { cn } from '@/lib/utils';

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="truncate text-sm font-medium">{value?.toString().trim() ? value : '—'}</p>
    </div>
  );
}

export function initialsOf(name: string): string {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function EmployeeQuickView({
  employee,
  onClose,
}: {
  employee: EmployeeHubRow | null;
  onClose: () => void;
}) {
  // Keyed by the employee it was loaded for, so opening a second person reads as "not
  // loaded yet" rather than briefly showing the previous one's details.
  const [loaded, setLoaded] = useState<{ id: number; guard: Guard | null } | null>(null);

  useEffect(() => {
    if (!employee) return;
    let alive = true;
    const wanted = employee.id;
    api.guards
      .get(wanted)
      // The panel still shows what the hub row carries, so a refusal here degrades to a
      // shorter panel rather than blanking the whole thing.
      .then((g) => alive && setLoaded({ id: wanted, guard: g }))
      .catch(() => alive && setLoaded({ id: wanted, guard: null }));
    return () => {
      alive = false;
    };
  }, [employee]);

  if (!employee) return null;
  const full = loaded?.id === employee.id ? loaded.guard : null;
  const loading = loaded?.id !== employee.id;

  return (
    <Dialog open onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Quick view — {employee.full_name}</DialogTitle>
        </DialogHeader>

        <div className="flex items-start gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
            {initialsOf(employee.full_name)}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{employee.full_name}</h2>
            <p className="truncate text-sm text-muted-foreground">
              {employee.job_title || 'No job title'}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {employee.teams.length ? (
                employee.teams.map((t) => (
                  <span key={t.id} className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">
                    {t.name}
                  </span>
                ))
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                  No team
                </span>
              )}
              {employee.terminated ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  Terminated{employee.termination_date ? ` · ${formatDateUK(employee.termination_date)}` : ''}
                </span>
              ) : null}
              {!employee.registered ? (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-900 dark:bg-sky-900/40 dark:text-sky-200">
                  No portal login
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap gap-2">
          {employee.email ? (
            <Button variant="outline" size="sm" asChild>
              <a href={`mailto:${employee.email}`}>
                <Mail className="mr-1.5 size-3.5" />
                Email
              </a>
            </Button>
          ) : null}
          {employee.phone ? (
            <Button variant="outline" size="sm" asChild>
              <a href={`tel:${employee.phone}`}>
                <Phone className="mr-1.5 size-3.5" />
                Call
              </a>
            </Button>
          ) : null}
          <Button size="sm" asChild>
            <Link href={`/guards/${employee.id}`}>
              <UserRound className="mr-1.5 size-3.5" />
              View full profile
            </Link>
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-4">
          <Field label="Email" value={employee.email} />
          <Field label="Phone" value={employee.phone} />
          <Field label="Job title" value={employee.job_title} />
          <Field label="Teams" value={employee.teams.map((t) => t.name).join(', ') || null} />
          {loading ? (
            <p className="col-span-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Loading the rest of the record…
            </p>
          ) : full ? (
            <>
              <Field label="SIA number" value={full.sia_number} />
              <Field
                label="SIA expiry"
                value={full.sia_expiry_date ? formatDateUK(full.sia_expiry_date) : null}
              />
              <Field label="Right to work" value={full.rtw_status} />
              <Field
                label="Employment start"
                value={full.employment_start_date ? formatDateUK(full.employment_start_date) : null}
              />
              <Field label="Town / city" value={full.town_city} />
              <Field label="Postcode" value={full.postcode} />
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * One employee card in Teams View. Both actions from the spec sit on the card: the name
 * and "View full profile" open the record, the eye opens the quick view.
 */
export function EmployeeCard({
  employee,
  onQuickView,
}: {
  employee: EmployeeHubRow;
  onQuickView: (e: EmployeeHubRow) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-muted/40',
        employee.terminated && 'opacity-70'
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {initialsOf(employee.full_name)}
      </span>
      <div className="min-w-0 flex-1">
        <Link href={`/guards/${employee.id}`} className="block truncate text-sm font-medium hover:underline">
          {employee.full_name}
        </Link>
        {employee.job_title ? (
          <p className="truncate text-xs text-muted-foreground">{employee.job_title}</p>
        ) : null}
        <Link
          href={`/guards/${employee.id}`}
          className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
        >
          View full profile
        </Link>
        {employee.terminated ? (
          <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Terminated</p>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onQuickView(employee)}
        className="flex shrink-0 flex-col items-center gap-0.5 rounded-md px-1.5 py-1 text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground"
        title={`Quick view — ${employee.full_name}`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
          <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        Quick view
      </button>
    </div>
  );
}
