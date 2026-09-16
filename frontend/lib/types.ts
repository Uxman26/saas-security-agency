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

/** Module key -> action key -> granted. Action keys come from the module's
 *  `actions` catalogue, not a fixed CRUD set. */
export interface PermissionMatrix {
  [module: string]: Record<string, boolean>;
}

export interface AppModuleActionDef {
  key: string;
  label: string;
  parent: string | null;
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
  client_id?: number | null;
  guard_id?: number | null;
  /** Sites this login is restricted to. Empty means unpinned: a Client-role user then
   * sees every site of its client. */
  site_ids?: number[];
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
  theme_preference?: 'light' | 'dark' | 'system' | null;
  client_id?: number | null;
  guard_id?: number | null;
  module_access?: ModuleAccess[];
}

export interface ModuleAccess {
  key: string;
  name: string;
  icon: string;
  sidebar_path: string;
  sidebar_order: number;
  section_key: string;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  /** Every granular action on this module and whether the user holds it. */
  actions?: Record<string, boolean>;
}

export interface AppModule {
  id: number;
  key: string;
  name: string;
  icon: string;
  sidebar_path: string;
  sidebar_order: number;
  section_key: string;
  is_active: boolean;
  actions?: AppModuleActionDef[];
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
  billing_cycle?: string;
  status: string;
  created_at: string;
}

export interface SignupResponse {
  user: User;
  receipt: SubscriptionReceipt;
  email_verification_required?: boolean;
}

export interface PaymentPendingDetail {
  code: string;
  subscription_status: string;
  receipt_ref?: string | null;
  amount: number;
  tier?: string;
  company_name?: string;
}

export interface SubscriptionRequiredDetail {
  code: string;
  message?: string;
  subscription_status?: string;
  receipt_ref?: string | null;
  amount?: number;
  tier?: string;
  company_name?: string;
  trial_ends_on?: string | null;
  days_remaining?: number | null;
  label?: string;
}

export interface TrialExtension {
  id: number;
  previous_ends_at: string;
  new_ends_at: string;
  extension_days: number;
  reason: string;
  extended_by_user_id?: number | null;
  extended_by_email?: string | null;
  extended_by_name?: string | null;
  created_at: string;
}

export interface TrialPeriod {
  id: number;
  company_id: number;
  company_name?: string | null;
  user_id?: number | null;
  plan_tier?: string | null;
  status: string;
  source?: string | null;
  duration_days: number;
  started_at: string;
  original_ends_at: string;
  ends_at: string;
  days_remaining?: number | null;
  granted_by_user_id?: number | null;
  converted_at?: string | null;
  expired_at?: string | null;
  stripe_subscription_id?: string | null;
  notes?: string | null;
  created_at: string;
  extensions?: TrialExtension[];
}

export interface TrialStatus {
  subscription_status?: string | null;
  label?: string;
  trial_active: boolean;
  trial_expired: boolean;
  trial_starts_on?: string | null;
  trial_ends_on?: string | null;
  original_ends_on?: string | null;
  days_remaining?: number | null;
  plan_tier?: string | null;
  billing_cycle?: string | null;
  trial_id?: number | null;
  duration_days?: number | null;
  can_use_paid_features: boolean;
  can_create_records?: boolean;
  can_edit_existing?: boolean;
  subscription_required: boolean;
  restriction?: string | null;
}

export interface TrialConfig {
  default_days: number;
  allowed_days: number[];
  allow_repeat: boolean;
  require_card: boolean;
  reminder_days: number[];
  eligible_tiers: string[];
  enabled: boolean;
}

