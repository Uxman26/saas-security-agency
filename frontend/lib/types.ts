export interface PlanSummary {
  tier: string;
  max_guards: number | null;
  max_sites: number | null;
  max_users?: number | null;
  guards_used: number;
  sites_used: number;
  users_used?: number;
  features: Record<string, boolean>;
}

export interface PermissionMatrix {
  [module: string]: {
    view: boolean;
    create: boolean;
    edit: boolean;
    delete: boolean;
  };
}

export interface Role {
  id: number;
  company_id: number;
  name: string;
  slug: string;
  is_system: boolean;
  matrix: PermissionMatrix;
  uses_matrix: boolean;
}

export interface CompanyUser {
  id: number;
  email: string;
  full_name: string;
  role_id: number | null;
  role_slug: string | null;
  role_name: string | null;
}

export interface User {
  id: number;
  email: string;
  full_name: string;
  role?: string;
  role_id?: number | null;
  company_id?: number | null;
  is_active: boolean;
  created_at: string;
  permissions?: string[];
  plan?: PlanSummary | null;
  company_name?: string | null;
  logo_url?: string | null;
  subscription_status?: string | null;
  subscription_end?: string | null;
  sidebar_modules?: string[] | null;
  enabled_modules?: Record<string, boolean> | null;
  client_id?: number | null;
}

export interface StaffRequest {
  id: number;
  company_id: number;
  client_id: number;
  client_name: string;
  site_id: number;
  site_name: string;
  requested_by_user_id: number;
  requested_by_name: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  break_minutes: number;
  staff_count: number;
  client_notes?: string | null;
  status: 'pending' | 'approved' | 'rejected' | string;
  reviewer_user_id?: number | null;
  reviewer_name?: string | null;
  reviewer_comment?: string | null;
  reviewed_at?: string | null;
  rota_plan_id?: number | null;
  created_at: string;
}

export interface SubscriptionReceipt {
  id: number;
  ref_id: string;
  company_id: number;
  company_name?: string | null;
  user_email?: string | null;
  subscription_tier: string;
  amount: number;
  period_days: number;
  status: string;
  period_start?: string | null;
  period_end?: string | null;
  paid_at?: string | null;
  created_at: string;
}

export interface ReceiptPublic {
  ref_id: string;
  company_name: string;
  subscription_tier: string;
  amount: number;
  period_days: number;
  status: string;
  created_at: string;
}

export interface SignupResponse {
  user: User;
  receipt: SubscriptionReceipt;
}

export interface PaymentPendingDetail {
  code: string;
  subscription_status: string;
  receipt_ref?: string | null;
  amount: number;
  tier?: string;
  company_name?: string;
}

export interface AdminUserDetail {
  id: number;
  email: string;
  full_name: string;
  role?: string | null;
  is_active: boolean;
  created_at: string;
  company_id?: number | null;
  company_name?: string | null;
  subscription_tier?: string | null;
  subscription_status?: string | null;
  subscription_start?: string | null;
  subscription_end?: string | null;
  subscription_days_left?: number | null;
  billing_cycle?: string | null;
  max_users?: number | null;
  user_count?: number | null;
  enabled_modules?: Record<string, boolean>;
  usage?: TenantUsage;
  sidebar_modules: string[];
  receipts: SubscriptionReceipt[];
}

export interface TenantUsage {
  company_id: number;
  active_users: number;
  max_users?: number | null;
  user_slots_remaining?: number | null;
  guards_count: number;
  storage_bytes: number;
  storage_mb: number;
  database_records: number;
  api_requests: number;
  email_sent: number;
  whatsapp_sent: number;
  mobile_app_sessions: number;
  enabled_modules: Record<string, boolean>;
  billing_cycle: string;
}

export interface SubscriptionInvoice {
  id: number;
  invoice_number: string;
  company_id: number;
  company_name?: string | null;
  tenant_email?: string | null;
  subscription_tier: string;
  billing_cycle: string;
  period_start?: string | null;
  period_end?: string | null;
  due_date: string;
  amount_ex_vat: number;
  vat_amount: number;
  total_amount: number;
  amount_paid: number;
  status: string;
  email_sent: boolean;
  sent_at?: string | null;
  paid_at?: string | null;
  created_at: string;
}

export interface LoginLog {
  id: number;
  user_id?: number | null;
  email?: string | null;
  full_name?: string | null;
  company_id?: number | null;
  login_at: string;
  ip_address?: string | null;
  user_agent?: string | null;
  status: string;
}

