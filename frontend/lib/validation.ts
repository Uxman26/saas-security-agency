import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

export const resetPasswordSchema = z
  .object({
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirm: z.string().min(6, 'Confirm your password'),
  })
  .refine((d) => d.password === d.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  });

export const companyUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  role_id: z.number().int().positive('Select a role'),
});

export const signupSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').regex(/[A-Z]/, 'Password must contain uppercase letter').regex(/[a-z]/, 'Password must contain lowercase letter').regex(/[0-9]/, 'Password must contain number'),
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  company_name: z.string().min(2, 'Company name must be at least 2 characters').max(100),
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
const optPhone = z
  .string()
  .regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Invalid phone number')
  .optional()
  .or(z.literal(''));
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
  first_name: z.string().min(1, 'First name is required').max(80),
  middle_name: optStr,
  last_name: z.string().min(1, 'Last name is required').max(80),
  gender: optStr,
  ethnicity: optStr,
  date_of_birth: optDate,
  email: optStr,
  phone: optPhone,
  work_phone: optStr,
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
  emergency_mobile: optStr,
  emergency_home_phone: optStr,
  emergency_work_phone: optStr,
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
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    client_id: z.number().int().optional().nullable(),
    address: z.string().max(200).optional().or(z.literal('')),
    postcode: z.string().max(20).optional().or(z.literal('')),
    contact_person: z.string().max(100).optional().or(z.literal('')),
    contact_email: z.string().email('Invalid email address').optional().or(z.literal('')),
    contact_phone: z.string().regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Invalid phone number').optional().or(z.literal('')),
    contract_start_date: z.string().optional().or(z.literal('')),
    contract_end_date: z.string().optional().or(z.literal('')),
    default_hourly_rate: z.number().min(0).optional().nullable(),
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
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
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
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  contact_person: z.string().max(100).optional().or(z.literal('')),
  phone: z.string().regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Invalid phone number').optional().or(z.literal('')),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
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