export interface CompanyTrialsResponse {
  company_id: number;
  eligible_for_new_trial: boolean;
  eligibility_reason: string;
  current: TrialStatus;
  history: TrialPeriod[];
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

export interface BillingReceipt {
  id: number;
  receipt_number: string;
  amount: number;
  amount_refunded?: number;
  currency: string;
  plan_name?: string;
  billing_cycle?: string;
  payment_method_last4?: string;
  invoice_url?: string;
  status?: string;
  next_renewal_date?: string;
  paid_at?: string;
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

/** One super-admin action, from the platform audit trail. */
export interface PlatformAuditLog {
  id: number;
  actor_user_id?: number | null;
  actor_email?: string | null;
  action: string;
  target_type: string;
  target_id?: number | null;
  target_label?: string | null;
  company_id?: number | null;
  company_name?: string | null;
  /** JSON strings; parsed lazily for the detail view. */
  before_json?: string | null;
  after_json?: string | null;
  note?: string | null;
  ip_address?: string | null;
  user_agent?: string | null;
  created_at: string;
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
  inactive_tenants?: number;
  new_tenants_7d?: number;
  active_users?: number;
  locked_accounts?: number;
  trial_subscriptions?: number;
  expiring_subscriptions?: number;
  open_tickets?: number;
  sla_breaches?: number;
  critical_errors?: number;
  failed_jobs?: number;
}

export interface AdminUserListItem {
  id: number;
  email: string;
  full_name: string;
  role?: string | null;
  is_active: boolean;
  email_verified?: boolean;
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
  trial_days?: number;
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
  website?: string | null;
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
  account_status?: string;
  locked_at?: string | null;
  locked_reason?: string | null;
  email?: string | null;
  phone?: string | null;
  created_at: string;
  trial?: TrialStatus;
}

export interface SupportTicketMessage {
  id: number;
  author_user_id?: number | null;
  author_name?: string | null;
  author_email?: string | null;
  body: string;
  is_internal: boolean;
  created_at: string;
}

export interface SupportTicket {
  id: number;
  ticket_number: string;
  company_id?: number | null;
  company_name?: string | null;
  created_by_user_id?: number | null;
  assigned_to_user_id?: number | null;
  assigned_to_name?: string | null;
  subject: string;
  category?: string;
  priority?: string;
  status?: string;
  sla_due_at?: string | null;
  sla_breached?: boolean;
  escalated_at?: string | null;
  resolved_at?: string | null;
  closed_at?: string | null;
  created_at: string;
  updated_at?: string;
  message_count?: number;
  messages?: SupportTicketMessage[];
  attachments?: { id: number; file_name: string; content_type?: string; size_bytes?: number; created_at?: string }[];
}

export interface ErrorLogItem {
  id: number;
  company_id?: number | null;
  source?: string | null;
  module?: string | null;
  severity?: string;
  status?: string;
  error_code?: string | null;
  message?: string;
  stack_trace?: string | null;
  path?: string | null;
  method?: string | null;
  occurrence_count?: number;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
  resolved_at?: string | null;
}

export interface AdminSession {
  id: number;
  user_id: number;
  email?: string | null;
  full_name?: string | null;
  company_id?: number | null;
  ip_address?: string | null;
  user_agent?: string | null;
  last_seen_at?: string | null;
  expires_at?: string | null;
  is_impersonation?: boolean;
  impersonator_user_id?: number | null;
}

export interface FeatureFlag {
  id?: number;
  key: string;
  name?: string | null;
  description?: string | null;
  enabled: boolean;
}

export interface BackgroundJobItem {
  id: number;
  job_name?: string;
  queue?: string | null;
  status?: string;
  company_id?: number | null;
  attempts?: number;
  error_message?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
  created_at?: string;
}

export interface GlobalSearchResult {
  tenants: { id: number; name: string; status?: string | null }[];
  users: { id: number; email: string; full_name?: string | null; company_id?: number | null; role?: string | null }[];
  tickets: { id: number; ticket_number: string; subject: string; status?: string; company_id?: number | null }[];
  invoices: { id: number; invoice_number: string; status?: string; company_id?: number | null; total_amount?: number }[];
  errors: { id: number; message: string; severity?: string; status?: string }[];
}

export type TenantSupportView = Company & {
  address?: string | null;
  postcode?: string | null;
  website?: string | null;
  registration_number?: string | null;
  vat_number?: string | null;
  archived_at?: string | null;
  primary_contact?: Record<string, unknown> | null;
  administrators?: Record<string, unknown>[];
  users?: Record<string, unknown>[];
  login_history?: Record<string, unknown>[];
  security_events?: Record<string, unknown>[];
  recent_activities?: Record<string, unknown>[];
  support_tickets?: SupportTicket[];
  recent_errors?: Record<string, unknown>[];
  email_logs?: Record<string, unknown>[];
  api_request_count?: number;
};

export interface AdminReportsSummary {
  period_days: number;
  new_tenants: number;
  revenue_collected: number;
  refunds_total?: number;
  net_revenue?: number;
  invoices_created: number;
  logins: number;
  open_tickets: number;
  errors: number;
  api_calls: number;
  tenants_by_tier: Record<string, number>;
  active_tenants: number;
}

export interface AdminHqSnapshot {
  generated_at?: string;
  tenants: {
    total: number;
    active: number;
    trialing: number;
    trial_expired: number;
    past_due: number;
    cancelled: number;
    locked: number;
    new_7d: number;
    new_30d: number;
    expiring_14d: number;
    by_tier: Record<string, number>;
    by_status: Record<string, number>;
    active_users: number;
  };
  billing: {
    mrr: number;
    arr: number;
    collected_all_time: number;
    outstanding: number;
    net_revenue: number;
    refunds_total: number;
    refunds_30d: number;
    refunds_pending: number;
    credit_liability: number;
    failed_subscriptions: number;
    failed_invoices: number;
    churn_rate_30d_pct: number;
    cancelled_30d: number;
    billing_receipts: number;
  };
  trials: { active_rows: number; companies_trialing: number; companies_expired: number };
  ops: {
    open_tickets: number;
    sla_breaches: number;
    critical_errors: number;
    failed_jobs: number;
    queued_jobs: number;
    webhook_failure_count: number;
    notification_failures: number;
    api_calls_7d: number;
    logins_7d: number;
    platform_usage?: Record<string, unknown>;
  };
  lists: {
    upcoming_renewals: {
      company_id: number;
      company_name: string;
      subscription_end?: string;
      tier?: string | null;
      billing_cycle?: string | null;
    }[];
    recent_security_events: { id: number; event_type?: string; severity?: string; message?: string | null; created_at?: string }[];
    recent_refunds: { id: number; company_id: number; amount: number; status?: string; created_at?: string }[];
    recent_webhooks: { id: number; event_type?: string | null; status?: string; created_at?: string }[];
    failed_webhooks: {
      id: number;
      event_type?: string | null;
      status?: string;
      error_message?: string | null;
      created_at?: string;
    }[];
  };
}

export interface OpsHealth {
  status: string;
  issues: string[];
  ops?: Record<string, unknown>;
  billing_alerts?: Record<string, unknown>;
  generated_at?: string;
}

export interface WebhookLogItem {
  id: number;
  company_id?: number | null;
  provider?: string | null;
  event_type?: string | null;
  status?: string | null;
  http_status?: number | null;
  error_message?: string | null;
  attempts?: number | null;
  created_at?: string;
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
  photo_url?: string | null;
  created_at: string;
  /** Write-only, POST /guards only: provisions a Staff-role portal login. Never returned. */
  create_login?: boolean;
  login_password?: string;
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
  /** 1 = Regular, 2 = Ad-hoc */
  site_type: 1 | 2;
  reference?: string | null;
  default_hourly_rate?: number;
  /** Staff pay rate for this site (£/hr) */
  staff_hourly_rate?: number;
  main_contractor_id?: number | null;
  sub_contractor_id?: number | null;
  contractor_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
  /** Write-only, POST /sites only: provisions a Client-role portal login pinned to this
   * site. Rejected on PUT. Never returned. */
  create_login?: boolean;
  login_email?: string;
  login_full_name?: string;
  login_password?: string;
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

export interface ShiftOvertimeLog {
  id: number;
  assignment_id?: number | null;
  guard_id: number;
  site_id?: number | null;
  shift_date: string;
  shift_start?: string | null;
  scheduled_end: string;
  new_end: string;
  reason: string;
  recorded_by?: number | null;
  created_at: string;
}

export interface ShiftEarlyFinishLog {
  id: number;
  assignment_id?: number | null;
  guard_id: number;
  site_id?: number | null;
  shift_date: string;
  shift_start?: string | null;
  scheduled_end: string;
  actual_end: string;
  reason: string;
  recorded_by?: number | null;
  created_at: string;
}

export interface ShiftLateLog {
  id: number;
  assignment_id?: number | null;
  guard_id: number;
  site_id?: number | null;
  shift_date: string;
  scheduled_start: string;
  actual_start: string;
  late_minutes: number;
  note?: string | null;
  recorded_by?: number | null;
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
  published_guard_ids?: number[];
}

export interface RotaPlanPublishResult {
  created: number;
  skipped: number;
  errors: string[];
  published_guard_ids?: number[];
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

export interface PortalHours {
  period: string;
  start_date: string;
  end_date: string;
  total_hours: number;
  shifts_count: number;
  /** Staff logins only. Null for client logins, which never see guard wages. */
  total_pay?: number | null;
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
  access_token: string | null;
  token_type: string;
  mfa_required?: boolean;
  mfa_token?: string | null;
}

export interface MfaStatus {
  enabled: boolean;
  required_for_role?: boolean;
}

export interface MfaSetupResponse {
  secret: string;
  otpauth_uri: string;
  enabled: boolean;
}

export interface MfaConfirmResponse {
  enabled: boolean;
  backup_codes: string[];
}

export interface ApiUsageSummary {
  total: number;
  days: number;
  by_company: { company_id: number | null; company_name?: string | null; count: number }[];
  by_path: { path: string | null; count: number }[];
  recent: { id: number; company_id?: number | null; path?: string | null; method?: string | null; logged_at?: string }[];
}

export interface RefundPolicy {
  id: number;
  code: string;
  name: string;
  description?: string | null;
  scenario_type: string;
  calculation_type: string;
  percentage?: number | null;
  fixed_amount?: number | null;
  requires_approval: boolean;
  auto_approve_below?: number | null;
  max_refund_percent?: number | null;
  max_refund_amount?: number | null;
  min_days_after_payment?: number | null;
  max_days_after_payment?: number | null;
  eligible_payment_statuses?: string[];
  allow_stripe: boolean;
  allow_credit: boolean;
  allow_manual: boolean;
  default_refund_method?: string | null;
  is_active: boolean;
  priority?: number;
  updated_at?: string | null;
  created_at?: string | null;
}

export interface PaymentRefund {
  id: number;
  company_id: number;
  company_name?: string | null;
  subscription_invoice_id?: number | null;
  billing_receipt_id?: number | null;
  subscription_receipt_id?: number | null;
  policy_id?: number | null;
  policy_code?: string | null;
  amount: number;
  currency?: string;
  reason?: string | null;
  status?: string;
  actor_user_id?: number | null;
  scenario_type?: string | null;
  calculation_type?: string | null;
  payment_source?: string | null;
  requested_amount?: number | null;
  calculated_amount?: number | null;
  approved_amount?: number | null;
  processed_amount?: number | null;
  original_paid_amount?: number | null;
  previously_refunded_amount?: number | null;
  remaining_refundable?: number | null;
  refund_method?: string | null;
  stripe_refund_id?: string | null;
  stripe_invoice_id?: string | null;
  credit_applied?: boolean;
  credit_amount?: number | null;
  requires_approval?: boolean;
  requested_by_user_id?: number | null;
  approved_by_user_id?: number | null;
  approved_at?: string | null;
  rejected_by_user_id?: number | null;
  rejected_at?: string | null;
  rejection_reason?: string | null;
  processed_by_user_id?: number | null;
  processed_at?: string | null;
  cancelled_by_user_id?: number | null;
  cancelled_at?: string | null;
  override_used?: boolean;
  override_reason?: string | null;
  idempotency_key?: string | null;
  error_message?: string | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string | null;
  events?: RefundEvent[];
  policy?: RefundPolicy;
}

export interface RefundEvent {
  id: number;
  action: string;
  from_status?: string | null;
  to_status?: string | null;
  amount?: number | null;
  note?: string | null;
  actor_user_id?: number | null;
  created_at?: string;
  detail?: Record<string, unknown> | null;
}

export interface RefundPreview {
  eligible: boolean;
  errors: string[];
  company_id: number;
  company_name?: string | null;
  payment_source?: string;
  payment_label?: string | null;
  payment_status?: string;
  subscription_status?: string | null;
  subscription_tier?: string | null;
  original_paid_amount: number;
  previously_refunded_amount: number;
  remaining_refundable: number;
  calculated_amount: number;
  currency?: string;
  requires_approval: boolean;
  refund_method?: string;
  stripe_invoice_id?: string | null;
  account_credit_balance?: number;
  days_since_payment?: number | null;
  policy: RefundPolicy;
  invoice_id?: number | null;
  billing_receipt_id?: number | null;
  subscription_receipt_id?: number | null;
}

export interface NotificationTemplate {
  id: number;
  key: string;
  name?: string | null;
  channel?: string | null;
  subject?: string | null;
  body?: string | null;
  is_active?: boolean;
  updated_at?: string | null;
}

export interface NotificationLogItem {
  id: number;
  channel?: string | null;
  recipient?: string | null;
  subject?: string | null;
  status?: string | null;
  company_id?: number | null;
  user_id?: number | null;
  template_key?: string | null;
  created_at?: string;
  sent_at?: string | null;
  error_message?: string | null;
}

export interface RetentionPolicy {
  login_logs_days: number;
  audit_logs_days: number;
  api_usage_days: number;
  email_logs_days: number;
  error_logs_days: number;
  security_events_days: number;
}

export interface PasswordPolicy {
  min_length: number;
  require_upper: boolean;
  require_lower: boolean;
  require_digit: boolean;
  require_special: boolean;
  max_age_days?: number | null;
}

export interface MaintenanceConfig {
  enabled: boolean;
  message?: string | null;
}

export interface SuspiciousEvent {
  id: number;
  event_type?: string;
  severity?: string;
  message?: string | null;
  company_id?: number | null;
  user_id?: number | null;
  ip_address?: string | null;
  created_at?: string;
}

export interface PlatformRoleAssignment {
  user_id: number;
  email?: string | null;
  full_name?: string | null;
  role_id?: number;
  role_slug?: string | null;
  role_name?: string | null;
  assigned_at?: string | null;
}

export interface AdminReportsTimeseries {
  labels: string[];
  new_tenants: number[];
  revenue: number[];
  logins: number[];
  tickets: number[];
}

export interface JobTitle {
  id: number;
  company_id: number;
  name: string;
  /** Staff currently carrying this title. */
  staff_count: number;
  created_at?: string;
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
  /** Write-only, POST /clients only: provisions a Client-role portal login. Never returned. */
  create_login?: boolean;
  login_password?: string;
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

export interface Lead {
  id: number;
  company_id: number;
  title: string;
  organization?: string | null;
  contact_name?: string | null;
  designation?: string | null;
  email?: string | null;
  email_secondary?: string | null;
  phone?: string | null;
  phone_secondary?: string | null;
  address?: string | null;
  city?: string | null;
  postcode?: string | null;
  comments?: string | null;
  source?: string | null;
  status: string;
  priority?: string | null;
  estimated_value?: number;
  assigned_user_id?: number | null;
  created_by?: number | null;
  converted: boolean;
  converted_at?: string | null;
  converted_to_type?: string | null;
  converted_to_id?: number | null;
  next_follow_up_at?: string | null;
  meeting_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadDashboard {
  total_leads: number;
  period_leads: number;
  conversion_rate: number;
  monthly_growth: number;
  revenue_forecast: number;
  missed_follow_ups: number;
  funnel: { status: string; count: number }[];
  sources: { source: string; count: number }[];
  trend: { date: string; count: number }[];
  period_start: string;
  period_end: string;
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

export interface PayrollPreviewShift {
  assignment_id: number;
  guard_id: number;
  guard_name: string;
  date: string;
  site_id: number | null;
  site_name: string;
  shift_start: string | null;
  shift_end: string | null;
  break_minutes: number;
  hours: number;
  attendance_status: string;
  late_minutes: number | null;
  shift_rate: number | null;
  payable: boolean;
  amount: number;
}

export interface PayrollPreviewSite {
  site_id: number | null;
  site_name: string;
  shifts: number;
  rota_hours: number;
  attended_hours: number;
  unattended_hours: number;
  amount: number;
}

export interface PayrollPreviewEmployee {
  guard_id: number;
  guard_name: string;
  shifts: number;
  rota_hours: number;
  attended_hours: number;
  unattended_hours: number;
  amount: number;
}

export interface PayrollPreview {
  guard_id: number | null;
  guard_name: string;
  period_start: string;
  period_end: string;
  total_shifts: number;
  attended_shifts: number;
  rota_hours: number;
  attended_hours: number;
  unattended_hours: number;
  amount: number;
  rota_amount: number;
  shifts_missing_rate: number;
  employee_count: number;
  by_employee: PayrollPreviewEmployee[];
  by_site: PayrollPreviewSite[];
  shifts: PayrollPreviewShift[];
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

/** A portal login attached to a client or pinned to a site. */
export interface PortalLogin {
  id: number;
  email: string;
  full_name: string;
  role_name: string;
  is_active: boolean;
  site_ids: number[];
}

/** One immutable entry in the Shift History audit trail. */
export interface ShiftHistoryRow {
  id: number;
  shift_ref: string;
  assignment_id: number | null;
  rota_plan_id: number | null;
  rota_name: string;
  site_id: number | null;
  site: string;
  guard_id: number | null;
  guard: string;
  shift_date: string;
  action: string;
  action_label: string;
  summary: string;
  changes: { field: string; label: string; from: unknown; to: unknown }[];
  previous_values: string;
  new_values: string;
  source: string;
  user_id: number | null;
  user: string;
  user_email: string;
  user_role: string;
  action_date: string;
  action_time: string;
  created_at: string;
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
  mail_server?: string | null;
  mail_port?: number | null;
  mail_username?: string | null;
  password_set?: boolean;
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
  file_name?: string;
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
  note?: string | null;
  updated_at?: string | null;
  updated_by_user_id?: number | null;
  updated_by_name?: string | null;
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
  issued_invoice_count?: number;
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
  issued_invoice_count?: number;
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

export interface PatrolCheckpoint {
  id: number;
  company_id: number;
  site_id: number;
  route_id: number;
  code: string;
  name: string;
  floor?: string | null;
  description?: string | null;
  qr_token: string;
  qr_url: string;
  latitude: number;
  longitude: number;
  radius_m: number;
  sort_order: number;
  status: string;
  created_at: string;
}

export interface PatrolRoute {
  id: number;
  company_id: number;
  site_id: number;
  site_name?: string | null;
  name: string;
  frequency_minutes: number;
  start_time: string;
  end_time: string;
  status: string;
  checkpoint_count: number;
  created_at: string;
  checkpoints?: PatrolCheckpoint[];
}

export interface PatrolLog {
  id: number;
  company_id: number;
  guard_id: number;
  guard_name?: string | null;
  checkpoint_id: number;
  checkpoint_name?: string | null;
  checkpoint_code?: string | null;
  route_id: number;
  route_name?: string | null;
  session_id?: number | null;
  scan_time: string;
  latitude?: number | null;
  longitude?: number | null;
  distance_m?: number | null;
  status: string;
  notes?: string | null;
  photo_url?: string | null;
}

export interface PatrolComplianceRow {
  site_id: number;
  site_name: string;
  client_id?: number | null;
  client_name?: string | null;
  route_id: number;
  route_name: string;
  date: string;
  required_patrols: number;
  completed: number;
  missed: number;
  late: number;
  compliance_pct: number;
}

export interface PatrolToday {
  session?: { id: number; route_id: number; status: string } | null;
  route_id?: number | null;
  route_name?: string | null;
  site_name?: string | null;
  next_checkpoint?: PatrolCheckpoint | null;
  due_at?: string | null;
  recent_logs?: PatrolLog[];
}

export interface IncidentAttachment {
  id: number;
  file_path: string;
  mime_type?: string | null;
  url?: string | null;
  created_at: string;
}

export interface Task {
  id: number;
  company_id: number;
  title: string;
  description?: string | null;
  guard_id?: number | null;
  guard_name?: string | null;
  site_id?: number | null;
  site_name?: string | null;
  due_date?: string | null;
  priority: string;
  status: string;
  created_by_user_id: number;
  created_by_name?: string | null;
  completed_by_name?: string | null;
  completed_at?: string | null;
  is_overdue: boolean;
  created_at: string;
}

export interface TaskCounts {
  todo: number;
  in_progress: number;
  done: number;
  cancelled: number;
  overdue: number;
  total: number;
}

export interface OccurrenceEntry {
  id?: number;
  serial_no?: number | null;
  start_time?: string | null;
  finish_time?: string | null;
  occurrence?: string | null;
  action_taken?: string | null;
}

export interface OccurrenceSheet {
  id: number;
  company_id: number;
  client_id?: number | null;
  reference?: string | null;
  sheet_date: string;
  site_id?: number | null;
  site_name?: string | null;
  guard_id?: number | null;
  guard_name?: string | null;
  officer_names?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
  signature_name?: string | null;
  status: string;
  created_by_user_id: number;
  created_by_name?: string | null;
  entry_count: number;
  entries: OccurrenceEntry[];
  created_at: string;
}

export interface CatalogueOption { key: string; label: string }
export interface IncidentCatalogue { categories: CatalogueOption[]; services: CatalogueOption[] }

export interface IncidentMatrixRow {
  site_id: number | null;
  site_name: string;
  supplier: string;
  categories: Record<string, number>;
  services: Record<string, number>;
  total_incidents: number;
}

export interface IncidentMatrixReport {
  period_start: string | null;
  period_end: string | null;
  company_name: string;
  category_columns: CatalogueOption[];
  service_columns: CatalogueOption[];
  rows: IncidentMatrixRow[];
  totals: IncidentMatrixRow;
}

export interface AccidentReport {
  id: number;
  company_id: number;
  client_id?: number | null;
  site_id?: number | null;
  site_name?: string | null;
  guard_id?: number | null;
  guard_name?: string | null;
  created_by_user_id: number;
  created_by_name?: string | null;
  reference?: string | null;
  report_date: string;
  supervisor_name: string;
  sia_number?: string | null;
  accident_type?: string | null;
  accident_time?: string | null;
  accident_location?: string | null;
  persons_involved?: string | null;
  police_informed: boolean;
  police_time_informed?: string | null;
  police_time_attended?: string | null;
  police_time_left?: string | null;
  fire_informed: boolean;
  fire_time_informed?: string | null;
  fire_time_attended?: string | null;
  fire_time_left?: string | null;
  ambulance_informed: boolean;
  ambulance_time_informed?: string | null;
  ambulance_time_attended?: string | null;
  ambulance_time_left?: string | null;
  comments?: string | null;
  status: string;
  created_at: string;
}

export interface Incident {
  id: number;
  company_id: number;
  client_id?: number | null;
  client_name?: string | null;
  site_id?: number | null;
  site_name?: string | null;
  reported_by_user_id: number;
  reported_by_name?: string | null;
  guard_id?: number | null;
  notes: string;
  category?: string;
  category_label?: string | null;
  police_called?: boolean;
  ambulance_called?: boolean;
  fire_brigade_called?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  occurred_at: string;
  status: string;
  created_at: string;
  attachments?: IncidentAttachment[];
}

export interface IncidentSummaryRow {
  status: string;
  count: number;
  site_id?: number | null;
  site_name?: string | null;
}

// --- Lone worker / check calls ---

export interface LoneWorkerContact {
  id?: number;
  policy_id?: number;
  level: number;
  user_id?: number | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}

export interface LoneWorkerPolicy {
  id: number;
  company_id: number;
  site_id?: number | null;
  site_name?: string | null;
  name: string;
  check_in_minutes: number;
  reminder_minutes: number;
  grace_minutes: number;
  escalation_interval_minutes: number;
  require_location: boolean;
  status: string;
  contacts: LoneWorkerContact[];
}

/** A live (or finished) spell of lone working. `display_status` is the label to show. */
export interface LoneWorkerSession {
  id: number;
  company_id: number;
  guard_id: number;
  guard_name?: string | null;
  site_id?: number | null;
  site_name?: string | null;
  policy_id?: number | null;
  location_note?: string | null;
  check_in_minutes: number;
  reminder_minutes: number;
  grace_minutes: number;
  started_at?: string | null;
  expected_end_at?: string | null;
  ended_at?: string | null;
  last_check_in_at?: string | null;
  status: string;
  source?: string | null;
  display_status: string;
  next_check_due_at?: string | null;
  seconds_to_next_check?: number | null;
  open_incident_id?: number | null;
  open_incident_kind?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface LoneWorkerIncident {
  id: number;
  company_id: number;
  session_id?: number | null;
  check_id?: number | null;
  guard_id?: number | null;
  guard_name?: string | null;
  site_id?: number | null;
  site_name?: string | null;
  guard_phone?: string | null;
  kind: string;
  status: string;
  escalation_level: number;
  opened_at?: string | null;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  resolved_at?: string | null;
  resolved_by?: string | null;
  resolution?: string | null;
  notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  display_status: string;
}

/** One immutable entry in the lone worker audit trail. */
export interface LoneWorkerEvent {
  id: number;
  session_id?: number | null;
  incident_id?: number | null;
  guard_id?: number | null;
  guard: string;
  site: string;
  event_type: string;
  event_label: string;
  message: string;
  escalation_level?: number | null;
  channel?: string | null;
  recipient?: string | null;
  user: string;
  source: string;
  event_date: string;
  event_time: string;
  created_at: string;
}

/**
 * The filter set Invoices, Payroll and Rota share.
 *
 * `client_id` covers every site assigned to that client, so a client with ten sites is
 * one pick rather than ten. Contractor ids are the directory's UUIDs. All six combine
 * with AND; leave a field out to mean "all".
 */
export interface WorkFilterParams {
  client_id?: number;
  site_id?: number;
  contractor_id?: string;
  sub_contractor_id?: string;
  guard_id?: number;
  job_title?: string;
}
