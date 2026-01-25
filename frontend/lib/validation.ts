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

export const guardSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  phone: z.string().regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Invalid phone number').optional().or(z.literal('')),
  badge_number: z.string().max(50).optional().or(z.literal('')),
  license_number: z.string().max(50).optional().or(z.literal('')),
  address: z.string().max(200).optional().or(z.literal('')),
});

export const siteSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  address: z.string().max(200).optional().or(z.literal('')),
  contact_person: z.string().max(100).optional().or(z.literal('')),
  contact_phone: z.string().regex(/^[+]?[(]?[0-9]{1,4}[)]?[-\s.]?[(]?[0-9]{1,4}[)]?[-\s.]?[0-9]{1,9}$/, 'Invalid phone number').optional().or(z.literal('')),
});

export const assignmentSchema = z.object({
  guard_id: z.number().int().positive('Guard is required'),
  site_id: z.number().int().positive('Site is required'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format'),
  shift_start: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format').optional().or(z.literal('')),
  shift_end: z.string().regex(/^([0-1][0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format').optional().or(z.literal('')),
});
