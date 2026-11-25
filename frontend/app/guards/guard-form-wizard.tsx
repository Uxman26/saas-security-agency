'use client';

import { useMemo, useState } from 'react';
import { useForm, type FieldErrors, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { PasswordInput } from '@/components/ui/password-input';
import { guardCreateSchema, PASSWORD_REQUIREMENTS_MSG, type GuardFormData, type GuardSaveSchema } from '@/lib/validation';
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
  mergeJobTitles,
} from '@/lib/guard-options';
import { PhoneInput } from '@/components/ui/phone-input';
import { DateOfBirthPicker } from '@/components/ui/date-of-birth-picker';
import { cn } from '@/lib/utils';
import {
  BriefcaseBusiness,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ImagePlus,
  Info,
  type LucideIcon,
  MapPin,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserRound,
} from 'lucide-react';

const STEPS: { label: string; hint: string; icon: LucideIcon; title: string; description: string }[] = [
  {
    label: 'Personal details',
    hint: 'Profile & contact',
    icon: UserRound,
    title: 'Personal details',
    description: "Start with the essentials about this team member.",
  },
  {
    label: 'Address & bank',
    hint: 'Location & payment',
    icon: MapPin,
    title: 'Address & banking',
    description: 'Home address, availability, emergency contact and payment details.',
  },
  {
    label: 'Compliance',
    hint: 'Identity & SIA',
    icon: ShieldCheck,
    title: 'Identity & compliance',
    description: 'Right-to-work, licensing and identity details in one place.',
  },
  {
    label: 'Employment',
    hint: 'Working arrangements',
    icon: BriefcaseBusiness,
    title: 'Employment setup',
    description: 'Working pattern, pay and leave entitlement.',
  },
  {
    label: 'Review & finish',
    hint: 'Confirm details',
    icon: ClipboardCheck,
    title: 'Review & finish',
    description: 'Check these details before saving.',
  },
];

const LAST_STEP = STEPS.length - 1;
const EMPLOYMENT_STEP = 3;

const REQUIRED_KEYS: (keyof GuardFormData)[] = ['first_name', 'last_name', 'phone', 'email'];

/** Fields checked when leaving each step (format checks only; the rest is checked on save). */
const STEP_VALIDATE: (keyof GuardFormData)[][] = [
  [...REQUIRED_KEYS, 'work_phone'],
  ['emergency_mobile', 'emergency_home_phone', 'emergency_work_phone', 'bank_account_number'],
  [],
  [],
  [],
];

/** Which step shows a field, so an error can take the user to it. Unlisted fields are on step 0. */
const FIELD_STEP: Partial<Record<keyof GuardFormData, number>> = {
  address_line_1: 1,
  address_line_2: 1,
  address_line_3: 1,
  town_city: 1,
  county: 1,
  postcode: 1,
  service_area: 1,
  nearby_areas: 1,
  available_days: 1,
  availability_timing: 1,
  pay_frequency: 1,
  emergency_first_name: 1,
  emergency_last_name: 1,
  emergency_mobile: 1,
  emergency_home_phone: 1,
  emergency_work_phone: 1,
  emergency_relationship: 1,
  emergency_address_line_1: 1,
  emergency_town_city: 1,
  emergency_postcode: 1,
  bank_account_name: 1,
  bank_name: 1,
  bank_branch: 1,
  bank_account_number: 1,
  bank_sort_code: 1,
  tax_code: 2,
  ni_number: 2,
  passport_number: 2,
  passport_country: 2,
  passport_expiry_date: 2,
  license_number: 2,
  driving_licence_country: 2,
  driving_licence_class: 2,
  driving_licence_expiry_date: 2,
  badge_number: 2,
  sia_number: 2,
  sia_expiry_date: 2,
  rtw_status: 2,
  share_code: 2,
  share_code_expiry_date: 2,
  dbs_status: 2,
  employment_history: 2,
  employment_start_date: 3,
  probation_end_date: 3,
  holiday_jurisdiction: 3,
  employee_type: 3,
  working_time_pattern: 3,
  employment_pay_type: 3,
  pay_method: 3,
  salary_amount: 3,
  weekly_contracted_hours: 3,
  hourly_rate: 3,
  per_job_rate: 3,
  entitlement_unit: 3,
  contracted_week_hrs: 3,
  // The login fields live on the review step, so their errors must keep the user there.
  create_login: 4,
  login_password: 4,
  login_with: 4,
};

function stepForField(key: string) {
  return FIELD_STEP[key as keyof GuardFormData] ?? 0;
}

type AddressHistoryEntry = { address: string; from: string; to: string };

const EMPTY_ADDRESS_ENTRY: AddressHistoryEntry = { address: '', from: '', to: '' };

