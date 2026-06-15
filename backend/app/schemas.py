from pydantic import BaseModel, EmailStr, Field, model_validator
from datetime import date, datetime
from typing import Any, List, Optional
from uuid import UUID

class UserBase(BaseModel):
    email: EmailStr
    full_name: str

class UserCreate(UserBase):
    password: str
    company_name: str
    subscription_tier: Optional[str] = None

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=6)

class UserResponse(UserBase):
    id: int
    role: Optional[str] = None
    role_id: Optional[int] = None
    company_id: Optional[int] = None
    client_id: Optional[int] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserMeResponse(UserResponse):
    permissions: List[str] = Field(default_factory=list)
    plan: Optional[dict[str, Any]] = None
    company_name: Optional[str] = None
    logo_url: Optional[str] = None
    subscription_status: Optional[str] = None
    subscription_end: Optional[datetime] = None
    sidebar_modules: Optional[List[str]] = None
    enabled_modules: Optional[dict[str, bool]] = None


class SubscriptionReceiptResponse(BaseModel):
    id: int
    ref_id: str
    company_id: int
    company_name: Optional[str] = None
    user_email: Optional[str] = None
    subscription_tier: str
    amount: float
    period_days: int
    status: str
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SignupResponse(BaseModel):
    user: UserResponse
    receipt: SubscriptionReceiptResponse


class ReceiptPublicResponse(BaseModel):
    ref_id: str
    company_name: str
    subscription_tier: str
    amount: float
    period_days: int
    status: str
    created_at: datetime


class AdminResetPassword(BaseModel):
    new_password: str = Field(min_length=6)


class AdminSidebarPatch(BaseModel):
    sidebar_modules: List[str]


class AdminUserActivePatch(BaseModel):
    is_active: bool


