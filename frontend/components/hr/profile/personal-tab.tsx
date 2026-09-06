'use client';

/**
 * Employee Profile → Personal: contact details, personal details, medical information.
 *
 * Each section reads first and edits on demand, because most visits are to look
 * something up rather than change it. Medical information saves on its own — the note is
 * visible to the employee, so it is kept apart from the rest rather than swept up in a
 * general save.
 */

import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { formatDateUK } from '@/lib/date-format';
import { toast } from '@/lib/toast';
import type { Guard } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ProfileSection({
  title,
  subtitle,
  action,
  children,
  defaultOpen = true,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 bg-muted/40 px-4 py-3 text-left hover:bg-muted/60"
      >
        <span>
          <span className="block text-sm font-semibold">{title}</span>
          {subtitle ? <span className="block text-xs text-muted-foreground">{subtitle}</span> : null}
        </span>
        <ChevronDown className={cn('size-4 shrink-0 transition-transform', !open && '-rotate-90')} />
      </button>
      {open ? (
        <CardContent className="space-y-4 pt-4">
          {action ? <div className="flex justify-end">{action}</div> : null}
          {children}
        </CardContent>
      ) : null}
    </Card>
  );
}

export function Field({ label, value }: { label: string; value?: string | number | null }) {
  const text = value == null || value === '' ? 'Not specified' : String(value);
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('truncate text-sm', text === 'Not specified' ? 'text-muted-foreground' : 'font-medium')}>
        {text}
      </p>
    </div>
  );
}

