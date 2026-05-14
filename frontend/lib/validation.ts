import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
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

export const guardSchema = z
  .object({
    full_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    email: z.string().email('Invalid email address').optional().or(z.literal('')),
    phone: z.string().regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Invalid phone number').optional().or(z.literal('')),
    badge_number: z.string().max(50).optional().or(z.literal('')),
    license_number: z.string().max(50).optional().or(z.literal('')),
    sia_number: z.string().max(50).optional().or(z.literal('')),
    sia_expiry_date: z.string().optional().or(z.literal('')),
    visa_status: z.string().max(100).optional().or(z.literal('')),
    rtw_status: z.string().max(100).optional().or(z.literal('')),
    employment_history: z.string().max(2000).optional().or(z.literal('')),
    address: z.string().max(200).optional().or(z.literal('')),
    dbs_status: z.string().max(100).optional().or(z.literal('')),
    weekly_contracted_hours: z.preprocess(
      (v) => (v === '' || v === null || v === undefined ? undefined : Number(v)),
      z.number().min(0).max(168).optional()
    ),
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
export type GuardFormData = z.infer<typeof guardSchema>;

export const siteSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters').max(100),
    client_id: z.number().int().optional().nullable(),
    address: z.string().max(200).optional().or(z.literal('')),
    contact_person: z.string().max(100).optional().or(z.literal('')),
    contact_phone: z.string().regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Invalid phone number').optional().or(z.literal('')),
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
  guard_id: z.number().int().positive('Guard is required'),
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
  registration_number: z.string().max(80).optional().or(z.literal('')),
  contract_start_date: z.string().optional().or(z.literal('')),
  contract_end_date: z.string().optional().or(z.literal('')),
  status: z.enum(['active', 'inactive']),
});

export const subContractorSchema = mainContractorSchema.extend({
  main_contractor_id: z.number().int().positive('Select a main contractor'),
});
