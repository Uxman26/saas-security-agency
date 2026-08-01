import { z } from 'zod';
import { TEXT_LIMITS, tooLongMessage } from '@/lib/text-limits';

export const PASSWORD_REQUIREMENTS_MSG =
  'Password must be at least 9 characters and include uppercase, lowercase, number, and special character';

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{9,}$/;

export const passwordFieldSchema = z
  .string()
  .min(9, PASSWORD_REQUIREMENTS_MSG)
  .max(TEXT_LIMITS.text, tooLongMessage('Password', TEXT_LIMITS.text))
  .regex(passwordPattern, PASSWORD_REQUIREMENTS_MSG);

/**
 * A text field the user must actually fill in.
 *
 * `.trim()` runs before the length checks, so a value of spaces fails `min` instead of
 * satisfying it — `z.string().min(2)` alone accepts "  " and stores a blank record.
 * Trimming also means the value sent matches what the server stores, since the
 * matching Pydantic types strip too.
 *
 * Deliberately no character allow-list: names legitimately contain apostrophes and
 * ampersands, and output is escaped where it is rendered rather than filtered here.
 */
export function requiredText(
  label: string,
  { min = 1, max = TEXT_LIMITS.text }: { min?: number; max?: number } = {}
) {
  return z
    .string()
    .trim()
    .min(min, min > 1 ? `${label} must be at least ${min} characters` : `${label} is required`)
    .max(max, tooLongMessage(label, max));
}

/** Every email field shares the RFC ceiling so none of them is unbounded. */
const emailFieldSchema = z
  .string()
  .email('Invalid email address')
  .max(TEXT_LIMITS.email, tooLongMessage('Email', TEXT_LIMITS.email));

export const loginSchema = z.object({
  email: emailFieldSchema,
  password: z
    .string()
    .min(6, 'Password must be at least 6 characters')
    .max(TEXT_LIMITS.text, tooLongMessage('Password', TEXT_LIMITS.text)),
  remember_me: z.boolean().optional().default(true),
});

export const forgotPasswordSchema = z.object({
  email: emailFieldSchema,
});

export const resetPasswordSchema = z
  .object({
    password: passwordFieldSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

export const companyUserSchema = z.object({
  email: emailFieldSchema,
  password: passwordFieldSchema,
  full_name: requiredText('Name', { min: 2, max: TEXT_LIMITS.companyName }),
  role_id: z.number().int().positive('Select a role'),
});

export const companyUserUpdateSchema = z.object({
  email: emailFieldSchema,
  full_name: requiredText('Name', { min: 2, max: TEXT_LIMITS.companyName }),
  password: z.union([z.literal(''), passwordFieldSchema]).optional(),
  role_id: z.number().int().positive('Select a role'),
});

export const signupSchema = z.object({
  email: emailFieldSchema,
  password: passwordFieldSchema,
  full_name: requiredText('Name', { min: 2, max: TEXT_LIMITS.companyName }),
  company_name: requiredText('Company name', { min: 2, max: TEXT_LIMITS.companyName }),
  industry: z.string().min(1, 'Select an industry'),
  workforce_size: z.string().min(1, 'Select workforce size'),
  verification_code: z.string().max(50).optional().or(z.literal('')),
});

const optPosInt = z.preprocess(
  (v) => (v === '' || v === null || v === undefined || Number(v) === 0 ? undefined : Number(v)),
  z.number().int().positive().optional()
);

const optUuid = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.string().uuid().optional()
);

const optStr = z.string().max(200).optional().or(z.literal(''));

/** Optional international phone stored as +{dial}{nationalDigits}. */
export const optPhone = z.string().superRefine((val, ctx) => {
  if (!val) return;
  if (!val.startsWith('+')) {
    ctx.addIssue({ code: 'custom', message: 'Select a country code and enter a valid number' });
    return;
  }
  const digits = val.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) {
    ctx.addIssue({
      code: 'custom',
      message: 'Enter a valid phone number for the selected country',
    });
  }
});