function ageFrom(dob?: string | null) {
  if (!dob) return null;
  const d = new Date(`${dob}T12:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

type EditFields = Partial<Record<keyof Guard, string>>;

function EditGrid({
  fields,
  values,
  onChange,
}: {
  fields: { key: keyof Guard; label: string; type?: string }[];
  values: EditFields;
  onChange: (key: keyof Guard, v: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((f) => (
        <div key={String(f.key)} className="space-y-1">
          <Label>{f.label}</Label>
          <Input
            type={f.type ?? 'text'}
            value={values[f.key] ?? ''}
            onChange={(e) => onChange(f.key, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}

export function PersonalTab({
  guard,
  canEdit,
  onSaved,
}: {
  guard: Guard;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState<'contact' | 'personal' | null>(null);
  const [values, setValues] = useState<EditFields>({});
  const [busy, setBusy] = useState(false);
  const [covid, setCovid] = useState(guard.covid_vaccinated ?? '');
  const [medNotes, setMedNotes] = useState(guard.medical_notes ?? '');
  const [medBusy, setMedBusy] = useState(false);

  useEffect(() => {
    setCovid(guard.covid_vaccinated ?? '');
    setMedNotes(guard.medical_notes ?? '');
  }, [guard.covid_vaccinated, guard.medical_notes]);

  const openEdit = (which: 'contact' | 'personal', keys: (keyof Guard)[]) => {
    const next: EditFields = {};
    for (const k of keys) {
      const v = guard[k];
      next[k] = v == null ? '' : String(v);
    }
    setValues(next);
    setEditing(which);
  };

  const save = async () => {
    setBusy(true);
    try {
      // Blank means "clear this field", so empty strings are sent as null rather than
      // dropped — otherwise a cleared phone number would silently stay put.
      const payload = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, (v ?? '').trim() === '' ? null : v])
      );
      await api.guards.update(guard.id, payload as Partial<Guard>);
      setEditing(null);
      onSaved();
      toast.success('Saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const saveMedical = async () => {
    setMedBusy(true);
    try {
      await api.guards.update(guard.id, {
        covid_vaccinated: covid || null,
        medical_notes: medNotes.trim() || null,
      } as Partial<Guard>);
      onSaved();
      toast.success('Medical information saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setMedBusy(false);
    }
  };

  const editButton = (which: 'contact' | 'personal', keys: (keyof Guard)[]) =>
    canEdit ? (
      <Button variant="outline" size="sm" onClick={() => openEdit(which, keys)}>
        <Pencil className="mr-1.5 size-3.5" />
        Edit
      </Button>
    ) : null;

  const saveBar = (
    <div className="flex justify-end gap-2 border-t pt-3">
      <Button variant="outline" size="sm" onClick={() => setEditing(null)} disabled={busy}>
        Cancel
      </Button>
      <Button size="sm" onClick={() => void save()} disabled={busy}>
        {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
        Save
      </Button>
    </div>
  );

  const age = ageFrom(guard.date_of_birth);

  return (
    <div className="space-y-4">
      <ProfileSection
        title="Contact information"
        action={editing === 'contact' ? null : editButton('contact', [
          'email', 'personal_email', 'home_phone', 'phone', 'work_phone', 'work_extension',
        ])}
      >
        {editing === 'contact' ? (
          <>
            <EditGrid
              fields={[
                { key: 'email', label: 'Account email', type: 'email' },
                { key: 'personal_email', label: 'Personal email', type: 'email' },
                { key: 'home_phone', label: 'Home phone' },
                { key: 'phone', label: 'Mobile phone' },
                { key: 'work_phone', label: 'Work phone' },
                { key: 'work_extension', label: 'Work extension' },
              ]}
              values={values}
              onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))}
            />
            {saveBar}
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Account email" value={guard.email} />
            <Field label="Personal email" value={guard.personal_email} />
            <Field label="Home phone" value={guard.home_phone} />
            <Field label="Mobile phone" value={guard.phone} />
            <Field label="Work phone" value={guard.work_phone} />
            <Field label="Work extension" value={guard.work_extension} />
          </div>
        )}
      </ProfileSection>

      <ProfileSection
        title="Personal information"
        action={editing === 'personal' ? null : editButton('personal', [
          'title', 'first_name', 'middle_name', 'last_name', 'date_of_birth', 'gender',
          'address_line_1', 'town_city', 'postcode', 'ethnicity',
        ])}
      >
        {editing === 'personal' ? (
          <>
            <EditGrid
              fields={[
                { key: 'title', label: 'Title' },
                { key: 'first_name', label: 'First name' },
                { key: 'middle_name', label: 'Middle name' },
                { key: 'last_name', label: 'Last name' },
                { key: 'date_of_birth', label: 'Date of birth', type: 'date' },
                { key: 'gender', label: 'Gender' },
                { key: 'address_line_1', label: 'Address' },
                { key: 'town_city', label: 'Town / city' },
                { key: 'postcode', label: 'Postcode' },
                { key: 'ethnicity', label: 'Ethnicity' },
              ]}
              values={values}
              onChange={(k, v) => setValues((p) => ({ ...p, [k]: v }))}
            />
            {saveBar}
          </>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" value={guard.title} />
            <Field label="First name" value={guard.first_name} />
            <Field label="Middle name" value={guard.middle_name} />
            <Field label="Last name" value={guard.last_name} />
            <Field
              label="Date of birth"
              value={
                guard.date_of_birth
                  ? `${formatDateUK(guard.date_of_birth)}${age != null ? `  (${age} years old)` : ''}`
                  : null
              }
            />
            <Field label="Gender" value={guard.gender} />
            <Field
              label="Address"
              value={[guard.address_line_1, guard.town_city, guard.postcode].filter(Boolean).join(', ') || null}
            />
            <Field label="Ethnicity" value={guard.ethnicity} />
          </div>
        )}
      </ProfileSection>

      <ProfileSection title="Medical information">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>COVID-19 vaccinated?</Label>
            <select
              className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              value={covid}
              onChange={(e) => setCovid(e.target.value)}
              disabled={!canEdit}
            >
              <option value="">Not Specified</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Add notes</Label>
          <textarea
            className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            maxLength={1000}
            value={medNotes}
            onChange={(e) => setMedNotes(e.target.value)}
            disabled={!canEdit}
          />
          <p className="text-xs text-muted-foreground">{medNotes.length}/1000</p>
          <div className="rounded-md border bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:bg-sky-950/30 dark:text-sky-200">
            Notes are visible to the employee.
          </div>
        </div>
        {canEdit ? (
          <div className="flex justify-end">
            <Button size="sm" onClick={() => void saveMedical()} disabled={medBusy}>
              {medBusy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
              Save
            </Button>
          </div>
        ) : null}
      </ProfileSection>
    </div>
  );
}
