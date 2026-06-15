'use client';

import { useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { guardSubmitSchema, type GuardFormData } from '@/lib/validation';
import {
  TITLES,
  GENDERS,
  ETHNICITIES,
  HOLIDAY_JURISDICTIONS,
  EMPLOYEE_TYPES,
  WORKING_TIME_PATTERNS,
  ENTITLEMENT_UNITS,
  EMERGENCY_RELATIONSHIPS,
  LEAVE_MONTHS,
  WEEKDAYS,
  PAY_FREQUENCIES,
} from '@/lib/guard-options';
import { cn } from '@/lib/utils';

const STEPS = ['Employee details', 'Employment details', 'Summary'] as const;

const REQUIRED_KEYS: (keyof GuardFormData)[] = ['first_name', 'last_name'];

const STEP0_KEYS: (keyof GuardFormData)[] = [
  'first_name',
  'last_name',
  'phone',
  'visa_status',
  'work_phone',
  'emergency_mobile',
  'emergency_home_phone',
  'emergency_work_phone',
  'bank_account_number',
];

const STEP1_KEYS: (keyof GuardFormData)[] = [
  'holiday_jurisdiction',
  'employee_type',
  'entitlement_unit',
  'working_time_pattern',
];

function stepForField(key: string) {
  if (STEP0_KEYS.includes(key as keyof GuardFormData)) return 0;
  if (STEP1_KEYS.includes(key as keyof GuardFormData)) return 1;
  return 0;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-4 space-y-4">
      <h3 className="font-semibold text-sm">{title}</h3>
      {children}
    </div>
  );
}

function HoursMins({
  label,
  hrsName,
  minsName,
  register,
}: {
  label: string;
  hrsName: keyof GuardFormData;
  minsName: keyof GuardFormData;
  register: ReturnType<typeof useForm<GuardFormData>>['register'];
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div className="flex gap-2 items-center">
        <Input type="number" min={0} className="w-20" {...register(hrsName, { valueAsNumber: true })} />
        <span className="text-sm text-muted-foreground">hrs</span>
        <Input type="number" min={0} max={59} className="w-20" {...register(minsName, { valueAsNumber: true })} />
        <span className="text-sm text-muted-foreground">mins</span>
      </div>
    </div>
  );
}

function RadioCards({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; description: string }[];
}) {
  return (
    <div className="grid gap-3">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'text-left rounded-lg border p-4 transition-colors',
            value === o.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/50'
          )}
        >
          <p className="font-medium text-sm">{o.label}</p>
          <p className="text-xs text-muted-foreground mt-1">{o.description}</p>
        </button>
      ))}
    </div>
  );
}