const optDate = z.string().optional().or(z.literal(''));
const toOptInt = (v: unknown) => {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(999, Math.trunc(n)));
};
const optInt = z.preprocess(toOptInt, z.number().int().min(0).max(999));
const toOptDay = (v: unknown) => {
  if (v === '' || v === null || v === undefined) return 1;
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(31, Math.trunc(n)));
};
const toOptMonth = (v: unknown) => {
  if (v === '' || v === null || v === undefined) return 1;
  const n = Number(v);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(12, Math.trunc(n)));
};

export const guardSchema = z.object({
  title: optStr,
  first_name: requiredText('First name', { max: TEXT_LIMITS.name }),
  middle_name: optStr,
  last_name: requiredText('Last name', { max: TEXT_LIMITS.name }),
  gender: optStr,
  ethnicity: optStr,
  date_of_birth: optDate,
  email: optStr,
  phone: optPhone,
  work_phone: optPhone,
  job_title: optStr,
  employment_start_date: optDate,
  probation_end_date: optDate,
  address_line_1: optStr,
  address_line_2: optStr,
  address_line_3: optStr,
  town_city: optStr,
  county: optStr,
  postcode: optStr,
  address: optStr,
  service_area: optStr,
  nearby_areas: optStr,
  has_car: z.coerce.boolean().optional().default(false),
  available_days: optStr,
  availability_timing: optStr,
  pay_frequency: z.preprocess(
    (v) => (v === 'monthly' ? 'monthly' : 'weekly'),
    z.enum(['weekly', 'monthly'])
  ),
  emergency_first_name: optStr,
  emergency_last_name: optStr,
  emergency_mobile: optPhone,
  emergency_home_phone: optPhone,
  emergency_work_phone: optPhone,
  emergency_relationship: optStr,
  emergency_address_line_1: optStr,
  emergency_address_line_2: optStr,
  emergency_address_line_3: optStr,
  emergency_town_city: optStr,
  emergency_county: optStr,
  emergency_postcode: optStr,
  bank_account_name: z.string().max(60).optional().or(z.literal('')),
  bank_name: z.string().max(60).optional().or(z.literal('')),
  bank_branch: optStr,
  bank_account_number: optStr,
  bank_sort_code: optStr,
  tax_code: optStr,
  ni_number: optStr,
  passport_number: optStr,
  passport_country: optStr,
  passport_expiry_date: optDate,
  license_number: optStr,
  driving_licence_country: optStr,
  driving_licence_class: optStr,
  driving_licence_expiry_date: optDate,
  holiday_jurisdiction: optStr,
  employee_type: optStr,
  working_time_pattern: optStr,
  company_full_time_week_hrs: optInt,
  company_full_time_week_mins: optInt,
  entitlement_unit: optStr,
  contracted_week_hrs: optInt,
  contracted_week_mins: optInt,
  average_day_hrs: optInt,
  average_day_mins: optInt,
  annual_leave_equivalent_hrs: optInt,
  annual_leave_equivalent_mins: optInt,
  leave_year_start_day: z.preprocess(toOptDay, z.number().int().min(1).max(31)),
  leave_year_start_month: z.preprocess(toOptMonth, z.number().int().min(1).max(12)),
  leave_entitlement_hrs: optInt,
  leave_entitlement_mins: optInt,
  leave_allowance_hrs: optInt,
  leave_allowance_mins: optInt,
  badge_number: z.string().max(50).optional().or(z.literal('')),
  sia_number: z.string().max(50).optional().or(z.literal('')),
  sia_expiry_date: optDate,
  visa_status: z.string().max(100).optional().or(z.literal('')),
  visa_expiry_date: optDate,
  share_code: z.string().max(50).optional().or(z.literal('')),
  share_code_expiry_date: optDate,
  rtw_status: z.string().max(100).optional().or(z.literal('')),
  employment_history: z.string().max(2000).optional().or(z.literal('')),
  dbs_status: z.string().max(100).optional().or(z.literal('')),
  weekly_contracted_hours: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
    z.number().min(0).max(168).optional()
  ),
  contractor_id: optUuid,
  main_contractor_id: optPosInt,
  sub_contractor_id: optPosInt,
});

