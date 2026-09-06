'use client';

/**
 * Employee Profile → Employment.
 *
 * Left column is the contract: hours, place of work, annual leave and sickness
 * entitlement. Right column is the role and the sections that hang off it — salary,
 * payroll, bank, notes, sensitive information, termination, external reference and the
 * delete route.
 *
 * Salary/payroll/bank and the sensitive block are gated on their own permissions
 * (`guards.salary_view`, `guards.sensitive_view`) rather than plain edit rights, because
 * "can update a phone number" and "can see what someone is paid" are not the same job.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { formatDateUK } from '@/lib/date-format';
import { toast } from '@/lib/toast';
import type { Guard, Team } from '@/lib/types';
import { Field, ProfileSection } from './personal-tab';

function hoursLabel(h?: number | null, m?: number | null) {
  const hours = h ?? 0;
  const mins = m ?? 0;
  if (!hours && !mins) return '0 hrs';
  return mins ? `${hours} hrs ${mins} mins` : `${hours} hrs`;
}

function lengthOfService(start?: string | null) {
  if (!start) return null;
  const s = new Date(`${start}T12:00:00`);
  if (Number.isNaN(s.getTime())) return null;
  const now = new Date();
  let years = now.getFullYear() - s.getFullYear();
  let months = now.getMonth() - s.getMonth();
  if (now.getDate() < s.getDate()) months -= 1;
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  if (years < 0) return 'Not started yet';
  const parts = [];
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (months) parts.push(`${months} month${months === 1 ? '' : 's'}`);
  return parts.join(', ') || 'Less than a month';
}

/** A collapsible row in the right column that opens an edit dialog. */
function DetailRow({
  title,
  subtitle,
  onOpen,
  locked,
}: {
  title: string;
  subtitle: string;
  onOpen?: () => void;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={locked || !onOpen}
      className="flex w-full items-center justify-between gap-2 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {locked ? 'You do not have permission to view this' : subtitle}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

type FieldDef = { key: keyof Guard; label: string; type?: string };

const SECTIONS: Record<string, { title: string; subtitle: string; fields: FieldDef[] }> = {
  salary: {
    title: 'Salary information',
    subtitle: 'Salary amount, rate and payment frequency',
    fields: [
      { key: 'salary_amount', label: 'Salary amount', type: 'number' },
      { key: 'salary_rate', label: 'Rate (e.g. per year, per hour)' },
      { key: 'salary_frequency', label: 'Payment frequency' },
      { key: 'pay_frequency', label: 'Pay run frequency' },
    ],
  },
  payroll: {
    title: 'Payroll information',
    subtitle: 'Payroll number and pension details',
    fields: [
      { key: 'payroll_number', label: 'Payroll number' },
      { key: 'pension_scheme', label: 'Pension scheme' },
      { key: 'pension_contribution', label: 'Pension contribution' },
    ],
  },
  bank: {
    title: 'Bank details',
    subtitle: 'Employee bank details',
    fields: [
      { key: 'bank_account_name', label: 'Account name' },
      { key: 'bank_name', label: 'Bank name' },
      { key: 'bank_branch', label: 'Branch' },
      { key: 'bank_account_number', label: 'Account number' },
      { key: 'bank_sort_code', label: 'Sort code' },
    ],
  },
  notes: {
    title: 'Notes',
    subtitle: 'Employee notes',
    fields: [{ key: 'employee_notes', label: 'Notes' }],
  },
  sensitive: {
    title: 'Sensitive information',
    subtitle: 'Tax, NI and eligibility information',
    fields: [
      { key: 'tax_code', label: 'Tax code' },
      { key: 'ni_number', label: 'National Insurance number' },
      { key: 'passport_number', label: 'Passport number' },
      { key: 'passport_country', label: 'Passport country' },
      { key: 'passport_expiry_date', label: 'Passport expiry', type: 'date' },
      { key: 'rtw_status', label: 'Right to work status' },
      { key: 'share_code', label: 'Share code' },
    ],
  },
  termination: {
    title: 'Termination',
    subtitle: 'Leaving date, reason for termination, etc',
    fields: [
      { key: 'termination_date', label: 'Leaving date', type: 'date' },
      { key: 'termination_reason', label: 'Reason for termination' },
      { key: 'termination_notes', label: 'Notes' },
    ],
  },
  reference: {
    title: 'External employee reference',
    subtitle: 'Set a custom reference to appear in reports',
    fields: [{ key: 'external_reference', label: 'External reference' }],
  },
};

export function EmploymentTab({
  guard,
  canEdit,
  canSalary,
  canSensitive,
  canTerminate,
  canDelete,
  onSaved,
  onDelete,
}: {
  guard: Guard;
  canEdit: boolean;
  canSalary: boolean;
  canSensitive: boolean;
  canTerminate: boolean;
  canDelete: boolean;
  onSaved: () => void;
  onDelete: () => void;
}) {
  const [section, setSection] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [memberOf, setMemberOf] = useState<number[]>([]);

  useEffect(() => {
    api.teams.list().then(setTeams).catch(() => setTeams([]));
    api.guards.teams(guard.id).then(setMemberOf).catch(() => setMemberOf([]));
  }, [guard.id]);

  const open = (key: string) => {
    const def = SECTIONS[key];
    const next: Record<string, string> = {};
    for (const f of def.fields) {
      const v = guard[f.key];
      next[f.key as string] = v == null ? '' : String(v);
    }
    setValues(next);
    setSection(key);
  };

  const save = async () => {
    if (!section) return;
    setBusy(true);
    try {
      const def = SECTIONS[section];
      const payload: Record<string, unknown> = {};
      for (const f of def.fields) {
        const raw = (values[f.key as string] ?? '').trim();
        payload[f.key as string] =
          raw === '' ? null : f.type === 'number' ? parseFloat(raw) : raw;
      }
      await api.guards.update(guard.id, payload as Partial<Guard>);
      setSection(null);
      onSaved();
      toast.success(`${def.title} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const saveTeams = async (ids: number[]) => {
    setMemberOf(ids);
    try {
      await api.guards.setTeams(guard.id, ids);
      toast.success('Teams updated');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update teams');
    }
  };

  const rowFor = (key: string, allowed: boolean) => {
    const def = SECTIONS[key];
    return (
      <DetailRow
        key={key}
        title={def.title}
        subtitle={def.subtitle}
        locked={!allowed}
        onOpen={allowed && canEdit ? () => open(key) : undefined}
      />
    );
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4">
        <ProfileSection
          title="Contract and annual leave information"
          subtitle="Contracted hours of work, employment start date and leave entitlement"
        >
          <div className="rounded-md border">
            <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
              <span className="text-sm font-semibold">Contract summary</span>
              {canEdit ? (
                <Button variant="ghost" size="sm" className="h-7" onClick={() => open('salary')}>
                  <Pencil className="mr-1.5 size-3.5" />
                  Edit
                </Button>
              ) : null}
            </div>
            <div className="grid gap-3 p-3 sm:grid-cols-2">
              <Field label="Employment type" value={guard.employee_type} />
              <Field label="Entitlement unit" value={guard.entitlement_unit || 'Hours'} />
              <Field
                label="Contract start date"
                value={guard.employment_start_date ? formatDateUK(guard.employment_start_date) : null}
              />
              <Field
                label="Contracted hours per week"
                value={hoursLabel(guard.contracted_week_hrs, guard.contracted_week_mins)}
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold">Place of work</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field label="Working location" value={guard.working_location} />
              <Field label="Public holidays for" value={guard.holiday_jurisdiction} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Determines public holidays and leave types.
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold">Annual leave</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <Field
                label="Annual leave year start"
                value={
                  guard.leave_year_start_day && guard.leave_year_start_month
                    ? `${guard.leave_year_start_day} ${new Date(2000, guard.leave_year_start_month - 1, 1).toLocaleDateString('en-GB', { month: 'long' })}`
                    : '01 January'
                }
              />
              <Field
                label="Min. leave entitlement"
                value={hoursLabel(guard.leave_entitlement_hrs, guard.leave_entitlement_mins)}
              />
              <Field
                label="Average working day"
                value={hoursLabel(guard.average_day_hrs, guard.average_day_mins)}
              />
              <Field
                label="Leave allowance"
                value={hoursLabel(guard.leave_allowance_hrs, guard.leave_allowance_mins)}
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-semibold">Sickness entitlement</p>
            {guard.sickness_entitlement_hrs || guard.sickness_entitlement_mins ? (
              <p className="mt-1 text-sm">
                {hoursLabel(guard.sickness_entitlement_hrs, guard.sickness_entitlement_mins)}
              </p>
            ) : (
              <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                No sickness entitlement assigned. Until one is set, the Absence tab shows sickness
                as a running total with nothing to measure it against.
              </div>
            )}
          </div>
        </ProfileSection>

        <ProfileSection title="Employment summary" subtitle="Start date and length of service">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Employment start date"
              value={guard.employment_start_date ? formatDateUK(guard.employment_start_date) : null}
            />
            <Field label="Length of service" value={lengthOfService(guard.employment_start_date)} />
            <Field
              label="Probation end date"
              value={guard.probation_end_date ? formatDateUK(guard.probation_end_date) : null}
            />
            <Field
              label="Leaving date"
              value={guard.termination_date ? formatDateUK(guard.termination_date) : null}
            />
          </div>
        </ProfileSection>
      </div>

      <div className="space-y-4">
        <ProfileSection title="Role information" subtitle="Job title, probation and notice period">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Job title" value={guard.job_title} />
            <Field label="Contract type" value={guard.contract_type} />
            <Field
              label="Team(s)"
              value={
                teams
                  .filter((t) => memberOf.includes(t.id))
                  .map((t) => t.name)
                  .join(', ') || 'No team'
              }
            />
            <Field label="Reports to" value={guard.reports_to} />
            <Field label="Probation required" value={guard.probation_required ? 'Yes' : 'No'} />
            <Field label="Notice period" value={guard.notice_period} />
          </div>
          {canEdit && teams.length > 0 ? (
            <div className="space-y-1 border-t pt-3">
              <Label className="text-xs text-muted-foreground">Change teams</Label>
              <div className="flex flex-wrap gap-2">
                {teams.map((t) => {
                  const on = memberOf.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className="flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs"
                    >
                      <input
                        type="checkbox"
                        className="size-3.5 rounded border-input"
                        checked={on}
                        onChange={(e) =>
                          void saveTeams(
                            e.target.checked ? [...memberOf, t.id] : memberOf.filter((x) => x !== t.id)
                          )
                        }
                      />
                      {t.name}
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}
        </ProfileSection>

        <Card>
          <CardContent className="p-0">
            {rowFor('salary', canSalary)}
            {rowFor('payroll', canSalary)}
            {rowFor('bank', canSalary)}
            {rowFor('notes', true)}
            {rowFor('sensitive', canSensitive)}
            {rowFor('termination', canTerminate)}
            {rowFor('reference', true)}
            <button
              type="button"
              onClick={onDelete}
              disabled={!canDelete}
              className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-destructive/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-destructive">Delete employee record</span>
                <span className="block truncate text-xs text-muted-foreground">
                  Archive {guard.full_name}, or delete the record permanently
                </span>
              </span>
              <Trash2 className="size-4 shrink-0 text-destructive" />
            </button>
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          Pay rates used by the rota and payroll live on{' '}
          <Link href="/payroll" className="text-primary underline">
            Payroll
          </Link>
          . Salary here is the contractual figure, not the shift rate.
        </p>
      </div>

      <Dialog open={section != null} onOpenChange={(v) => (!v && !busy ? setSection(null) : undefined)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{section ? SECTIONS[section].title : ''}</DialogTitle>
          </DialogHeader>
          {section ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {SECTIONS[section].fields.map((f) => (
                  <div key={String(f.key)} className="space-y-1">
                    <Label>{f.label}</Label>
                    <Input
                      type={f.type ?? 'text'}
                      value={values[f.key as string] ?? ''}
                      onChange={(e) => setValues((p) => ({ ...p, [f.key as string]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>
              {section === 'termination' ? (
                <p className="rounded-md border bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                  A leaving date takes this employee out of the hub unless “include terminated
                  employees” is on. Their shifts, payroll and documents are untouched — use Archive
                  if you want the record hidden altogether.
                </p>
              ) : null}
              <div className="flex justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => setSection(null)} disabled={busy}>
                  Cancel
                </Button>
                <Button onClick={() => void save()} disabled={busy}>
                  {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                  Save
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