export function GuardFormWizard({
  form,
  mains,
  subs,
  onSubmit,
  isPending,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<GuardFormData>>;
  mains: { id: string; name: string }[];
  subs: { id: string; name: string }[];
  onSubmit: (data: GuardFormData) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const [step, setStep] = useState(0);
  const { register, handleSubmit, setValue, watch, trigger, clearErrors, getValues, formState: { errors } } = form;
  const cid = watch('contractor_id');
  const employeeType = watch('employee_type') ?? '';
  const entitlementUnit = watch('entitlement_unit') ?? '';
  const first = watch('first_name');
  const last = watch('last_name');

  const displayName = [first, last].filter(Boolean).join(' ') || 'New employee';

  const stepFields: (keyof GuardFormData)[][] = [
    ['first_name', 'last_name'],
    [],
    [],
  ];
  const selectedDays = (watch('available_days') || '').split(',').filter(Boolean);
  const toggleDay = (v: string) => {
    const set = new Set(selectedDays);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    setValue('available_days', [...set].join(','));
  };

  const onInvalid = (errs: FieldErrors<GuardFormData>) => {
    const keys = Object.keys(errs);
    if (keys.length) setStep(stepForField(keys[0]));
  };

  const errorMessages = Object.entries(errors)
    .map(([k, v]) => (v?.message ? `${k.replace(/_/g, ' ')}: ${v.message}` : null))
    .filter(Boolean) as string[];

  const goToSummary = async () => {
    const ok = await trigger(REQUIRED_KEYS);
    if (!ok) return;
    clearErrors();
    setStep(2);
  };

  const next = async () => {
    if (step === 0) {
      const ok = await trigger(stepFields[0]);
      if (ok) setStep(1);
      return;
    }
    if (step === 1) {
      await goToSummary();
    }
  };

  const saveSummary = () => {
    clearErrors();
    const values = getValues();
    const parsed = guardSubmitSchema.safeParse(values);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      if (first?.path[0]) setStep(stepForField(String(first.path[0])));
      return;
    }
    onSubmit({ ...getValues(), ...parsed.data } as GuardFormData);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (step === 2) saveSummary();
        else handleSubmit(onSubmit, onInvalid)(e);
      }}
      className="space-y-4"
    >
      {step !== 2 && errorMessages.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive space-y-1">
          <p className="font-medium">Please fix these fields:</p>
          <ul className="list-disc pl-4 text-xs">
            {errorMessages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex gap-0 text-sm font-medium">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cn(
              'flex-1 py-2 px-3 text-center border-b-2',
              i === step ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
            )}
          >
            {label}
          </div>
        ))}
      </div>

      <p className="text-lg font-semibold">{displayName}</p>

      {step === 0 && (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <div className="rounded-md border p-3 bg-muted/30 space-y-3">
            <p className="text-sm font-medium">Contractor (optional)</p>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Main contractor</Label>
                <Select
                  value={cid && mains.some((m) => m.id === cid) ? cid : '__none__'}
                  onValueChange={(v) => {
                    if (v === '__none__') {
                      if (mains.some((m) => m.id === cid)) setValue('contractor_id', undefined);
                      return;
                    }
                    setValue('contractor_id', v);
                    setValue('main_contractor_id', undefined);
                    setValue('sub_contractor_id', undefined);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Main" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {mains.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Sub contractor</Label>
                <Select
                  value={cid && subs.some((s) => s.id === cid) ? cid : '__none__'}
                  onValueChange={(v) => {
                    if (v === '__none__') {
                      if (subs.some((s) => s.id === cid)) setValue('contractor_id', undefined);
                      return;
                    }
                    setValue('contractor_id', v);
                    setValue('main_contractor_id', undefined);
                    setValue('sub_contractor_id', undefined);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Sub" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— None —</SelectItem>
                    {subs.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {errors.main_contractor_id && <p className="text-xs text-destructive">{errors.main_contractor_id.message}</p>}
          </div>

          <Section title="Basic details">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Title</Label>
                <Select value={watch('title') || '__none__'} onValueChange={(v) => setValue('title', v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Title" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>First name <span className="text-destructive">*</span></Label>
                <Input {...register('first_name')} />
                {errors.first_name && <p className="text-xs text-destructive">{errors.first_name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Middle name</Label>
                <Input {...register('middle_name')} />
              </div>
              <div className="space-y-1">
                <Label>Last name <span className="text-destructive">*</span></Label>
                <Input {...register('last_name')} />
                {errors.last_name && <p className="text-xs text-destructive">{errors.last_name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Mobile number</Label>
                <Input {...register('phone')} placeholder="e.g. 07700900123" />
                {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Visa status</Label>
                <Input {...register('visa_status')} placeholder="e.g. British citizen, Skilled Worker" />
                {errors.visa_status && <p className="text-xs text-destructive">{errors.visa_status.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Visa expiry</Label>
                <Input type="date" {...register('visa_expiry_date')} />
              </div>
              <div className="space-y-1">
                <Label>Gender</Label>
                <Select value={watch('gender') || 'Unspecified'} onValueChange={(v) => setValue('gender', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Ethnicity</Label>
                <Select value={watch('ethnicity') || 'Unspecified'} onValueChange={(v) => setValue('ethnicity', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ETHNICITIES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Date of birth</Label>
                <Input type="date" {...register('date_of_birth')} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" {...register('email')} />
                {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Work phone</Label>
                <Input {...register('work_phone')} />
              </div>
              <div className="space-y-1">
                <Label>Job title</Label>
                <Input {...register('job_title')} />
              </div>
              <div className="space-y-1">
                <Label>Employment start date</Label>
                <Input type="date" {...register('employment_start_date')} />
              </div>
              <div className="space-y-1">
                <Label>Probation end date</Label>
                <Input type="date" {...register('probation_end_date')} />
              </div>
            </div>
          </Section>

          <Section title="Address details">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2"><Label>Address 1</Label><Input {...register('address_line_1')} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Address 2</Label><Input {...register('address_line_2')} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Address 3</Label><Input {...register('address_line_3')} /></div>
              <div className="space-y-1"><Label>Town/City</Label><Input {...register('town_city')} /></div>
              <div className="space-y-1"><Label>County</Label><Input {...register('county')} /></div>
              <div className="space-y-1"><Label>Postcode</Label><Input {...register('postcode')} placeholder="e.g. E15 2AB" /></div>
            </div>
          </Section>

          <Section title="Area & availability">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Service area</Label>
                <Input {...register('service_area')} placeholder="e.g. East London" />
              </div>
              <div className="space-y-1">
                <Label>Nearby areas willing to work</Label>
                <Input {...register('nearby_areas')} placeholder="e.g. Stratford, Hackney" />
              </div>
              <div className="space-y-1 sm:col-span-2 flex items-center gap-2 pt-1">
                <input type="checkbox" id="has_car" className="size-4" {...register('has_car')} />
                <Label htmlFor="has_car" className="font-normal cursor-pointer">Has car / can drive to sites</Label>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Available days</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={cn(
                        'px-3 py-1 rounded-full text-xs border',
                        selectedDays.includes(d.value) ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Preferred timing</Label>
                <Input {...register('availability_timing')} placeholder="e.g. 06:00–14:00, nights only" />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Pay / contract period</Label>
                <div className="flex gap-2">
                  {PAY_FREQUENCIES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() => setValue('pay_frequency', p.value)}
                      className={cn(
                        'px-4 py-2 rounded-md border text-sm',
                        watch('pay_frequency') === p.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </Section>

          <Section title="Emergency contact">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>First name</Label><Input {...register('emergency_first_name')} /></div>
              <div className="space-y-1"><Label>Last name</Label><Input {...register('emergency_last_name')} /></div>
              <div className="space-y-1"><Label>Mobile</Label><Input {...register('emergency_mobile')} /></div>
              <div className="space-y-1"><Label>Home phone</Label><Input {...register('emergency_home_phone')} /></div>
              <div className="space-y-1"><Label>Work phone</Label><Input {...register('emergency_work_phone')} /></div>
              <div className="space-y-1">
                <Label>Relationship</Label>
                <Select value={watch('emergency_relationship') || '__none__'} onValueChange={(v) => setValue('emergency_relationship', v === '__none__' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Relationship" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">—</SelectItem>
                    {EMERGENCY_RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 sm:col-span-2"><Label>Address 1</Label><Input {...register('emergency_address_line_1')} /></div>
              <div className="space-y-1"><Label>Town/City</Label><Input {...register('emergency_town_city')} /></div>
              <div className="space-y-1"><Label>Postcode</Label><Input {...register('emergency_postcode')} /></div>
            </div>
          </Section>

          <Section title="Bank details">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Name on account</Label><Input {...register('bank_account_name')} maxLength={60} /></div>
              <div className="space-y-1"><Label>Name of bank</Label><Input {...register('bank_name')} maxLength={60} /></div>
              <div className="space-y-1"><Label>Bank branch</Label><Input {...register('bank_branch')} /></div>
              <div className="space-y-1"><Label>Account number</Label><Input {...register('bank_account_number')} placeholder="8 digit number" /></div>
              <div className="space-y-1"><Label>Sort code</Label><Input {...register('bank_sort_code')} placeholder="00-00-00" /></div>
            </div>
          </Section>

          <Section title="Sensitive details">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Tax code</Label><Input {...register('tax_code')} /></div>
              <div className="space-y-1"><Label>NI number</Label><Input {...register('ni_number')} /></div>
              <div className="space-y-1"><Label>Passport number</Label><Input {...register('passport_number')} /></div>
              <div className="space-y-1"><Label>Country of issue</Label><Input {...register('passport_country')} /></div>
              <div className="space-y-1"><Label>Passport expiry</Label><Input type="date" {...register('passport_expiry_date')} /></div>
              <div className="space-y-1"><Label>Licence number</Label><Input {...register('license_number')} /></div>
              <div className="space-y-1"><Label>Licence country</Label><Input {...register('driving_licence_country')} /></div>
              <div className="space-y-1"><Label>Licence class</Label><Input {...register('driving_licence_class')} /></div>
              <div className="space-y-1"><Label>Licence expiry</Label><Input type="date" {...register('driving_licence_expiry_date')} /></div>
            </div>
          </Section>

          <Section title="Security & compliance">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Badge number</Label><Input {...register('badge_number')} /></div>
              <div className="space-y-1"><Label>SIA number</Label><Input {...register('sia_number')} /></div>
              <div className="space-y-1"><Label>SIA expiry</Label><Input type="date" {...register('sia_expiry_date')} /></div>
              <div className="space-y-1"><Label>RTW status</Label><Input {...register('rtw_status')} /></div>
              <div className="space-y-1"><Label>Share code</Label><Input {...register('share_code')} placeholder="e.g. W12 345 67A" /></div>
              <div className="space-y-1"><Label>Share code expiry</Label><Input type="date" {...register('share_code_expiry_date')} /></div>
              <div className="space-y-1"><Label>DBS check</Label><Input {...register('dbs_status')} /></div>
              <div className="space-y-1 sm:col-span-2"><Label>Employment history (5 years)</Label><Input {...register('employment_history')} /></div>
            </div>
          </Section>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          <Section title="Location">
            <div className="space-y-1 max-w-md">
              <Label>Public holidays observed for</Label>
              <Select value={watch('holiday_jurisdiction') || ''} onValueChange={(v) => setValue('holiday_jurisdiction', v)}>
                <SelectTrigger><SelectValue placeholder="Select jurisdiction" /></SelectTrigger>
                <SelectContent>
                  {HOLIDAY_JURISDICTIONS.map((j) => (
                    <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.holiday_jurisdiction && <p className="text-xs text-destructive">{errors.holiday_jurisdiction.message}</p>}
            </div>
          </Section>

          <Section title="Employment details">
            <div className="space-y-3">
              <Label>Employee type</Label>
              <RadioCards
                value={employeeType}
                onChange={(v) => setValue('employee_type', v as 'fixed' | 'variable')}
                options={EMPLOYEE_TYPES.map((e) => ({ value: e.value, label: e.label, description: e.description }))}
              />
              {errors.employee_type && <p className="text-xs text-destructive">{errors.employee_type.message}</p>}
            </div>
            {employeeType === 'fixed' && (
              <div className="space-y-1 max-w-md mt-4">
                <Label>Working time pattern</Label>
                <Select value={watch('working_time_pattern') || ''} onValueChange={(v) => setValue('working_time_pattern', v)}>
                  <SelectTrigger><SelectValue placeholder="Select a working pattern" /></SelectTrigger>
                  <SelectContent>
                    {WORKING_TIME_PATTERNS.map((p) => (
                      <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.working_time_pattern && <p className="text-xs text-destructive">{errors.working_time_pattern.message}</p>}
              </div>
            )}
            <div className="mt-4 max-w-xs">
              <HoursMins label="Company's full time working week" hrsName="company_full_time_week_hrs" minsName="company_full_time_week_mins" register={register} />
            </div>
          </Section>

          <Section title="Contract details">
            <div className="space-y-3">
              <Label>Entitlement unit</Label>
              <RadioCards
                value={entitlementUnit}
                onChange={(v) => setValue('entitlement_unit', v as 'days' | 'hours')}
                options={ENTITLEMENT_UNITS.map((e) => ({ value: e.value, label: e.label, description: e.description }))}
              />
              {errors.entitlement_unit && <p className="text-xs text-destructive">{errors.entitlement_unit.message}</p>}
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <HoursMins label="Employee contracted hours per week" hrsName="contracted_week_hrs" minsName="contracted_week_mins" register={register} />
              <HoursMins label="Average working day" hrsName="average_day_hrs" minsName="average_day_mins" register={register} />
              <HoursMins label="Full time annual leave entitlement equivalent" hrsName="annual_leave_equivalent_hrs" minsName="annual_leave_equivalent_mins" register={register} />
            </div>
            <div className="flex gap-3 items-end mt-4 max-w-md">
              <div className="space-y-1 flex-1">
                <Label>Leave year start — day</Label>
                <Input type="number" min={1} max={31} {...register('leave_year_start_day', { valueAsNumber: true })} />
              </div>
              <div className="space-y-1 flex-1">
                <Label>Month</Label>
                <Select
                  value={String(watch('leave_year_start_month') || 1)}
                  onValueChange={(v) => setValue('leave_year_start_month', Number(v))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAVE_MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <HoursMins label="Leave entitlement" hrsName="leave_entitlement_hrs" minsName="leave_entitlement_mins" register={register} />
              <HoursMins label="Leave allowance" hrsName="leave_allowance_hrs" minsName="leave_allowance_mins" register={register} />
            </div>
          </Section>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Required: first name and last name. Mobile number, visa status, employee type and entitlement are optional.
          </p>
        <div className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted">
              <tr>
                <th className="text-left p-3 font-medium">Name</th>
                <th className="text-left p-3 font-medium">Email address</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="p-3 border-t">{displayName}</td>
                <td className="p-3 border-t">{watch('email') || '—'}</td>
              </tr>
            </tbody>
          </table>
          <div className="p-4 text-sm text-muted-foreground space-y-1 border-t">
            <p><span className="font-medium text-foreground">Jurisdiction:</span> {HOLIDAY_JURISDICTIONS.find((j) => j.value === watch('holiday_jurisdiction'))?.label || '—'}</p>
            <p><span className="font-medium text-foreground">Employee type:</span> {EMPLOYEE_TYPES.find((e) => e.value === employeeType)?.label || '—'}</p>
            <p><span className="font-medium text-foreground">Entitlement:</span> {entitlementUnit || '—'}</p>
          </div>
        </div>
        </div>
      )}

      <div className="flex justify-between gap-2 pt-2">
        <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          Back
        </Button>
        <div className="flex gap-2">
          {step < 2 && (
            <Button type="button" onClick={next}>
              Next
            </Button>
          )}
          {step === 2 && (
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving...' : submitLabel}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