export const guardSubmitSchema = guardSchema.partial().required({
  first_name: true,
  last_name: true,
});

export type GuardFormData = z.infer<typeof guardSchema>;

export const siteSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(TEXT_LIMITS.siteName, tooLongMessage('Site name', TEXT_LIMITS.siteName)),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    client_id: z.number().int().optional().nullable(),
    address: z.string().max(200).optional().or(z.literal('')),
    postcode: z.string().max(20).optional().or(z.literal('')),
    contact_person: z.string().max(100).optional().or(z.literal('')),
    contact_email: emailFieldSchema.optional().or(z.literal('')),
    contact_phone: z.string().regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Invalid phone number').optional().or(z.literal('')),
    contract_start_date: z.string().optional().or(z.literal('')),
    contract_end_date: z.string().optional().or(z.literal('')),
    site_type: z.union([z.literal(1), z.literal(2)], {
      error: 'Select Regular or Ad-hoc',
    }),
    reference: z.string().max(200).optional().or(z.literal('')),
    default_hourly_rate: z.number().min(0).optional().nullable(),
    staff_hourly_rate: z.number().min(0).optional().nullable(),
    contractor_id: optUuid,
    main_contractor_id: optPosInt,
    sub_contractor_id: optPosInt,
  })
  .refine(
    (d) => {
      const hasDir = Boolean(d.contractor_id);
      const hasLegacy = Boolean(d.main_contractor_id) !== Boolean(d.sub_contractor_id);
      return (hasDir && !d.main_contractor_id && !d.sub_contractor_id) || (!hasDir && hasLegacy);
    },
    {
      message: 'Select a main contractor or a sub contractor (exactly one).',
      path: ['main_contractor_id'],
    }
  )
  .refine(
    (d) => {
      const staff = d.staff_hourly_rate;
      const site = d.default_hourly_rate;
      if (staff == null || site == null || Number.isNaN(staff) || Number.isNaN(site)) return true;
      return staff <= site;
    },
    {
      message: 'Staff rate cannot be greater than site rate',
      path: ['staff_hourly_rate'],
    }
  );
export type SiteFormData = z.infer<typeof siteSchema>;

export const assignmentSchema = z.object({
  guard_id: z.number().int().positive('Staff member is required'),
  site_id: z.number().int().positive('Site is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  shift_start: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format').optional().or(z.literal('')),
  shift_end: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format').optional().or(z.literal('')),
  break_minutes: z.number().int().min(0).optional(),
  shift_type: z.enum(['day', 'night', 'weekend']).optional(),
});
export type AssignmentFormData = z.infer<typeof assignmentSchema>;

export const clientSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(TEXT_LIMITS.companyName),
  email: emailFieldSchema.optional().or(z.literal('')),
  phone: z.string().regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Invalid phone number').optional().or(z.literal('')),
  address: z.string().max(200).optional().or(z.literal('')),
  postcode: z.string().max(20).optional().or(z.literal('')),
  contact_person: z.string().max(100).optional().or(z.literal('')),
  double_rate_special_days: z.boolean().default(false),
  contract_start_date: z.string().optional().or(z.literal('')),
  contract_end_date: z.string().optional().or(z.literal('')),
});

export const clientRenewSchema = z.object({
  new_end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'),
  note: z.string().max(2000).optional().or(z.literal('')),
});

export const mainContractorSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(TEXT_LIMITS.companyName),
  contact_person: z.string().max(TEXT_LIMITS.companyName).optional().or(z.literal('')),
  phone: z.string().regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Invalid phone number').optional().or(z.literal('')),
  email: emailFieldSchema.optional().or(z.literal('')),
  address: z.string().max(200).optional().or(z.literal('')),
  postcode: z.string().max(20).optional().or(z.literal('')),
  registration_number: z.string().max(80).optional().or(z.literal('')),
  contract_start_date: z.string().optional().or(z.literal('')),
  contract_end_date: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']),
});

export const subContractorSchema = mainContractorSchema.extend({
  main_contractor_id: z.number().int().positive('Select a main contractor'),
});
