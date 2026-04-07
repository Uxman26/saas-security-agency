export interface PlanSummary {
  tier: string;
  max_guards: number | null;
  max_sites: number | null;
  guards_used: number;
  sites_used: number;
  features: Record<string, boolean>;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role?: string;
  company_id?: number | null;
  is_active: boolean;
  created_at: string;
  permissions?: string[];
  plan?: PlanSummary | null;
}

export interface Company {
  id: number;
  name: string;
  admin_id: number;
  subscription_tier?: string;
  created_at: string;
}

export interface Guard {
  id: number;
  company_id: number;
  full_name: string;
  email?: string;
  phone?: string;
  badge_number?: string;
  license_number?: string;
  sia_number?: string;
  sia_expiry_date?: string;
  visa_status?: string;
  rtw_status?: string;
  employment_history?: string;
  address?: string;
  dbs_status?: string;
  main_contractor_id?: number | null;
  sub_contractor_id?: number | null;
  created_at: string;
}

export interface Site {
  id: number;
  company_id: number;
  client_id?: number;
  name: string;
  address?: string;
  contact_person?: string;
  contact_phone?: string;
  default_hourly_rate?: number;
  main_contractor_id?: number | null;
  sub_contractor_id?: number | null;
  created_at: string;
}

export interface Assignment {
  id: number;
  guard_id: number;
  site_id: number;
  date: string;
  shift_start?: string;
  shift_end?: string;
  break_minutes?: number;
  shift_type?: string;
  created_at: string;
}

export interface Rota {
  guard_id: number;
  guard_name: string;
  site_id: number;
  site_name: string;
  date: string;
  shift_start?: string;
  shift_end?: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
}

export interface Client {
  id: number;
  company_id: number;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contact_person?: string;
  created_at: string;
}

export interface MainContractor {
  id: number;
  company_id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  registration_number?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  status: string;
  created_at: string;
}

export interface SubContractor {
  id: number;
  company_id: number;
  main_contractor_id?: number | null;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  contact_person?: string;
  license_number?: string;
  registration_number?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  status: string;
  created_at: string;
}

export interface DashboardStats {
  active_guards: number;
  expiring_documents: number;
  revenue_total: number;
  late_count: number;
  upcoming_shifts: number;
  main_contractors_total: number;
  main_contractors_active: number;
  sub_contractors_total: number;
  sub_contractors_active: number;
}

export interface ComplianceAlert {
  guard_id: number;
  guard_name: string;
  document_type: string;
  expiry_date: string;
}

export interface Payroll {
  id: number;
  company_id: number;
  guard_id: number;
  period_start: string;
  period_end: string;
  total_hours: number;
  hourly_rate: number;
  bank_amount: number;
  cash_amount: number;
  allowance_total: number;
  payment_mode: string;
  created_at: string;
}

export interface Invoice {
  id: number;
  company_id: number;
  client_id: number;
  period_start: string;
  period_end: string;
  total: number;
  status: string;
  pdf_path?: string;
  created_at: string;
  lines?: InvoiceLine[];
}

export interface InvoiceLine {
  id: number;
  invoice_id: number;
  site_id: number;
  guard_id?: number;
  hours: number;
  rate: number;
  amount: number;
  allowance_amount: number;
  created_at: string;
}

export interface Allowance {
  id: number;
  company_id: number;
  name: string;
  allowance_type: string;
  amount: number;
  in_payroll: boolean;
  in_invoice: boolean;
  created_at: string;
}

export interface GuardDocument {
  id: number;
  guard_id: number;
  document_type: string;
  file_path?: string;
  expiry_date?: string;
  created_at: string;
}

export interface Attendance {
  id: number;
  assignment_id: number;
  guard_id: number;
  booked_at?: string;
  booked_off_at?: string;
  status?: string;
  created_at: string;
}

export interface Payment {
  id: number;
  company_id: number;
  invoice_id?: number;
  amount: number;
  method: string;
  paid_at: string;
  created_at: string;
}

export interface GuardRate {
  id: number;
  guard_id: number;
  hourly_rate: number;
  effective_from: string;
  created_at: string;
}

export interface SiteRate {
  id: number;
  site_id: number;
  shift_type: string;
  hourly_rate: number;
  created_at: string;
}