/** Stored as a JSON array in `employment_history`; older free-text values load into the first row. */
function parseAddressHistory(raw: string): AddressHistoryEntry[] {
  const text = (raw || '').trim();
  if (!text) return [{ ...EMPTY_ADDRESS_ENTRY }];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      const rows = parsed
        .filter((r) => r && typeof r === 'object')
        .map((r) => ({ address: String(r.address ?? ''), from: String(r.from ?? ''), to: String(r.to ?? '') }));
      if (rows.length) return rows;
    }
  } catch {
    /* legacy free text */
  }
  return [{ address: text, from: '', to: '' }];
}

function serializeAddressHistory(rows: AddressHistoryEntry[]): string {
  const filled = rows
    .map((r) => ({ address: r.address.trim(), from: r.from, to: r.to }))
    .filter((r) => r.address || r.from || r.to);
  return filled.length ? JSON.stringify(filled) : '';
}

function AddressHistoryInput({ initial, onChange }: { initial: string; onChange: (value: string) => void }) {
  const [rows, setRows] = useState<AddressHistoryEntry[]>(() => parseAddressHistory(initial));

  const update = (next: AddressHistoryEntry[]) => {
    setRows(next);
    onChange(serializeAddressHistory(next));
  };
  const patch = (i: number, field: keyof AddressHistoryEntry, value: string) =>
    update(rows.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  const remove = (i: number) => {
    const next = rows.filter((_, idx) => idx !== i);
    update(next.length ? next : [{ ...EMPTY_ADDRESS_ENTRY }]);
  };

  return (
    <div className="space-y-3">
      {rows.map((row, i) => (
        <div key={i} className="grid min-w-0 gap-3 rounded-lg border bg-muted/20 p-3 sm:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5 sm:col-span-3">
            <Label className="text-xs text-muted-foreground">Address {rows.length > 1 ? i + 1 : ''}</Label>
            <Input value={row.address} onChange={(e) => patch(i, 'address', e.target.value)} placeholder="Full address incl. postcode" maxLength={300} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">From</Label>
            <Input type="date" value={row.from} max={row.to || undefined} onChange={(e) => patch(i, 'from', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">To</Label>
            <Input type="date" value={row.to} min={row.from || undefined} onChange={(e) => patch(i, 'to', e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`Remove address ${i + 1}`}
              onClick={() => remove(i)}
              disabled={rows.length === 1 && !row.address && !row.from && !row.to}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => update([...rows, { ...EMPTY_ADDRESS_ENTRY }])}>
        <Plus className="mr-1 h-4 w-4" /> Add address
      </Button>
    </div>
  );
}

function Section({
  index,
  title,
  subtitle,
  children,
}: {
  index: number;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border bg-card shadow-xs">
      <header className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <h3 className="flex items-center gap-2.5 text-sm font-semibold">
          <span className="grid size-6 place-items-center rounded-md bg-primary/10 text-xs font-bold text-primary tabular-nums">
            {String(index).padStart(2, '0')}
          </span>
          {title}
        </h3>
        {subtitle ? <span className="hidden text-xs text-muted-foreground sm:block">{subtitle}</span> : null}
      </header>
      <div className="min-w-0 p-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  className,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  error?: string;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <Label className="text-xs font-semibold text-foreground/80">
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

function SummaryCard({
  title,
  onEdit,
  rows,
}: {
  title: string;
  onEdit: () => void;
  rows: [string, React.ReactNode][];
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h4 className="text-sm font-semibold">{title}</h4>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs text-primary" onClick={onEdit}>
          <Pencil className="size-3" />
          Edit
        </Button>
      </div>
      <dl className="space-y-2.5">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 text-xs">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="min-w-0 truncate text-right font-medium">{v || '—'}</dd>
          </div>
        ))}
      </dl>
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
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            'relative rounded-xl border p-4 pl-11 text-left transition-colors',
            value === o.value ? 'border-primary/60 bg-primary/5 ring-1 ring-primary/30' : 'hover:bg-muted/50'
          )}
        >
          <span
            className={cn(
              'absolute left-4 top-4.5 grid size-4 place-items-center rounded-full border',
              value === o.value ? 'border-primary' : 'border-muted-foreground/40'
            )}
          >
            {value === o.value ? <span className="size-2 rounded-full bg-primary" /> : null}
          </span>
          <p className="text-sm font-medium">{o.label}</p>
          <p className="mt-1 text-xs text-muted-foreground">{o.description}</p>
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
  photoFile,
  onPhotoFileChange,
  existingJobTitles,
  jobTitles: companyJobTitles,
  onCreateJobTitle,
  allowLogin = false,
  submitSchema = guardCreateSchema,
  requireEmail = true,
  saveFromAnyStep = false,
  checkDuplicate,
}: {
  form: ReturnType<typeof useForm<GuardFormData>>;
  mains: { id: string; name: string }[];
  subs: { id: string; name: string }[];
  onSubmit: (data: GuardFormData) => void;
  isPending: boolean;
  submitLabel: string;
  photoFile?: File | null;
  onPhotoFileChange?: (file: File | null) => void;
  existingJobTitles?: string[];
  /** The company's job title list, from /job-titles. */
  jobTitles?: string[];
  /** Saves a title typed into the picker so it joins the company list for everyone. */
  onCreateJobTitle?: (name: string) => void | Promise<void>;
  /** Only the create flows provision logins; editing a guard must not silently make one. */
  allowLogin?: boolean;
  /** Schema run on save; it decides whether mobile and email are mandatory. */
  submitSchema?: GuardSaveSchema;
  /** Marks the email field as required (keep in step with submitSchema). */
  requireEmail?: boolean;
  /** Editing: show Save on every step so a change need not be walked to the last one. */
  saveFromAnyStep?: boolean;
  /** Asks the server whether the email or mobile already belongs to another staff member. */
  checkDuplicate?: (email: string, phone: string) => Promise<{ field: 'email' | 'phone'; message: string }[]>;
}) {
  const [step, setStep] = useState(0);

  const { register, handleSubmit, setValue, watch, trigger, clearErrors, setError, getValues, formState: { errors } } = form;
  const createLogin = watch('create_login');
  const cid = watch('contractor_id');
  const employeeType = watch('employee_type') ?? '';
  const entitlementUnit = watch('entitlement_unit') ?? '';
  const first = watch('first_name');
  const last = watch('last_name');
  const jobTitle = watch('job_title') || '';

  // Titles a staff record already carries are offered alongside the company list, so an
  // older or since-deleted title still shows on the person who holds it.
  const jobTitleOptions = useMemo(
    () => mergeJobTitles(companyJobTitles ?? [], existingJobTitles ?? []).map((t) => ({ value: t, label: t })),
    [companyJobTitles, existingJobTitles]
  );

  const displayName = [first, last].filter(Boolean).join(' ') || 'New employee';

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

  /** Pay rules belong to the employment step, so stop there rather than letting Save bounce back. */
  const payIssuesOk = () => {
    clearErrors();
    const pay = submitSchema.safeParse(getValues());
    const payIssues = pay.success
      ? []
      : pay.error.issues.filter((i) => stepForField(String(i.path[0] ?? '')) === EMPLOYMENT_STEP);
    if (payIssues.length) {
      for (const issue of payIssues) setError(String(issue.path[0]) as keyof GuardFormData, { message: issue.message });
      setStep(EMPLOYMENT_STEP);
      return false;
    }
    return true;
  };

  /** Server-side duplicate check of email and mobile; marks the fields and returns false on a clash. */
  const contactIsUnique = async () => {
    if (!checkDuplicate) return true;
    const email = (getValues('email') || '').trim();
    const phone = (getValues('phone') || '').trim();
    if (!email && !phone) return true;
    try {
      const clashes = await checkDuplicate(email, phone);
      for (const c of clashes) setError(c.field, { message: c.message });
      if (clashes.length) {
        setStep(0);
        return false;
      }
    } catch {
      /* the save itself re-checks, so a failed lookup must not block the user */
    }
    return true;
  };

  /** Next and tab clicks: going back is free; going forward checks every step it passes. */
  const goToStep = async (target: number) => {
    if (target === step) return;
    if (target < step) {
      setStep(target);
      return;
    }
    for (let s = step; s < target; s++) {
      const keys = STEP_VALIDATE[s];
      if (keys.length && !(await trigger(keys))) {
        setStep(s);
        return;
      }
      if (s === 0 && !(await contactIsUnique())) return;
    }
    if (target === LAST_STEP) {
      if (!(await trigger(REQUIRED_KEYS))) {
        setStep(0);
        return;
      }
      if (!payIssuesOk()) return;
    }
    setStep(target);
  };

  const saveSummary = async () => {
    clearErrors();
    const values = getValues();
    const parsed = submitSchema.safeParse(values);
    if (!parsed.success) {
      // Surface the messages: without this a failure only jumps step, so an invalid
      // login password would make Save look like it did nothing at all.
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (path) setError(String(path) as keyof GuardFormData, { message: issue.message });
      }
      const firstIssue = parsed.error.issues[0];
      if (firstIssue?.path[0]) setStep(stepForField(String(firstIssue.path[0])));
      return;
    }
    if (!(await contactIsUnique())) return;
    onSubmit({ ...getValues(), ...parsed.data } as GuardFormData);
  };

  const current = STEPS[step];
  const progress = Math.round(((step + 1) / STEPS.length) * 100);
  const err = (k: keyof GuardFormData) => errors[k]?.message as string | undefined;
  const payType = watch('employment_pay_type');
  const payMethod = watch('pay_method');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (step === LAST_STEP || saveFromAnyStep) void saveSummary();
        else handleSubmit(onSubmit, onInvalid)(e);
      }}
      className="min-w-0 max-w-full"
    >
      <div className="grid min-w-0 gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
        {/* Step navigation: a sidebar on desktop, a scrolling strip on mobile */}
        <aside className="min-w-0 md:sticky md:top-0 md:self-start" aria-label="Form steps">
          <p className="mb-3 hidden px-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground md:block">
            {STEPS.length} simple steps
          </p>
          <nav className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:mx-0 md:flex-col md:overflow-visible md:px-0 md:pb-0">
            {STEPS.map((st, i) => {
              const isCurrent = i === step;
              const isDone = i < step;
              return (
                <button
                  key={st.label}
                  type="button"
                  aria-current={isCurrent ? 'step' : undefined}
                  onClick={() => void goToStep(i)}
                  className={cn(
                    'flex shrink-0 items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors md:w-full md:py-2.5',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isCurrent ? 'border-primary/30 bg-primary/10' : 'border-transparent hover:bg-muted'
                  )}
                >
                  <span
                    className={cn(
                      'grid size-8 shrink-0 place-items-center rounded-lg border text-xs font-bold tabular-nums',
                      isCurrent && 'border-primary bg-primary text-primary-foreground shadow-sm',
                      isDone && 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-400',
                      !isCurrent && !isDone && 'bg-background text-muted-foreground'
                    )}
                  >
                    {isDone ? <Check className="size-4" /> : String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="min-w-0">
                    <span className={cn('block text-xs font-semibold leading-tight md:text-sm', isCurrent ? 'text-primary' : 'text-foreground/80')}>
                      {st.label}
                    </span>
                    <span className="mt-0.5 hidden text-xs text-muted-foreground md:block">{st.hint}</span>
                  </span>
                </button>
              );
            })}
          </nav>
          <div className="mt-6 hidden rounded-xl border bg-card p-4 md:block">
            <span className="mb-2 grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
              <Info className="size-4" />
            </span>
            <p className="text-xs font-semibold">Quick setup</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Name, mobile number{requireEmail ? ' and email' : ''} are required. Everything else can be added later.
            </p>
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold tracking-wider text-primary">
                STEP {String(step + 1).padStart(2, '0')} OF {String(STEPS.length).padStart(2, '0')}
              </span>
              <span className="text-muted-foreground">{progress}% complete</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
                <current.icon className="size-5 text-primary" />
                {current.title}
              </h2>
              <p className="text-sm text-muted-foreground">{current.description}</p>
            </div>
            <span className="max-w-full truncate rounded-full border bg-muted/40 px-3 py-1 text-xs font-medium text-muted-foreground">
              {displayName}
            </span>
          </div>

          {step !== LAST_STEP && errorMessages.length > 0 && (
            <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <p className="font-medium">Please fix these fields:</p>
              <ul className="list-disc pl-4 text-xs">
                {errorMessages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          {step === 0 && (
            <div className="min-w-0 space-y-4">
              <Section index={1} title="Employee profile" subtitle="Basic information">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field label="Main contractor (optional)" error={err('main_contractor_id')}>
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
                      <SelectTrigger className="w-full"><SelectValue placeholder="None selected" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None selected</SelectItem>
                        {mains.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Sub-contractor">
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
                      <SelectTrigger className="w-full"><SelectValue placeholder="None selected" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None selected</SelectItem>
                        {subs.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>

                  {onPhotoFileChange ? (
                    <Field label="Staff photo (optional)" className="sm:col-span-2">
                      <label className="flex cursor-pointer items-center gap-4 rounded-xl border-[1.5px] border-dashed border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10">
                        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
                          <ImagePlus className="size-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            {photoFile ? photoFile.name : 'Upload a profile photo'}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            JPG or PNG. Shown on the staff profile, not on the shift rota.
                          </span>
                        </span>
                        <input
                          type="file"
                          accept="image/*"
                          className="sr-only"
                          onChange={(e) => onPhotoFileChange(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </Field>
                  ) : null}

                  <Field label="Title">
                    <Select value={watch('title') || '__none__'} onValueChange={(v) => setValue('title', v === '__none__' ? '' : v)}>
                      <SelectTrigger className="w-full min-w-0"><SelectValue placeholder="Select title" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Select title</SelectItem>
                        {TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="First name" required error={err('first_name')}>
                    <Input className="min-w-0" maxLength={80} placeholder="e.g. Sarah" {...register('first_name')} />
                  </Field>
                  <Field label="Middle name">
                    <Input className="min-w-0" maxLength={80} placeholder="Optional" {...register('middle_name')} />
                  </Field>
                  <Field label="Last name" required error={err('last_name')}>
                    <Input className="min-w-0" maxLength={80} placeholder="e.g. Williams" {...register('last_name')} />
                  </Field>
                  <Field label="Gender">
                    <Select value={watch('gender') || 'Unspecified'} onValueChange={(v) => setValue('gender', v)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{GENDERS.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Date of birth">
                    <DateOfBirthPicker
                      value={watch('date_of_birth')}
                      onChange={(v) => setValue('date_of_birth', v, { shouldDirty: true })}
                    />
                  </Field>
                  <Field label="Ethnicity">
                    <Select value={watch('ethnicity') || 'Unspecified'} onValueChange={(v) => setValue('ethnicity', v)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{ETHNICITIES.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                </div>
              </Section>

              <Section index={2} title="Contact & role" subtitle="How to reach them">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field label="Mobile number" required error={err('phone')} hint="Digits only after country code (e.g. UK +44).">
                    <PhoneInput value={watch('phone') || ''} onChange={(v) => setValue('phone', v, { shouldValidate: true })} />
                  </Field>
                  <Field label="Email address" required={requireEmail} error={err('email')}>
                    <Input type="email" placeholder="name@example.com" {...register('email')} />
                  </Field>
                  <Field label="Work phone" error={err('work_phone')}>
                    <PhoneInput value={watch('work_phone') || ''} onChange={(v) => setValue('work_phone', v, { shouldValidate: true })} />
                  </Field>
                  <Field label="Job title">
                    <SearchableSelect
                      value={jobTitle}
                      options={jobTitleOptions}
                      placeholder="Select or add job title"
                      searchPlaceholder="Search job titles…"
                      allowCreate
                      createLabel={(q) => `Add “${q}”`}
                      onChange={(v) => {
                        setValue('job_title', v, { shouldValidate: true });
                        void onCreateJobTitle?.(v);
                      }}
                    />
                  </Field>
                  <Field label="Visa type / status" error={err('visa_status')}>
                    <Input className="min-w-0" maxLength={100} {...register('visa_status')} placeholder="e.g. British citizen, Skilled Worker" />
                  </Field>
                  <Field label="Visa expiry">
                    <Input type="date" {...register('visa_expiry_date')} />
                  </Field>
                </div>
              </Section>
            </div>
          )}

          {step === 1 && (
            <div className="min-w-0 space-y-4">
              <Section index={1} title="Address details">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field label="Address line 1" className="sm:col-span-2">
                    <Input className="min-w-0" maxLength={200} placeholder="House number and street" {...register('address_line_1')} />
                  </Field>
                  <Field label="Address line 2" className="sm:col-span-2">
                    <Input className="min-w-0" maxLength={200} placeholder="Apartment, building etc. (optional)" {...register('address_line_2')} />
                  </Field>
                  <Field label="Address line 3" className="sm:col-span-2">
                    <Input className="min-w-0" maxLength={200} placeholder="Optional" {...register('address_line_3')} />
                  </Field>
                  <Field label="Town / City">
                    <Input className="min-w-0" maxLength={200} placeholder="e.g. Slough" {...register('town_city')} />
                  </Field>
                  <Field label="County">
                    <Input className="min-w-0" maxLength={200} {...register('county')} />
                  </Field>
                  <Field label="Postcode">
                    <Input className="min-w-0" maxLength={20} placeholder="e.g. SL1 2JA" {...register('postcode')} />
                  </Field>
                </div>
              </Section>

              <Section index={2} title="Area & availability" subtitle="Where and when they work">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field label="Service area">
                    <Input className="min-w-0" maxLength={200} {...register('service_area')} placeholder="e.g. East London" />
                  </Field>
                  <Field label="Nearby areas willing to work">
                    <Input className="min-w-0" maxLength={200} {...register('nearby_areas')} placeholder="e.g. Stratford, Hackney" />
                  </Field>
                  <label
                    htmlFor="has_car"
                    className="flex cursor-pointer items-start gap-3 rounded-lg border bg-muted/30 px-3 py-3 sm:col-span-2"
                  >
                    <input type="checkbox" id="has_car" className="mt-0.5 size-4 shrink-0 accent-primary" {...register('has_car')} />
                    <span className="text-sm leading-snug">Has car / can drive to sites</span>
                  </label>
                  <Field label="Available days" className="sm:col-span-2">
                    <div className="flex flex-wrap gap-2">
                      {WEEKDAYS.map((d) => (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleDay(d.value)}
                          className={cn(
                            'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                            selectedDays.includes(d.value) ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted'
                          )}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Preferred timing" className="sm:col-span-2">
                    <Input className="min-w-0" maxLength={200} {...register('availability_timing')} placeholder="e.g. 06:00–14:00, nights only" />
                  </Field>
                  <Field label="Pay / contract period" className="sm:col-span-2">
                    <div className="flex gap-2">
                      {PAY_FREQUENCIES.map((p) => (
                        <button
                          key={p.value}
                          type="button"
                          onClick={() => setValue('pay_frequency', p.value)}
                          className={cn(
                            'rounded-lg border px-4 py-2 text-sm transition-colors',
                            watch('pay_frequency') === p.value ? 'border-primary/60 bg-primary/5 font-medium text-primary' : 'hover:bg-muted/50'
                          )}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </Field>
                </div>
              </Section>

              <Section index={3} title="Emergency contact">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field label="First name"><Input {...register('emergency_first_name')} /></Field>
                  <Field label="Last name"><Input {...register('emergency_last_name')} /></Field>
                  <Field label="Mobile" error={err('emergency_mobile')}>
                    <PhoneInput value={watch('emergency_mobile') || ''} onChange={(v) => setValue('emergency_mobile', v, { shouldValidate: true })} />
                  </Field>
                  <Field label="Home phone" error={err('emergency_home_phone')}>
                    <PhoneInput value={watch('emergency_home_phone') || ''} onChange={(v) => setValue('emergency_home_phone', v, { shouldValidate: true })} />
                  </Field>
                  <Field label="Work phone" error={err('emergency_work_phone')}>
                    <PhoneInput value={watch('emergency_work_phone') || ''} onChange={(v) => setValue('emergency_work_phone', v, { shouldValidate: true })} />
                  </Field>
                  <Field label="Relationship">
                    <Select
                      value={watch('emergency_relationship') || '__none__'}
                      onValueChange={(v) => setValue('emergency_relationship', v === '__none__' ? '' : v)}
                    >
                      <SelectTrigger className="w-full"><SelectValue placeholder="Relationship" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">—</SelectItem>
                        {EMERGENCY_RELATIONSHIPS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Address line 1" className="sm:col-span-2"><Input {...register('emergency_address_line_1')} /></Field>
                  <Field label="Town / City"><Input {...register('emergency_town_city')} /></Field>
                  <Field label="Postcode"><Input {...register('emergency_postcode')} /></Field>
                </div>
              </Section>

              <Section index={4} title="Bank details" subtitle="Payment information">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field label="Name on account"><Input {...register('bank_account_name')} maxLength={60} placeholder="Account holder's name" /></Field>
                  <Field label="Name of bank"><Input {...register('bank_name')} maxLength={60} placeholder="e.g. Lloyds Bank" /></Field>
                  <Field label="Bank branch"><Input {...register('bank_branch')} placeholder="Optional" /></Field>
                  <Field label="Account number" error={err('bank_account_number')}>
                    <Input {...register('bank_account_number')} inputMode="numeric" placeholder="8-digit number" autoComplete="off" />
                  </Field>
                  <Field label="Sort code"><Input {...register('bank_sort_code')} inputMode="numeric" placeholder="00-00-00" autoComplete="off" /></Field>
                </div>
              </Section>
            </div>
          )}

          {step === 2 && (
            <div className="min-w-0 space-y-4">
              <Section index={1} title="Sensitive details" subtitle="Restricted information">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field label="Tax code"><Input {...register('tax_code')} placeholder="e.g. 1257L" /></Field>
                  <Field label="NI number"><Input {...register('ni_number')} placeholder="e.g. QQ 12 34 56 C" /></Field>
                  <Field label="Passport number"><Input {...register('passport_number')} /></Field>
                  <Field label="Country of issue"><Input {...register('passport_country')} /></Field>
                  <Field label="Passport expiry"><Input type="date" {...register('passport_expiry_date')} /></Field>
                  <Field label="Driving licence number"><Input {...register('license_number')} /></Field>
                  <Field label="Licence country"><Input {...register('driving_licence_country')} /></Field>
                  <Field label="Licence class"><Input {...register('driving_licence_class')} /></Field>
                  <Field label="Licence expiry"><Input type="date" {...register('driving_licence_expiry_date')} /></Field>
                </div>
              </Section>

              <Section index={2} title="Security & compliance" subtitle="SIA / right to work">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field label="Badge number"><Input {...register('badge_number')} /></Field>
                  <Field label="SIA badge number"><Input {...register('sia_number')} /></Field>
                  <Field label="SIA expiry"><Input type="date" {...register('sia_expiry_date')} /></Field>
                  <Field label="Right to work status"><Input {...register('rtw_status')} /></Field>
                  <Field label="Share code"><Input {...register('share_code')} placeholder="e.g. W12 345 67A" /></Field>
                  <Field label="Share code expiry"><Input type="date" {...register('share_code_expiry_date')} /></Field>
                  <Field label="DBS check"><Input {...register('dbs_status')} placeholder="e.g. Complete / pending" /></Field>
                  <Field label="Address history (last 5 years)" className="sm:col-span-2">
                    <AddressHistoryInput
                      initial={getValues('employment_history') || ''}
                      onChange={(v) => setValue('employment_history', v, { shouldDirty: true, shouldValidate: true })}
                    />
                  </Field>
                </div>
              </Section>
            </div>
          )}

          {step === 3 && (
            <div className="min-w-0 space-y-4">
              <Section index={1} title="Position & location">
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field label="Employment start date"><Input type="date" {...register('employment_start_date')} /></Field>
                  <Field label="Probation end date"><Input type="date" {...register('probation_end_date')} /></Field>
                  <Field label="Public holidays observed for" error={err('holiday_jurisdiction')} className="sm:col-span-2">
                    <Select value={watch('holiday_jurisdiction') || ''} onValueChange={(v) => setValue('holiday_jurisdiction', v)}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="Select jurisdiction" /></SelectTrigger>
                      <SelectContent>
                        {HOLIDAY_JURISDICTIONS.map((j) => (
                          <SelectItem key={j.value} value={j.value}>{j.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </Section>

              <Section index={2} title="Working arrangements">
                <div className="space-y-5">
                  <Field label="Hours pattern" error={err('employee_type')}>
                    <RadioCards
                      value={employeeType}
                      onChange={(v) => setValue('employee_type', v as 'fixed' | 'variable')}
                      options={EMPLOYEE_TYPES.map((e) => ({ value: e.value, label: e.label, description: e.description }))}
                    />
                  </Field>
                  {employeeType === 'fixed' && (
                    <Field label="Working time pattern" error={err('working_time_pattern')} className="max-w-md">
                      <Select value={watch('working_time_pattern') || ''} onValueChange={(v) => setValue('working_time_pattern', v)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select a working pattern" /></SelectTrigger>
                        <SelectContent>
                          {WORKING_TIME_PATTERNS.map((p) => (
                            <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                  <Field label="Employment type" error={err('employment_pay_type')}>
                    <RadioCards
                      value={payType || ''}
                      onChange={(v) => {
                        setValue('employment_pay_type', v as 'salaried' | 'non_salaried');
                        if (v === 'salaried') setValue('pay_method', '');
                      }}
                      options={[
                        { value: 'salaried', label: 'Salaried', description: 'Fixed pay with contracted weekly hours.' },
                        { value: 'non_salaried', label: 'Non-salaried', description: 'Paid by the hour or per job.' },
                      ]}
                    />
                  </Field>
                  {payType === 'salaried' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Salary" error={err('salary_amount')}>
                        <Input type="number" min={0} step="0.01" {...register('salary_amount', { valueAsNumber: true })} />
                      </Field>
                      <Field label="Weekly hours" error={err('weekly_contracted_hours')}>
                        <Input type="number" min={0} step="0.25" {...register('weekly_contracted_hours', { valueAsNumber: true })} />
                      </Field>
                    </div>
                  )}
                  {payType === 'non_salaried' && (
                    <div className="space-y-4">
                      <Field label="Payment method" error={err('pay_method')}>
                        <RadioCards
                          value={payMethod || ''}
                          onChange={(v) => setValue('pay_method', v as 'per_hour' | 'per_job')}
                          options={[
                            { value: 'per_hour', label: 'Per hour', description: 'Hourly rate for rota and payroll.' },
                            { value: 'per_job', label: 'Per job', description: 'Flat rate per job/shift.' },
                          ]}
                        />
                      </Field>
                      {payMethod === 'per_hour' && (
                        <Field label="Per hour rate" error={err('hourly_rate')} className="max-w-xs">
                          <Input type="number" min={0} step="0.01" {...register('hourly_rate', { valueAsNumber: true })} />
                        </Field>
                      )}
                      {payMethod === 'per_job' && (
                        <Field label="Per job rate" error={err('per_job_rate')} className="max-w-xs">
                          <Input type="number" min={0} step="0.01" {...register('per_job_rate', { valueAsNumber: true })} />
                        </Field>
                      )}
                    </div>
                  )}
                  <HoursMins
                    label="Company's full-time working week"
                    hrsName="company_full_time_week_hrs"
                    minsName="company_full_time_week_mins"
                    register={register}
                  />
                </div>
              </Section>

              <Section index={3} title="Contract details" subtitle="Leave & entitlement">
                <div className="space-y-5">
                  <Field label="Entitlement unit" error={err('entitlement_unit')}>
                    <RadioCards
                      value={entitlementUnit}
                      onChange={(v) => setValue('entitlement_unit', v as 'days' | 'hours')}
                      options={ENTITLEMENT_UNITS.map((e) => ({ value: e.value, label: e.label, description: e.description }))}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <HoursMins label="Employee contracted hours per week" hrsName="contracted_week_hrs" minsName="contracted_week_mins" register={register} />
                    <HoursMins label="Average working day" hrsName="average_day_hrs" minsName="average_day_mins" register={register} />
                    <HoursMins
                      label="Full-time annual leave entitlement equivalent"
                      hrsName="annual_leave_equivalent_hrs"
                      minsName="annual_leave_equivalent_mins"
                      register={register}
                    />
                  </div>
                  <div className="grid max-w-md grid-cols-2 gap-3">
                    <Field label="Leave year start — day">
                      <Input type="number" min={1} max={31} {...register('leave_year_start_day', { valueAsNumber: true })} />
                    </Field>
                    <Field label="Month">
                      <Select
                        value={String(watch('leave_year_start_month') || 1)}
                        onValueChange={(v) => setValue('leave_year_start_month', Number(v))}
                      >
                        <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {LEAVE_MONTHS.map((m) => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <HoursMins label="Leave entitlement" hrsName="leave_entitlement_hrs" minsName="leave_entitlement_mins" register={register} />
                    <HoursMins label="Leave allowance" hrsName="leave_allowance_hrs" minsName="leave_allowance_mins" register={register} />
                  </div>
                </div>
              </Section>
            </div>
          )}

          {step === LAST_STEP && (
            <div className="min-w-0 space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <SummaryCard
                  title="Personal details"
                  onEdit={() => setStep(0)}
                  rows={[
                    ['Full name', [first, watch('middle_name'), last].filter(Boolean).join(' ') || 'Not entered'],
                    ['Job title', jobTitle],
                    ['Mobile', watch('phone')],
                    ['Email', watch('email')],
                  ]}
                />
                <SummaryCard
                  title="Address & bank"
                  onEdit={() => setStep(1)}
                  rows={[
                    ['Town / City', watch('town_city')],
                    ['Postcode', watch('postcode')],
                    ['Bank', watch('bank_name')],
                  ]}
                />
                <SummaryCard
                  title="Compliance"
                  onEdit={() => setStep(2)}
                  rows={[
                    ['SIA badge', watch('sia_number')],
                    ['RTW status', watch('rtw_status')],
                    ['DBS check', watch('dbs_status')],
                  ]}
                />
                <SummaryCard
                  title="Employment"
                  onEdit={() => setStep(EMPLOYMENT_STEP)}
                  rows={[
                    ['Start date', watch('employment_start_date')],
                    ['Hours pattern', EMPLOYEE_TYPES.find((e) => e.value === employeeType)?.label],
                    ['Employment type', payType === 'salaried' ? 'Salaried' : payType === 'non_salaried' ? 'Non-salaried' : ''],
                    ['Jurisdiction', HOLIDAY_JURISDICTIONS.find((j) => j.value === watch('holiday_jurisdiction'))?.label],
                    ['Entitlement', entitlementUnit],
                  ]}
                />
              </div>

              {allowLogin && (
                <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <label htmlFor="guard_create_login" className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      id="guard_create_login"
                      className="mt-0.5 size-4 accent-primary"
                      {...register('create_login')}
                    />
                    <span className="space-y-0.5">
                      <span className="block text-sm font-semibold">Create a portal login for this staff member</span>
                      <span className="block text-xs text-muted-foreground">
                        Gets the Staff role. Manage what that role can see in Settings → Roles &amp; Permissions.
                      </span>
                    </span>
                  </label>

                  {createLogin && (
                    <fieldset className="space-y-1.5">
                      <legend className="text-sm font-medium">Signs in with</legend>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            ['email', 'Email address', watch('email')],
                            ['phone', 'Mobile number', watch('phone')],
                          ] as const
                        ).map(([value, label, shown]) => (
                          <label
                            key={value}
                            className={cn(
                              'flex cursor-pointer items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm',
                              (watch('login_with') ?? 'email') === value && 'border-primary ring-1 ring-primary'
                            )}
                          >
                            <input type="radio" value={value} className="accent-primary" {...register('login_with')} />
                            <span>
                              {label}
                              {shown ? <span className="ml-1 text-muted-foreground">({shown})</span> : null}
                            </span>
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Staff enter this with your Company ID and the password below to sign in.
                      </p>
                    </fieldset>
                  )}

                  {createLogin && (
                    <Field
                      label="Login password"
                      required
                      error={err('login_password') ?? (watch('login_with') === 'phone' ? err('phone') : err('email'))}
                      hint={PASSWORD_REQUIREMENTS_MSG}
                      className="max-w-md"
                    >
                      <PasswordInput autoComplete="new-password" {...register('login_password')} />
                    </Field>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Footer stays in view while the dialog body scrolls */}
      <div className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-5 flex items-center justify-between gap-3 border-t bg-background/95 px-6 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
          <ChevronLeft className="size-4" />
          Back
        </Button>
        <div className="flex items-center gap-3">
          <span className="hidden text-xs text-muted-foreground sm:inline">
            Step {step + 1} of {STEPS.length}
          </span>
          {saveFromAnyStep && step < LAST_STEP ? (
            <Button type="button" variant="outline" disabled={isPending} onClick={() => void saveSummary()}>
              <Save className="size-4" />
              {isPending ? 'Saving…' : submitLabel}
            </Button>
          ) : null}
          {step < LAST_STEP ? (
            <Button type="button" onClick={() => void goToStep(step + 1)}>
              Continue
              <ChevronRight className="size-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={isPending}>
              <Check className="size-4" />
              {isPending ? 'Saving…' : submitLabel}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}