export interface AdminDashboard {
  total_companies: number;
  active_subscriptions: number;
  total_invoices: number;
  paid_invoices: number;
  unpaid_invoices: number;
  overdue_invoices: number;
  partial_invoices: number;
  outstanding_balance: number;
  total_collected: number;
  platform_usage: {
    total_companies: number;
    total_active_users: number;
    storage_mb: number;
    api_requests: number;
    email_sent: number;
    whatsapp_sent: number;
    mobile_app_sessions: number;
  };
}

export interface AdminUserListItem {
  id: number;
  email: string;
  full_name: string;
  role?: string | null;
  is_active: boolean;
  created_at: string;
  company_id?: number | null;
  company_name?: string | null;
  subscription_tier?: string | null;
  subscription_status?: string | null;
}

export interface PlanTier {
  tier: string;
  price_gbp: number;
  max_guards?: number | null;
  max_sites?: number | null;
  max_users?: number | null;
  features: Record<string, boolean>;
}

export interface AdminPayment extends Payment {
  company_name?: string | null;
  invoice_total?: number | null;
}

export interface CompanyProfile {
  id: number;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  postcode?: string | null;
  registration_number?: string | null;
  vat_number?: string | null;
  logo_url?: string | null;
  account_name?: string | null;
  bank_name?: string | null;
  sort_code?: string | null;
  account_number?: string | null;
  iban?: string | null;
  swift_code?: string | null;
}

export interface Company {
  id: number;
  name: string;
  admin_id: number;
  subscription_tier?: string;
  subscription_status?: string;
  subscription_start?: string;
  subscription_end?: string;
  billing_cycle?: string;
  max_users?: number | null;
  user_count?: number;
  enabled_modules?: Record<string, boolean>;
  usage?: TenantUsage;
  created_at: string;
}

export interface Guard {
  id: number;
  company_id: number;
  full_name: string;
  title?: string;
  first_name?: string;
  middle_name?: string;
  last_name?: string;
  gender?: string;
  ethnicity?: string;
  date_of_birth?: string;
  email?: string;
  phone?: string;
  work_phone?: string;
  job_title?: string;
  employment_start_date?: string;
  probation_end_date?: string;
  address_line_1?: string;
  address_line_2?: string;
  address_line_3?: string;
  town_city?: string;
  county?: string;
  postcode?: string;
  address?: string;
  emergency_first_name?: string;
  emergency_last_name?: string;
  emergency_mobile?: string;
  emergency_home_phone?: string;
  emergency_work_phone?: string;
  emergency_relationship?: string;
  emergency_address_line_1?: string;
  emergency_address_line_2?: string;
  emergency_address_line_3?: string;
  emergency_town_city?: string;
  emergency_county?: string;
  emergency_postcode?: string;
  bank_account_name?: string;
  bank_name?: string;
  bank_branch?: string;
  bank_account_number?: string;
  bank_sort_code?: string;
  tax_code?: string;
  ni_number?: string;
  passport_number?: string;
  passport_country?: string;
  passport_expiry_date?: string;
  license_number?: string;
  driving_licence_country?: string;
  driving_licence_class?: string;
  driving_licence_expiry_date?: string;
  holiday_jurisdiction?: string;
  employee_type?: string;
  working_time_pattern?: string;
  company_full_time_week_hrs?: number;
  company_full_time_week_mins?: number;
  entitlement_unit?: string;
  contracted_week_hrs?: number;
  contracted_week_mins?: number;
  average_day_hrs?: number;
  average_day_mins?: number;
  annual_leave_equivalent_hrs?: number;
  annual_leave_equivalent_mins?: number;
  leave_year_start_day?: number;
  leave_year_start_month?: number;
  leave_entitlement_hrs?: number;
  leave_entitlement_mins?: number;
  leave_allowance_hrs?: number;
  leave_allowance_mins?: number;
  badge_number?: string;
  sia_number?: string;
  sia_expiry_date?: string;
  visa_status?: string;
  visa_expiry_date?: string;
  share_code?: string;
  share_code_expiry_date?: string;
  rtw_status?: string;
  employment_history?: string;
  dbs_status?: string;
  main_contractor_id?: number | null;
  sub_contractor_id?: number | null;
  contractor_id?: string | null;
  weekly_contracted_hours?: number | null;
  service_area?: string;
  nearby_areas?: string;
  has_car?: boolean;
  available_days?: string;
  availability_timing?: string;
  pay_frequency?: string;
  created_at: string;
}