class AdminUserListItem(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: Optional[str] = None
    is_active: bool
    created_at: datetime
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    subscription_tier: Optional[str] = None
    subscription_status: Optional[str] = None


class AdminCompanyUpdate(BaseModel):
    name: Optional[str] = None
    subscription_tier: Optional[str] = None
    subscription_status: Optional[str] = None
    subscription_end: Optional[datetime] = None
    billing_cycle: Optional[str] = None
    max_users: Optional[int] = None
    enabled_modules: Optional[dict[str, bool]] = None


class AdminModulesPatch(BaseModel):
    enabled_modules: dict[str, bool]


class PlanTierOut(BaseModel):
    tier: str
    price_gbp: float
    max_guards: Optional[int] = None
    max_sites: Optional[int] = None
    max_users: Optional[int] = None
    features: dict[str, Any] = Field(default_factory=dict)


class PlanTierUpdate(BaseModel):
    price_gbp: Optional[float] = None
    max_guards: Optional[int] = None
    max_sites: Optional[int] = None
    max_users: Optional[int] = None
    features: Optional[dict[str, Any]] = None


class AdminUserDetail(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role: Optional[str] = None
    is_active: bool
    created_at: datetime
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    subscription_tier: Optional[str] = None
    subscription_status: Optional[str] = None
    subscription_start: Optional[datetime] = None
    subscription_end: Optional[datetime] = None
    subscription_days_left: Optional[int] = None
    billing_cycle: Optional[str] = None
    max_users: Optional[int] = None
    user_count: Optional[int] = None
    enabled_modules: dict[str, bool] = Field(default_factory=dict)
    usage: dict[str, Any] = Field(default_factory=dict)
    sidebar_modules: List[str] = Field(default_factory=list)
    receipts: List[SubscriptionReceiptResponse] = Field(default_factory=list)


class SubscriptionInvoiceResponse(BaseModel):
    id: int
    invoice_number: str
    company_id: int
    company_name: Optional[str] = None
    tenant_email: Optional[str] = None
    subscription_tier: str
    billing_cycle: str
    period_start: Optional[datetime] = None
    period_end: Optional[datetime] = None
    due_date: date
    amount_ex_vat: float
    vat_amount: float
    total_amount: float
    amount_paid: float = 0
    status: str
    email_sent: bool = False
    sent_at: Optional[datetime] = None
    paid_at: Optional[datetime] = None
    created_at: datetime


class SubscriptionInvoiceStatusPatch(BaseModel):
    status: str


class SubscriptionInvoicePaymentPatch(BaseModel):
    amount: float


class LoginLogResponse(BaseModel):
    id: int
    user_id: Optional[int] = None
    email: Optional[str] = None
    full_name: Optional[str] = None
    company_id: Optional[int] = None
    login_at: datetime
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    status: str


class AdminDashboardResponse(BaseModel):
    total_companies: int
    active_subscriptions: int
    total_invoices: int
    paid_invoices: int
    unpaid_invoices: int
    overdue_invoices: int
    partial_invoices: int
    outstanding_balance: float
    total_collected: float
    platform_usage: dict[str, Any] = Field(default_factory=dict)


class CompanyBase(BaseModel):
    name: str


class CompanyResponse(CompanyBase):
    id: int
    admin_id: int
    subscription_tier: Optional[str] = None
    subscription_status: Optional[str] = None
    subscription_start: Optional[datetime] = None
    subscription_end: Optional[datetime] = None
    billing_cycle: Optional[str] = None
    max_users: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CompanyAdminResponse(CompanyBase):
    id: int
    admin_id: int
    subscription_tier: Optional[str] = None
    subscription_status: Optional[str] = None
    subscription_start: Optional[datetime] = None
    subscription_end: Optional[datetime] = None
    billing_cycle: Optional[str] = None
    max_users: Optional[int] = None
    user_count: Optional[int] = None
    enabled_modules: dict[str, bool] = Field(default_factory=dict)
    usage: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CompanyProfileUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    account_name: Optional[str] = None
    bank_name: Optional[str] = None
    sort_code: Optional[str] = None
    account_number: Optional[str] = None
    iban: Optional[str] = None
    swift_code: Optional[str] = None


class CompanyProfileResponse(BaseModel):
    id: int
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    logo_url: Optional[str] = None
    account_name: Optional[str] = None
    bank_name: Optional[str] = None
    sort_code: Optional[str] = None
    account_number: Optional[str] = None
    iban: Optional[str] = None
    swift_code: Optional[str] = None

class GuardBase(BaseModel):
    full_name: Optional[str] = None
    title: Optional[str] = None
    first_name: Optional[str] = None
    middle_name: Optional[str] = None
    last_name: Optional[str] = None
    gender: Optional[str] = None
    ethnicity: Optional[str] = None
    date_of_birth: Optional[date] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    work_phone: Optional[str] = None
    job_title: Optional[str] = None
    employment_start_date: Optional[date] = None
    probation_end_date: Optional[date] = None
    address_line_1: Optional[str] = None
    address_line_2: Optional[str] = None
    address_line_3: Optional[str] = None
    town_city: Optional[str] = None
    county: Optional[str] = None
    postcode: Optional[str] = None
    address: Optional[str] = None
    emergency_first_name: Optional[str] = None
    emergency_last_name: Optional[str] = None
    emergency_mobile: Optional[str] = None
    emergency_home_phone: Optional[str] = None
    emergency_work_phone: Optional[str] = None
    emergency_relationship: Optional[str] = None
    emergency_address_line_1: Optional[str] = None
    emergency_address_line_2: Optional[str] = None
    emergency_address_line_3: Optional[str] = None
    emergency_town_city: Optional[str] = None
    emergency_county: Optional[str] = None
    emergency_postcode: Optional[str] = None
    bank_account_name: Optional[str] = None
    bank_name: Optional[str] = None
    bank_branch: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_sort_code: Optional[str] = None
    tax_code: Optional[str] = None
    ni_number: Optional[str] = None
    passport_number: Optional[str] = None
    passport_country: Optional[str] = None
    passport_expiry_date: Optional[date] = None
    license_number: Optional[str] = None
    driving_licence_country: Optional[str] = None
    driving_licence_class: Optional[str] = None
    driving_licence_expiry_date: Optional[date] = None
    holiday_jurisdiction: Optional[str] = None
    employee_type: Optional[str] = None
    working_time_pattern: Optional[str] = None
    company_full_time_week_hrs: Optional[int] = None
    company_full_time_week_mins: Optional[int] = None
    entitlement_unit: Optional[str] = None
    contracted_week_hrs: Optional[int] = None
    contracted_week_mins: Optional[int] = None
    average_day_hrs: Optional[int] = None
    average_day_mins: Optional[int] = None
    annual_leave_equivalent_hrs: Optional[int] = None
    annual_leave_equivalent_mins: Optional[int] = None
    leave_year_start_day: Optional[int] = None
    leave_year_start_month: Optional[int] = None
    leave_entitlement_hrs: Optional[int] = None
    leave_entitlement_mins: Optional[int] = None
    leave_allowance_hrs: Optional[int] = None
    leave_allowance_mins: Optional[int] = None
    badge_number: Optional[str] = None
    sia_number: Optional[str] = None
    sia_expiry_date: Optional[date] = None
    visa_status: Optional[str] = None
    visa_expiry_date: Optional[date] = None
    share_code: Optional[str] = None
    share_code_expiry_date: Optional[date] = None
    rtw_status: Optional[str] = None
    employment_history: Optional[str] = None
    dbs_status: Optional[str] = None
    main_contractor_id: Optional[int] = None
    sub_contractor_id: Optional[int] = None
    contractor_id: Optional[UUID] = None
    weekly_contracted_hours: Optional[float] = 40.0
    service_area: Optional[str] = None
    nearby_areas: Optional[str] = None
    has_car: Optional[bool] = False
    available_days: Optional[str] = None
    availability_timing: Optional[str] = None
    pay_frequency: Optional[str] = "weekly"

    @model_validator(mode="before")
    @classmethod
    def normalize_guard(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data
        d = dict(data)
        for k, v in list(d.items()):
            if v == "":
                d[k] = None
        fn = (d.get("first_name") or "").strip()
        ln = (d.get("last_name") or "").strip()
        if fn or ln:
            parts = [d.get("title"), fn, (d.get("middle_name") or "").strip() or None, ln]
            d["full_name"] = " ".join(p for p in parts if p)
        hrs = d.get("contracted_week_hrs")
        mins = d.get("contracted_week_mins")
        if (hrs or 0) > 0 or (mins or 0) > 0:
            d["weekly_contracted_hours"] = float(hrs or 0) + float(mins or 0) / 60.0
        lines = [d.get("address_line_1"), d.get("address_line_2"), d.get("address_line_3"), d.get("town_city"), d.get("county"), d.get("postcode")]
        joined = ", ".join(x.strip() for x in lines if x and str(x).strip())
        if joined and not d.get("address"):
            d["address"] = joined
        return d

    @model_validator(mode="after")
    def require_identity(self) -> "GuardBase":
        if not (self.full_name or "").strip():
            if not ((self.first_name or "").strip() and (self.last_name or "").strip()):
                raise ValueError("First name and last name are required")
        return self

class GuardCreate(GuardBase):
    pass

class GuardResponse(GuardBase):
    id: int
    company_id: int
    full_name: str
    created_at: datetime

    class Config:
        from_attributes = True

class SiteBase(BaseModel):
    name: str
    color: Optional[str] = "#3b82f6"
    client_id: Optional[int] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    contact_person: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_phone: Optional[str] = None
    contract_start_date: Optional[date] = None
    contract_end_date: Optional[date] = None
    default_hourly_rate: Optional[float] = None
    main_contractor_id: Optional[int] = None
    sub_contractor_id: Optional[int] = None
    contractor_id: Optional[UUID] = None

class SiteCreate(SiteBase):
    pass

class SiteResponse(SiteBase):
    id: int
    company_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class AssignmentBase(BaseModel):
    guard_id: int
    site_id: int
    date: date
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    break_minutes: Optional[int] = 0
    shift_type: Optional[str] = "day"
    shift_rate: Optional[float] = None
    rota_plan_id: Optional[int] = None

class AssignmentCreate(AssignmentBase):
    pass

class AssignmentResponse(AssignmentBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class RotaPlanCreate(BaseModel):
    name: str
    start_date: date
    day_count: int
    view_mode: str = "table"
    budget: float = 0
    planner_data: Optional[str] = None

class RotaPlanCopy(BaseModel):
    name: str
    start_date: date
    day_count: Optional[int] = None
    view_mode: Optional[str] = None
    budget: Optional[float] = None

class RotaPlanUpdate(BaseModel):
    name: Optional[str] = None
    view_mode: Optional[str] = None
    budget: Optional[float] = None
    planner_data: Optional[str] = None
    status: Optional[str] = None

class RotaPlanListItem(BaseModel):
    id: int
    name: str
    start_date: date
    end_date: date
    day_count: int
    view_mode: str
    budget: float
    status: str
    shift_count: int = 0
    staff_count: int = 0
    created_at: datetime
    published_at: Optional[datetime] = None

    class Config:
        from_attributes = True

class RotaPlanDetail(RotaPlanListItem):
    planner_data: Optional[str] = None

class RotaPlanPublishResult(BaseModel):
    created: int
    skipped: int
    errors: List[str] = Field(default_factory=list)

class RotaResponse(BaseModel):
    guard_id: int
    guard_name: str
    site_id: int
    site_name: str
    date: date
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    break_minutes: Optional[int] = None
    shift_type: Optional[str] = None

    class Config:
        from_attributes = True


class RotaDetailResponse(BaseModel):
    id: int
    guard_id: int
    guard_name: str
    site_id: int
    site_name: str
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    date: date
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    break_minutes: int = 0
    shift_type: str = "day"
    hours: float = 0
    attendance_status: str
    late_minutes: Optional[int] = None

    class Config:
        from_attributes = True


class RotaSummaryRow(BaseModel):
    guard_id: int
    guard_name: str
    total_hours: float
    late_arrivals: int
    overtime_hours: float
    committed_hours: float

    class Config:
        from_attributes = True


class ClientBase(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    contact_person: Optional[str] = None
    double_rate_special_days: bool = False
    contract_start_date: Optional[date] = None
    contract_end_date: Optional[date] = None


class SpecialDayCreate(BaseModel):
    date: date
    label: str


class SpecialDayResponse(BaseModel):
    id: int
    company_id: int
    date: date
    label: str

    class Config:
        from_attributes = True


class SeedUkYear(BaseModel):
    year: int


class ClientCreate(ClientBase):
    pass

class ClientResponse(ClientBase):
    id: int
    company_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class ClientRenewContract(BaseModel):
    new_end_date: date
    note: Optional[str] = None


class ClientContractRenewalResponse(BaseModel):
    id: int
    client_id: int
    previous_end_date: Optional[date] = None
    new_end_date: date
    note: Optional[str] = None
    user_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ContractExpiryAlert(BaseModel):
    client_id: int
    client_name: str
    contract_end_date: date

class MainContractorBase(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    registration_number: Optional[str] = None
    contract_start_date: Optional[date] = None
    contract_end_date: Optional[date] = None
    status: str = "active"


class MainContractorCreate(MainContractorBase):
    pass


class MainContractorResponse(MainContractorBase):
    id: int
    company_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class SubContractorBase(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
    postcode: Optional[str] = None
    registration_number: Optional[str] = None
    contract_start_date: Optional[date] = None
    contract_end_date: Optional[date] = None
    status: str = "active"


class SubContractorCreate(SubContractorBase):
    main_contractor_id: int


class SubContractorResponse(SubContractorBase):
    id: int
    company_id: int
    main_contractor_id: Optional[int] = None
    created_at: datetime

    @model_validator(mode='before')
    @classmethod
    def _map_license(cls, data):
        if isinstance(data, dict):
            return data
        if getattr(data, '__tablename__', None) == 'sub_contractors':
            reg = getattr(data, 'registration_number', None) or getattr(data, 'license_number', None)
            return {
                'id': data.id,
                'company_id': data.company_id,
                'main_contractor_id': getattr(data, 'main_contractor_id', None),
                'name': data.name,
                'contact_person': data.contact_person,
                'phone': data.phone,
                'email': data.email,
                'address': data.address,
                'registration_number': reg,
                'contract_start_date': getattr(data, 'contract_start_date', None),
                'contract_end_date': getattr(data, 'contract_end_date', None),
                'status': getattr(data, 'status', None) or 'active',
                'created_at': data.created_at,
            }
        return data

    class Config:
        from_attributes = True

class EmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str

class GuardDocumentBase(BaseModel):
    document_type: str
    file_path: Optional[str] = None
    expiry_date: Optional[date] = None

class GuardDocumentCreate(GuardDocumentBase):
    pass

class GuardDocumentCreateFlat(GuardDocumentBase):
    guard_id: int

class GuardDocumentResponse(GuardDocumentBase):
    id: int
    guard_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class GuardRateBase(BaseModel):
    hourly_rate: float
    effective_from: date

class GuardRateCreate(GuardRateBase):
    pass

class GuardRateResponse(GuardRateBase):
    id: int
    guard_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class SiteRateBase(BaseModel):
    shift_type: str = "day"
    hourly_rate: float

class SiteRateCreate(SiteRateBase):
    pass

class SiteRateResponse(SiteRateBase):
    id: int
    site_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class AllowanceBase(BaseModel):
    name: str
    allowance_type: str = "fixed"
    amount: float
    in_payroll: bool = True
    in_invoice: bool = True

class AllowanceCreate(AllowanceBase):
    pass

class AllowanceResponse(AllowanceBase):
    id: int
    company_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class AttendanceBase(BaseModel):
    assignment_id: int
    guard_id: int
    booked_at: Optional[datetime] = None
    booked_off_at: Optional[datetime] = None
    status: Optional[str] = "on_time"

class AttendanceCreate(AttendanceBase):
    pass

class AttendanceResponse(AttendanceBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True

class BookingOnOff(BaseModel):
    assignment_id: int
    book_off: bool = False

class PayrollBase(BaseModel):
    guard_id: int
    period_start: date
    period_end: date
    total_hours: Optional[float] = 0
    hourly_rate: Optional[float] = 0
    bank_amount: Optional[float] = 0
    cash_amount: Optional[float] = 0
    allowance_total: Optional[float] = 0
    payment_mode: Optional[str] = "100_bank"

class PayrollCreate(PayrollBase):
    pass

class PayrollResponse(PayrollBase):
    id: int
    company_id: int
    created_at: datetime

    class Config:
        from_attributes = True

class InvoiceLineBase(BaseModel):
    site_id: int
    guard_id: Optional[int] = None
    hours: float = 0
    rate: float = 0
    amount: float = 0
    allowance_amount: float = 0

class InvoiceLineResponse(InvoiceLineBase):
    id: int
    invoice_id: int
    created_at: datetime
    site_name: Optional[str] = None
    guard_name: Optional[str] = None

    class Config:
        from_attributes = True

class InvoiceLineUpdate(BaseModel):
    site_id: Optional[int] = None
    guard_id: Optional[int] = None
    hours: Optional[float] = None
    rate: Optional[float] = None
    allowance_amount: Optional[float] = None

class InvoiceBase(BaseModel):
    client_id: int
    period_start: date
    period_end: date
    total: Optional[float] = 0
    status: Optional[str] = "draft"
    due_date: Optional[date] = None
    notes: Optional[str] = None
    tax_rate: float = 0
    subtotal: float = 0
    tax_amount: float = 0

class InvoiceCreate(InvoiceBase):
    pass

class InvoiceUpdate(BaseModel):
    due_date: Optional[date] = None
    notes: Optional[str] = None
    tax_rate: Optional[float] = None
    status: Optional[str] = None

class InvoiceResponse(InvoiceBase):
    id: int
    company_id: int
    pdf_path: Optional[str] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    client_name: Optional[str] = None
    company_name: Optional[str] = None
    company_email: Optional[str] = None
    company_phone: Optional[str] = None
    company_address: Optional[str] = None
    company_logo_url: Optional[str] = None
    account_name: Optional[str] = None
    bank_name: Optional[str] = None
    sort_code: Optional[str] = None
    account_number: Optional[str] = None
    iban: Optional[str] = None
    swift_code: Optional[str] = None
    client_email: Optional[str] = None
    client_phone: Optional[str] = None
    client_address: Optional[str] = None
    client_contact_person: Optional[str] = None
    lines: list[InvoiceLineResponse] = []
    amount_paid: float = 0
    balance_due: float = 0
    payments: list["PaymentResponse"] = []

    class Config:
        from_attributes = True


class InvoiceAuditEntry(BaseModel):
    id: int
    created_at: datetime
    user_id: Optional[int] = None
    user_name: Optional[str] = None
    action: str
    meta: Optional[dict[str, Any]] = None

class PaymentBase(BaseModel):
    invoice_id: Optional[int] = None
    amount: float
    method: Optional[str] = None
    paid_at: Optional[datetime] = None

class PaymentCreate(PaymentBase):
    pass

class PaymentResponse(PaymentBase):
    id: int
    company_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AdminPaymentResponse(PaymentBase):
    id: int
    company_id: int
    created_at: datetime
    company_name: Optional[str] = None
    invoice_total: Optional[float] = None

    class Config:
        from_attributes = True

class SubscriptionUpdate(BaseModel):
    subscription_tier: str

class ChartPoint(BaseModel):
    label: str
    value: float


class DashboardStats(BaseModel):
    active_guards: int
    sites_count: int = 0
    clients_count: int = 0
    expiring_documents: int
    sia_expiring_30d: int = 0
    revenue_total: float
    payroll_mtd: float = 0
    invoice_total: float = 0
    invoice_outstanding: float = 0
    late_count: int
    present_count: int = 0
    absent_count: int = 0
    upcoming_shifts: int
    shifts_today: int = 0
    main_contractors_total: int = 0
    main_contractors_active: int = 0
    sub_contractors_total: int = 0
    sub_contractors_active: int = 0
    contracts_expiring_soon: int = 0
    rotas_total: int = 0
    rotas_active: int = 0


class DashboardOverview(BaseModel):
    stats: DashboardStats
    shifts_by_day: List[ChartPoint] = Field(default_factory=list)
    attendance_by_status: List[ChartPoint] = Field(default_factory=list)
    payroll_by_month: List[ChartPoint] = Field(default_factory=list)
    operations_compare: List[ChartPoint] = Field(default_factory=list)

class ComplianceAlert(BaseModel):
    guard_id: int
    guard_name: str
    document_type: str
    expiry_date: date


class RoleOut(BaseModel):
    id: int
    company_id: int
    name: str
    slug: str
    is_system: bool
    matrix: dict[str, Any]
    uses_matrix: bool


class RoleCreate(BaseModel):
    name: str
    matrix: dict[str, Any]


class RoleUpdate(BaseModel):
    name: Optional[str] = None
    matrix: Optional[dict[str, Any]] = None


class CompanyUserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role_id: Optional[int] = None
    role_slug: Optional[str] = None
    role_name: Optional[str] = None


class UserRolePatch(BaseModel):
    role_id: int


class CompanyUserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    full_name: str = Field(min_length=2, max_length=100)
    role_id: int
    client_id: Optional[int] = None


class StaffRequestCreate(BaseModel):
    client_id: Optional[int] = None
    site_id: int
    shift_date: date
    shift_start: str
    shift_end: str
    break_minutes: int = 30
    staff_count: int = Field(default=1, ge=1, le=50)
    client_notes: Optional[str] = None


class StaffRequestReview(BaseModel):
    comment: Optional[str] = None


class StaffRequestResponse(BaseModel):
    id: int
    company_id: int
    client_id: int
    client_name: str
    site_id: int
    site_name: str
    requested_by_user_id: int
    requested_by_name: str
    shift_date: date
    shift_start: str
    shift_end: str
    break_minutes: int
    staff_count: int
    client_notes: Optional[str] = None
    status: str
    reviewer_user_id: Optional[int] = None
    reviewer_name: Optional[str] = None
    reviewer_comment: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    rota_plan_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ExpenseBase(BaseModel):
    expense_date: date
    category: str
    vendor_name: Optional[str] = None
    reference_number: Optional[str] = None
    description: Optional[str] = None
    amount_ex_vat: float
    payment_method: Optional[str] = None
    payment_status: Optional[str] = "pending"


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    expense_date: Optional[date] = None
    category: Optional[str] = None
    vendor_name: Optional[str] = None
    reference_number: Optional[str] = None
    description: Optional[str] = None
    amount_ex_vat: Optional[float] = None
    payment_method: Optional[str] = None
    payment_status: Optional[str] = None


class ExpenseResponse(BaseModel):
    id: int
    company_id: int
    expense_date: date
    category: str
    vendor_name: Optional[str] = None
    reference_number: Optional[str] = None
    description: Optional[str] = None
    amount_ex_vat: float
    vat_amount: float
    total_amount: float
    payment_method: Optional[str] = None
    payment_status: str
    has_document: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None


class ExpenseBreakdownItem(BaseModel):
    key: str
    count: int
    total_ex_vat: float
    total_vat: float
    total_inc_vat: float


class ExpenseReportResponse(BaseModel):
    period_start: date
    period_end: date
    group_by: str
    totals: dict
    breakdown: List[ExpenseBreakdownItem]


class VatReportResponse(BaseModel):
    period_start: date
    period_end: date
    expense_vat_total: float
    invoice_vat_total: float
    net_vat_summary: float
    total_vat_report: dict
    expense_totals: dict


class ExpenseDashboardResponse(BaseModel):
    period_start: date
    period_end: date
    total_expenses_ex_vat: float
    total_expense_vat: float
    total_invoice_vat: float
    net_vat_payable: float
    total_expenses_inc_vat: float
    category_summary: List[dict]
    recent_expenses: List[ExpenseResponse]
    quarterly_vat: List[dict]


class ReportsHubResponse(BaseModel):
    period_start: date
    period_end: date
    total_revenue: float
    outstanding_invoices: float
    total_expenses: float
    expense_vat: float
    invoice_vat: float
    net_vat: float
    active_users: int
    staff_hours: float
    sms_usage: int
    email_usage: int


class StaffIndividualReportResponse(BaseModel):
    guard_id: int
    guard_name: str
    period_start: date
    period_end: date
    total_shifts: int
    scheduled_shifts: int
    completed_shifts: int
    total_hours: float
    overtime_hours: float
    attendance_summary: dict
    shifts: List[dict] = Field(default_factory=list)


class StaffMonthlyReportResponse(BaseModel):
    period_start: date
    period_end: date
    group_by: str
    by_employee: List[dict]
    grouped_summary: List[dict]
    workforce_total_hours: float
    total_employees: int


class SmsConfigResponse(BaseModel):
    account_sid_set: bool
    auth_token_set: bool
    phone_number: Optional[str] = None
    templates: dict[str, str] = Field(default_factory=dict)
    enabled: bool = True


class SmsConfigUpdate(BaseModel):
    twilio_account_sid: Optional[str] = None
    twilio_auth_token: Optional[str] = None
    twilio_phone_number: Optional[str] = None
    templates: Optional[dict[str, str]] = None


class SmsSendRequest(BaseModel):
    recipient: str
    body: str
    template_key: Optional[str] = None


class SmsLogResponse(BaseModel):
    id: int
    company_id: int
    recipient: str
    body: str
    template_key: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    twilio_sid: Optional[str] = None
    sent_at: datetime

    class Config:
        from_attributes = True