export interface Site {
  id: number;
  company_id: number;
  client_id?: number | null;
  name: string;
  color?: string;
  address?: string;
  postcode?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  contract_start_date?: string;
  contract_end_date?: string;
  default_hourly_rate?: number;
  main_contractor_id?: number | null;
  sub_contractor_id?: number | null;
  contractor_id?: string | null;
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
  shift_rate?: number | null;
  created_at: string;
}

export interface RotaPlanListItem {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  day_count: number;
  view_mode: string;
  budget: number;
  status: string;
  shift_count: number;
  staff_count: number;
  created_at: string;
  published_at?: string | null;
}

export interface RotaPlanDetail extends RotaPlanListItem {
  planner_data?: string | null;
}

export interface RotaPlanPublishResult {
  created: number;
  skipped: number;
  errors: string[];
}

export interface Rota {
  guard_id: number;
  guard_name: string;
  site_id: number;
  site_name: string;
  date: string;
  shift_start?: string;
  shift_end?: string;
  break_minutes?: number;
  shift_type?: string;
}

export interface RotaDetail {
  id: number;
  guard_id: number;
  guard_name: string;
  site_id: number;
  site_name: string;
  client_id?: number | null;
  client_name?: string | null;
  date: string;
  shift_start?: string;
  shift_end?: string;
  break_minutes: number;
  shift_type: string;
  hours: number;
  attendance_status: string;
  late_minutes?: number | null;
}

export interface RotaSummary {
  guard_id: number;
  guard_name: string;
  total_hours: number;
  late_arrivals: number;
  overtime_hours: number;
  committed_hours: number;
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
  postcode?: string;
  contact_person?: string;
  double_rate_special_days?: boolean;
  contract_start_date?: string;
  contract_end_date?: string;
  created_at: string;
}

export interface ClientContractRenewal {
  id: number;
  client_id: number;
  previous_end_date?: string;
  new_end_date: string;
  note?: string;
  user_id?: number;
  created_at: string;
}

export interface SpecialDay {
  id: number;
  company_id: number;
  date: string;
  label: string;
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

export interface ChartPoint {
  label: string;
  value: number;
}

export interface DashboardStats {
  active_guards: number;
  sites_count: number;
  clients_count: number;
  expiring_documents: number;
  sia_expiring_30d: number;
  revenue_total: number;
  payroll_mtd: number;
  invoice_total: number;
  invoice_outstanding: number;
  late_count: number;
  present_count: number;
  absent_count: number;
  upcoming_shifts: number;
  shifts_today: number;
  main_contractors_total: number;
  main_contractors_active: number;
  sub_contractors_total: number;
  sub_contractors_active: number;
  contracts_expiring_soon: number;
  rotas_total: number;
  rotas_active: number;
}

export interface DashboardOverview {
  stats: DashboardStats;
  shifts_by_day: ChartPoint[];
  attendance_by_status: ChartPoint[];
  payroll_by_month: ChartPoint[];
  operations_compare: ChartPoint[];
}

export interface ContractExpiryAlert {
  client_id: number;
  client_name: string;
  contract_end_date: string;
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
  due_date?: string | null;
  notes?: string | null;
  tax_rate: number;
  subtotal: number;
  tax_amount: number;
  pdf_path?: string;
  created_at: string;
  updated_at?: string;
  client_name?: string | null;
  company_name?: string | null;
  company_email?: string | null;
  company_phone?: string | null;
  company_address?: string | null;
  company_registration_number?: string | null;
  company_vat_number?: string | null;
  company_logo_url?: string | null;
  account_name?: string | null;
  bank_name?: string | null;
  sort_code?: string | null;
  account_number?: string | null;
  iban?: string | null;
  swift_code?: string | null;
  client_email?: string | null;
  client_phone?: string | null;
  client_address?: string | null;
  client_contact_person?: string | null;
  lines?: InvoiceLine[];
  amount_paid?: number;
  balance_due?: number;
  payments?: Payment[];
}

export interface ReportsHub {
  period_start: string;
  period_end: string;
  total_revenue: number;
  outstanding_invoices: number;
  total_expenses: number;
  expense_vat: number;
  invoice_vat: number;
  net_vat: number;
  active_users: number;
  staff_hours: number;
  sms_usage: number;
  email_usage: number;
  monthly_trends: { label: string; revenue: number; expenses: number; staff_hours: number }[];
  subscription_trend: { label: string; amount: number; invoices: number }[];
}

export interface StaffMonthlyReport {
  period_start: string;
  period_end: string;
  group_by: string;
  by_employee: Record<string, unknown>[];
  grouped_summary: Record<string, unknown>[];
  workforce_total_hours: number;
  total_employees: number;
}

export interface SubscriptionReportSummary {
  subscription_tier?: string | null;
  subscription_status?: string | null;
  billing_cycle: string;
  subscription_end?: string | null;
  days_until_expiry?: number | null;
  is_active: boolean;
  is_expiring: boolean;
  invoice_count: number;
  total_billed: number;
  total_paid: number;
  outstanding: number;
}

export interface UsageSummary {
  period_start: string;
  period_end: string;
  sms_sent: number;
  emails_sent: number;
  successful_logins: number;
  api_requests: number;
  active_users: number;
  storage_mb: number;
}

export interface StaffIndividualReport {
  guard_id: number;
  guard_name: string;
  period_start: string;
  period_end: string;
  total_shifts: number;
  scheduled_shifts: number;
  completed_shifts: number;
  total_hours: number;
  overtime_hours: number;
  attendance_summary: Record<string, number>;
  shifts: Record<string, unknown>[];
}

export interface SmsConfig {
  account_sid_set: boolean;
  auth_token_set: boolean;
  phone_number?: string | null;
  templates: Record<string, string>;
  enabled: boolean;
}

export interface SmsLog {
  id: number;
  company_id: number;
  recipient: string;
  body: string;
  template_key?: string | null;
  status: string;
  error_message?: string | null;
  twilio_sid?: string | null;
  sent_at: string;
}

export interface EmailConfig {
  smtp_configured: boolean;
  mail_from?: string | null;
  mail_from_name?: string | null;
  templates: Record<string, string>;
  enabled: boolean;
}

export interface EmailLog {
  id: number;
  recipient: string;
  subject?: string | null;
  template_key?: string | null;
  status: string;
  sent_at: string;
}

export interface SmtpConfig {
  mail_server: string;
  mail_port: number;
  mail_from: string;
  mail_from_name: string;
  username_set: boolean;
  password_set: boolean;
  configured: boolean;
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
  site_name?: string | null;
  guard_name?: string | null;
}

export interface InvoiceAuditEntry {
  id: number;
  created_at: string;
  user_id?: number | null;
  user_name?: string | null;
  action: string;
  meta?: Record<string, unknown> | null;
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

export interface DirectoryContractorList {
  id: string;
  name: string;
  type: 'main' | 'sub';
  is_active: boolean;
  contact_email?: string | null;
}

export interface DirectoryContractor {
  id: string;
  company_id: number;
  name: string;
  type: 'main' | 'sub';
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
  postcode?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface DirectoryContractorAssignment {
  id: string;
  company_id: number;
  main_contractor_id: string;
  sub_contractor_id: string;
  site_id?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  notes?: string | null;
  created_at: string;
  main_contractor: DirectoryContractorList;
  sub_contractor: DirectoryContractorList;
}

export interface Expense {
  id: number;
  company_id: number;
  expense_date: string;
  category: string;
  vendor_name?: string | null;
  reference_number?: string | null;
  description?: string | null;
  amount_ex_vat: number;
  vat_amount: number;
  total_amount: number;
  vat_exempt?: boolean;
  payment_method?: string | null;
  payment_status: string;
  has_document: boolean;
  created_at: string;
  updated_at?: string | null;
}

export interface ExpenseMeta {
  categories: string[];
  payment_methods: string[];
  payment_statuses: string[];
  vat_rate: number;
  max_document_bytes: number;
}

export interface ExpenseBreakdownItem {
  key: string;
  count: number;
  total_ex_vat: number;
  total_vat: number;
  total_inc_vat: number;
}

export interface ExpenseReport {
  period_start: string;
  period_end: string;
  group_by: string;
  totals: { total_ex_vat: number; total_vat: number; total_inc_vat: number };
  breakdown: ExpenseBreakdownItem[];
}

export interface VatReport {
  period_start: string;
  period_end: string;
  expense_vat_total: number;
  invoice_vat_total: number;
  net_vat_summary: number;
  total_vat_report: {
    collected_on_invoices: number;
    paid_on_expenses: number;
    net_payable_or_refundable: number;
  };
  expense_totals: { total_ex_vat: number; total_vat: number; total_inc_vat: number };
}

export interface ExpenseDashboard {
  period_start: string;
  period_end: string;
  total_expenses_ex_vat: number;
  total_expense_vat: number;
  total_invoice_vat: number;
  net_vat_payable: number;
  total_expenses_inc_vat: number;
  category_summary: { category: string; total_inc_vat: number; vat_amount: number; count: number }[];
  recent_expenses: Expense[];
  quarterly_vat: {
    quarter: string;
    start_date: string;
    end_date: string;
    expense_vat: number;
    invoice_vat: number;
    net_vat: number;
  }[];
}
