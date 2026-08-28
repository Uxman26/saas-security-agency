from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator
from datetime import date, datetime
from typing import Any, List, Optional
from uuid import UUID

from app.validators import (
    CompanyNameStr,
    EMAIL_MAX,
    NameStr,
    OptNoteStr,
    OptShortTextStr,
    RequiredNoteStr,
    RequiredShortTextStr,
    SiteNameStr,
    ShortTextStr,
    TokenStr,
    validate_login_password,
    validate_password_strength,
)


class StrictModel(BaseModel):
    """Request model that rejects unknown fields outright.

    Pydantic's default is to silently discard extras, which already blocks mass
    assignment. Forbidding them turns a tampered payload into a 422 instead of a
    quietly-ignored field, which is what we want on anything touching credentials,
    identity or permissions.
    """

    model_config = ConfigDict(extra="forbid")


class UserBase(BaseModel):
    email: EmailStr = Field(max_length=EMAIL_MAX)
    full_name: str

class UserCreate(StrictModel):
    email: EmailStr = Field(max_length=EMAIL_MAX)
    full_name: NameStr
    password: str
    company_name: CompanyNameStr
    subscription_tier: Optional[ShortTextStr] = None

    @field_validator("password")
    @classmethod
    def password_rules(cls, v: str) -> str:
        return validate_password_strength(v)

class UserLogin(StrictModel):
    email: EmailStr = Field(max_length=EMAIL_MAX)
    password: str
    remember_me: Optional[bool] = False

    @field_validator("password")
    @classmethod
    def password_rules(cls, v: str) -> str:
        return validate_login_password(v)


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MessageResponse(BaseModel):
    message: str


class ForgotPasswordRequest(StrictModel):
    email: EmailStr = Field(max_length=EMAIL_MAX)

class ResetPasswordRequest(StrictModel):
    token: TokenStr
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_rules(cls, v: str) -> str:
        return validate_password_strength(v)

class ResendVerificationRequest(StrictModel):
    email: EmailStr = Field(max_length=EMAIL_MAX)

class VerifyEmailRequest(StrictModel):
    token: TokenStr

class UserResponse(UserBase):
    id: int
    role: Optional[str] = None
    role_id: Optional[int] = None
    company_id: Optional[int] = None
    client_id: Optional[int] = None
    guard_id: Optional[int] = None
    is_active: bool
    email_verified: bool = False
    auth_provider: Optional[str] = "local"
    created_at: datetime

    class Config:
        from_attributes = True


class ProfileUpdate(BaseModel):
    """Self-service profile edit. Name only — see auth.patch_my_profile."""

    full_name: NameStr


class UserMeResponse(UserResponse):
    permissions: List[str] = Field(default_factory=list)
    module_access: List[dict[str, Any]] = Field(default_factory=list)
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
    email_verification_required: bool = False


class ReceiptPublicResponse(BaseModel):
    ref_id: str
    company_name: str
    subscription_tier: str
    amount: float
    period_days: int
    billing_cycle: str = "monthly"
    status: str
    created_at: datetime


class BillingSettingsResponse(BaseModel):
    yearly_discount_percent: float
    yearly_discount_coupon_id: str
    payment_failed_lock_retries: int


class BillingSettingsPatch(BaseModel):
    yearly_discount_percent: float | None = None
    payment_failed_lock_retries: int | None = None


class BillingReceiptResponse(BaseModel):
    id: int
    receipt_number: str
    amount: float
    currency: str
    plan_name: str | None = None
    billing_cycle: str | None = None
    payment_method_last4: str | None = None
    invoice_url: str | None = None
    next_renewal_date: str | None = None
    paid_at: str | None = None


class AdminCouponCreate(BaseModel):
    percent_off: float | None = None
    amount_off: int | None = None
    duration: str = "once"
    max_redemptions: int | None = None


class AdminResetPassword(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_rules(cls, v: str) -> str:
        return validate_password_strength(v)


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


class PlatformAuditLogResponse(BaseModel):
    """One super-admin action, for the platform audit trail screen."""

    id: int
    actor_user_id: Optional[int] = None
    actor_email: Optional[str] = None
    action: str
    target_type: str
    target_id: Optional[int] = None
    target_label: Optional[str] = None
    company_id: Optional[int] = None
    company_name: Optional[str] = None
    before_json: Optional[str] = None
    after_json: Optional[str] = None
    note: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


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
    website: Optional[str] = None
    registration_number: Optional[str] = None
    vat_number: Optional[str] = None
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
    website: Optional[str] = None
    registration_number: Optional[str] = None
    vat_number: Optional[str] = None
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
    # Opt-in portal login created alongside the staff record. When set, `email` becomes
    # the login username, so it is required too (enforced in create_guard). Declared here
    # rather than on GuardBase so they never appear on GuardResponse.
    create_login: bool = False
    login_password: Optional[str] = None

    @field_validator("login_password")
    @classmethod
    def login_password_rules(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        return validate_password_strength(v)

class GuardResponse(GuardBase):
    id: int
    company_id: int
    full_name: str
    created_at: datetime
    photo_url: Optional[str] = None

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
    site_type: int = Field(ge=1, le=2, description="1=Regular, 2=Ad-hoc")
    reference: Optional[str] = Field(default=None, max_length=200)
    default_hourly_rate: Optional[float] = None
    staff_hourly_rate: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    main_contractor_id: Optional[int] = None
    sub_contractor_id: Optional[int] = None
    contractor_id: Optional[UUID] = None

    @model_validator(mode="after")
    def staff_rate_not_above_site_rate(self):
        staff = self.staff_hourly_rate
        site = self.default_hourly_rate
        if staff is not None and site is not None and staff > site:
            raise ValueError("Staff rate cannot be greater than site rate")
        return self

class SiteCreate(SiteBase):
    # Capped on the way in only. SiteResponse keeps SiteBase's plain str so sites
    # saved before this limit existed still serialise.
    name: SiteNameStr
    # Opt-in portal login created alongside the site, pinned to just this site. Mirrors
    # ClientCreate.create_login, but the login identity is given explicitly rather than
    # reusing contact_email/contact_person: the site contact is often the guard supervisor
    # or a landlord, not the person who should get portal access.
    create_login: bool = False
    login_email: Optional[EmailStr] = Field(default=None, max_length=EMAIL_MAX)
    login_full_name: Optional[str] = Field(default=None, max_length=100)
    login_password: Optional[str] = None

    @field_validator("login_password")
    @classmethod
    def login_password_rules(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        return validate_password_strength(v)

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
    name: RequiredShortTextStr
    start_date: date
    day_count: int
    view_mode: str = "table"
    budget: float = 0
    planner_data: Optional[str] = None

class RotaPlanCopy(BaseModel):
    name: RequiredShortTextStr
    start_date: date
    day_count: Optional[int] = None
    view_mode: Optional[str] = None
    budget: Optional[float] = None
    # When false (default), attendance, notes, OT, early finish are not copied
    include_attendance_and_notes: bool = False

class RotaPlanUpdate(BaseModel):
    name: Optional[str] = None
    view_mode: Optional[str] = None
    budget: Optional[float] = None
    planner_data: Optional[str] = None
    status: Optional[str] = None
    day_count: Optional[int] = None
    start_date: Optional[date] = None

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
    published_guard_ids: List[int] = Field(default_factory=list)

class RotaPlanPublishResult(BaseModel):
    created: int
    skipped: int
    errors: List[str] = Field(default_factory=list)
    published_guard_ids: List[int] = Field(default_factory=list)

class PlannerExportRequest(BaseModel):
    planner_data: str
    format: str = "pdf"

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
    # The rate stored on the shift itself. Optional so older callers are unaffected.
    shift_rate: Optional[float] = None

    class Config:
        from_attributes = True


class PayrollPreviewShift(BaseModel):
    """One rota'd shift, with whether it is payable and why."""

    assignment_id: int
    guard_id: int
    guard_name: str = ""
    date: date
    site_id: Optional[int] = None
    site_name: str = ""
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    break_minutes: int = 0
    hours: float = 0
    attendance_status: str
    late_minutes: Optional[int] = None
    shift_rate: Optional[float] = None
    payable: bool = False
    amount: float = 0


class PayrollPreviewSite(BaseModel):
    site_id: Optional[int] = None
    site_name: str = ""
    shifts: int = 0
    rota_hours: float = 0
    attended_hours: float = 0
    unattended_hours: float = 0
    amount: float = 0


class PayrollPreviewEmployee(BaseModel):
    guard_id: int
    guard_name: str
    shifts: int = 0
    rota_hours: float = 0
    attended_hours: float = 0
    unattended_hours: float = 0
    amount: float = 0


class PayrollPreviewResponse(BaseModel):
    # None means every employee; the by_employee rows carry the split in that case.
    guard_id: Optional[int] = None
    guard_name: str = "All employees"
    period_start: date
    period_end: date
    total_shifts: int = 0
    attended_shifts: int = 0
    # Everything rota'd in the period, against what attendance says was actually worked.
    rota_hours: float = 0
    attended_hours: float = 0
    unattended_hours: float = 0
    # Pay follows attendance; rota_amount is the same sum over every rota'd shift, so the
    # difference between the two is exactly what the unattended shifts would have cost.
    amount: float = 0
    rota_amount: float = 0
    shifts_missing_rate: int = 0
    employee_count: int = 0
    by_employee: List[PayrollPreviewEmployee] = []
    by_site: List[PayrollPreviewSite] = []
    shifts: List[PayrollPreviewShift] = []


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
    label: RequiredShortTextStr


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
    # Tightened on input only; ClientResponse keeps ClientBase's plain str.
    # 100 to match clientSchema in frontend/lib/validation.ts — a tighter cap here
    # would 422 input the UI accepted.
    name: CompanyNameStr
    # Opt-in portal login created alongside the client record. When set, `email` becomes
    # the login username, so it is required too (enforced in create_client).
    create_login: bool = False
    login_password: Optional[str] = None

    @field_validator("login_password")
    @classmethod
    def login_password_rules(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        return validate_password_strength(v)

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
    # Tightened on input only; the Response model keeps the base's plain str.
    # 100 to match mainContractorSchema in frontend/lib/validation.ts.
    name: CompanyNameStr


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
    # Tightened on input only; the Response model keeps the base's plain str.
    name: CompanyNameStr


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


class EmailTestRequest(BaseModel):
    to_email: str
    subject: Optional[str] = None
    body: Optional[str] = None


class EmailConfigResponse(BaseModel):
    smtp_configured: bool
    mail_server: Optional[str] = None
    mail_port: Optional[int] = None
    mail_username: Optional[str] = None
    password_set: bool = False
    mail_from: Optional[str] = None
    mail_from_name: Optional[str] = None
    templates: dict[str, str] = Field(default_factory=dict)
    enabled: bool = True


class EmailConfigUpdate(BaseModel):
    templates: Optional[dict[str, str]] = None
    mail_server: Optional[str] = None
    mail_port: Optional[int] = None
    mail_username: Optional[str] = None
    mail_password: Optional[str] = None
    mail_from: Optional[str] = None
    mail_from_name: Optional[str] = None


class EmailLogResponse(BaseModel):
    id: int
    recipient: str
    subject: Optional[str] = None
    template_key: Optional[str] = None
    status: str
    sent_at: datetime

    class Config:
        from_attributes = True


class SmtpConfigResponse(BaseModel):
    mail_server: str
    mail_port: int
    mail_from: str
    mail_from_name: str
    username_set: bool
    password_set: bool
    configured: bool


class SmtpConfigUpdate(BaseModel):
    mail_server: Optional[str] = None
    mail_port: Optional[int] = None
    mail_username: Optional[str] = None
    mail_password: Optional[str] = None
    mail_from: Optional[str] = None
    mail_from_name: Optional[str] = None

class GuardDocumentBase(BaseModel):
    document_type: str
    file_path: Optional[str] = None
    file_name: Optional[str] = None
    expiry_date: Optional[date] = None

class GuardDocumentCreate(GuardDocumentBase):
    # Tightened on input only; GuardDocumentResponse keeps the base's plain str.
    document_type: RequiredShortTextStr

class GuardDocumentCreateFlat(GuardDocumentBase):
    guard_id: int
    document_type: RequiredShortTextStr

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
    # Tightened on input only; AllowanceResponse keeps the base's plain str.
    # 255: this field uses the UI's default input cap, so anything lower would reject
    # values the form allows.
    name: RequiredShortTextStr

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
    note: Optional[str] = None

class AttendanceCreate(AttendanceBase):
    pass

class AttendanceUpdate(BaseModel):
    booked_at: Optional[datetime] = None
    booked_off_at: Optional[datetime] = None
    status: Optional[str] = None
    note: Optional[str] = None

class AttendanceResponse(AttendanceBase):
    id: int
    created_at: datetime
    updated_at: Optional[datetime] = None
    updated_by_user_id: Optional[int] = None
    updated_by_name: Optional[str] = None

    class Config:
        from_attributes = True


class AttendanceByShiftRequest(BaseModel):
    guard_id: int
    date: date
    shift_start: str
    site_name: str = ""
    status: str
    note: Optional[str] = ""
    hours: Optional[float] = None

    @field_validator("hours", mode="before")
    @classmethod
    def coerce_hours(cls, v):
        if v is None or v == "":
            return None
        try:
            return float(v)
        except (TypeError, ValueError):
            return None

    @field_validator("note")
    @classmethod
    def note_strip(cls, v: Optional[str]) -> str:
        return (v or "").strip()


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

class PayrollUpdate(BaseModel):
    period_start: Optional[date] = None
    period_end: Optional[date] = None
    total_hours: Optional[float] = None
    hourly_rate: Optional[float] = None
    bank_amount: Optional[float] = None
    cash_amount: Optional[float] = None
    allowance_total: Optional[float] = None
    payment_mode: Optional[str] = None

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
    tax_rate: float = 20
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
    company_registration_number: Optional[str] = None
    company_vat_number: Optional[str] = None
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
    amount: float = Field(..., gt=0, le=99_999_999.99)
    method: Optional[str] = None
    paid_at: Optional[datetime] = None

class PaymentCreate(PaymentBase):
    pass

class PaymentUpdate(BaseModel):
    invoice_id: Optional[int] = None
    amount: Optional[float] = Field(None, gt=0, le=99_999_999.99)
    method: Optional[str] = None
    paid_at: Optional[datetime] = None

class PaymentResponse(PaymentBase):
    id: int
    company_id: int
    created_at: datetime

    class Config:
        from_attributes = True


InvoiceResponse.model_rebuild()


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


class RoleCreate(StrictModel):
    name: NameStr
    matrix: dict[str, Any]


class RoleUpdate(StrictModel):
    name: Optional[NameStr] = None
    matrix: Optional[dict[str, Any]] = None


class AppModuleActionOut(BaseModel):
    """One tickable permission on a module row in Roles & Permissions."""

    key: str
    label: str
    parent: Optional[str] = None


class AppModuleOut(BaseModel):
    id: int
    key: str
    name: str
    icon: str
    sidebar_path: str
    sidebar_order: int
    section_key: str
    is_active: bool
    actions: List[AppModuleActionOut] = Field(default_factory=list)


class AppModuleCreate(StrictModel):
    key: str = Field(min_length=2, max_length=64)
    name: str = Field(min_length=2, max_length=120)
    icon: str = Field(default="LayoutDashboard", max_length=64)
    sidebar_path: str = Field(min_length=1, max_length=200)
    sidebar_order: int = 0
    section_key: str = Field(default="sectionOperations", max_length=64)


class AppModuleUpdate(StrictModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    icon: Optional[str] = Field(default=None, max_length=64)
    sidebar_path: Optional[str] = Field(default=None, max_length=200)
    sidebar_order: Optional[int] = None
    section_key: Optional[str] = Field(default=None, max_length=64)
    is_active: Optional[bool] = None


class CompanyUserOut(BaseModel):
    id: int
    email: EmailStr
    full_name: str
    role_id: Optional[int] = None
    role_slug: Optional[str] = None
    role_name: Optional[str] = None
    client_id: Optional[int] = None
    guard_id: Optional[int] = None
    # Empty means the login is not pinned: a Client-role user then sees every site of
    # its client. Populated means it is restricted to exactly these sites.
    site_ids: list[int] = []


class UserRolePatch(StrictModel):
    role_id: int


class CompanyUserCreate(StrictModel):
    email: EmailStr = Field(max_length=EMAIL_MAX)
    password: str
    full_name: str = Field(min_length=2, max_length=100)
    role_id: int
    client_id: Optional[int] = None
    guard_id: Optional[int] = None
    # Restricts the login to these sites. Omitted or empty leaves it unpinned, i.e. a
    # Client-role user sees every site of its client — the behaviour before pins existed.
    site_ids: Optional[list[int]] = None

    @field_validator("password")
    @classmethod
    def password_rules(cls, v: str) -> str:
        return validate_password_strength(v)


class CompanyUserUpdate(StrictModel):
    email: Optional[EmailStr] = Field(default=None, max_length=EMAIL_MAX)
    full_name: Optional[str] = Field(default=None, min_length=2, max_length=100)
    password: Optional[str] = None
    role_id: Optional[int] = None
    client_id: Optional[int] = None
    guard_id: Optional[int] = None
    # None leaves existing pins alone; [] clears them back to client-wide access.
    site_ids: Optional[list[int]] = None

    @field_validator("password")
    @classmethod
    def password_rules(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == "":
            return None
        return validate_password_strength(v)


class CompanyUserResetPassword(StrictModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_rules(cls, v: str) -> str:
        return validate_password_strength(v)


class PortalLoginCreate(StrictModel):
    """Provision a portal login for a record that does not have one yet."""

    # Optional: falls back to the record's own email when omitted.
    email: Optional[EmailStr] = Field(default=None, max_length=EMAIL_MAX)
    password: str

    @field_validator("password")
    @classmethod
    def password_rules(cls, v: str) -> str:
        return validate_password_strength(v)


class PortalLoginOut(BaseModel):
    """A portal login attached to a client or a site, as shown on their edit screens."""

    id: int
    email: str
    full_name: str = ""
    role_name: str = ""
    is_active: bool = True
    # Sites this login is pinned to; empty means it is not pinned to any.
    site_ids: List[int] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class StaffRequestCreate(BaseModel):
    client_id: Optional[int] = None
    site_id: int
    shift_date: date
    shift_start: str
    shift_end: str
    break_minutes: int = 30
    staff_count: int = Field(default=1, ge=1, le=50)
    client_notes: Optional[str] = None


class StaffRequestShiftItem(BaseModel):
    shift_date: date
    shift_start: Optional[str] = None
    shift_end: Optional[str] = None
    break_minutes: Optional[int] = Field(default=None, ge=0)
    staff_count: Optional[int] = Field(default=None, ge=1, le=50)


class StaffRequestBulkCreate(BaseModel):
    client_id: Optional[int] = None
    site_id: int
    shift_start: str
    shift_end: str
    break_minutes: int = 30
    staff_count: int = Field(default=1, ge=1, le=50)
    client_notes: Optional[str] = None
    shifts: list[StaffRequestShiftItem] = Field(min_length=1, max_length=31)


class StaffRequestReview(BaseModel):
    comment: Optional[str] = None


class PortalHoursResponse(BaseModel):
    period: str
    start_date: date
    end_date: date
    total_hours: float
    shifts_count: int
    # Staff only: what the logged-in guard earned over the period. None for client
    # logins, which must never see guard wages.
    total_pay: Optional[float] = None


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
    vat_exempt: bool = False
    payment_method: Optional[str] = None
    payment_status: Optional[str] = "pending"


class ExpenseCreate(ExpenseBase):
    # Tightened on input only; ExpenseResponse is a separate model already.
    category: RequiredShortTextStr


class ExpenseUpdate(BaseModel):
    expense_date: Optional[date] = None
    category: Optional[str] = None
    vendor_name: Optional[str] = None
    reference_number: Optional[str] = None
    description: Optional[str] = None
    amount_ex_vat: Optional[float] = None
    vat_exempt: Optional[bool] = None
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
    vat_exempt: bool = False
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
    issued_invoice_count: int = 0
    net_vat_summary: float
    total_vat_report: dict
    expense_totals: dict


class ExpenseDashboardResponse(BaseModel):
    period_start: date
    period_end: date
    total_expenses_ex_vat: float
    total_expense_vat: float
    total_invoice_vat: float
    issued_invoice_count: int = 0
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
    monthly_trends: List[dict] = Field(default_factory=list)
    subscription_trend: List[dict] = Field(default_factory=list)


class ShiftHistoryChange(BaseModel):
    field: str
    label: str
    from_value: Optional[Any] = Field(default=None, alias="from")
    to_value: Optional[Any] = Field(default=None, alias="to")

    model_config = ConfigDict(populate_by_name=True)


class ShiftHistoryRow(BaseModel):
    """One immutable audit entry from the Shift History report."""

    id: int
    shift_ref: str = ""
    assignment_id: Optional[int] = None
    rota_plan_id: Optional[int] = None
    rota_name: str = ""
    site_id: Optional[int] = None
    site: str = ""
    guard_id: Optional[int] = None
    guard: str = ""
    shift_date: str = ""
    action: str
    action_label: str = ""
    summary: str = ""
    changes: List[ShiftHistoryChange] = Field(default_factory=list)
    previous_values: str = ""
    new_values: str = ""
    source: str = ""
    user_id: Optional[int] = None
    user: str = ""
    user_email: str = ""
    user_role: str = ""
    action_date: str = ""
    action_time: str = ""
    created_at: str = ""


class SubscriptionReportSummary(BaseModel):
    subscription_tier: Optional[str] = None
    subscription_status: Optional[str] = None
    billing_cycle: str = "monthly"
    subscription_end: Optional[str] = None
    days_until_expiry: Optional[int] = None
    is_active: bool = False
    is_expiring: bool = False
    invoice_count: int = 0
    total_billed: float = 0
    total_paid: float = 0
    outstanding: float = 0


class UsageSummaryResponse(BaseModel):
    period_start: date
    period_end: date
    sms_sent: int = 0
    emails_sent: int = 0
    successful_logins: int = 0
    api_requests: int = 0
    active_users: int = 0
    storage_mb: float = 0


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


class ShiftOvertimeRequest(BaseModel):
    new_end: str
    reason: RequiredShortTextStr


class ShiftEarlyFinishRequest(BaseModel):
    actual_end: str
    reason: RequiredShortTextStr


class ShiftAdjustmentByShiftRequest(BaseModel):
    guard_id: int
    date: date
    shift_start: str
    # A lookup key, not a new name: capped generously so a site saved before
    # SITE_NAME_MAX existed can still be matched, but never blank.
    site_name: RequiredShortTextStr
    new_end: Optional[str] = None
    actual_end: Optional[str] = None
    reason: RequiredShortTextStr


class ShiftAdjustmentLogResponse(BaseModel):
    id: int
    assignment_id: Optional[int] = None
    guard_id: int
    site_id: Optional[int] = None
    shift_date: date
    shift_start: Optional[str] = None
    scheduled_end: str
    reason: str
    recorded_by: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ShiftOvertimeLogResponse(ShiftAdjustmentLogResponse):
    new_end: str


class ShiftEarlyFinishLogResponse(ShiftAdjustmentLogResponse):
    actual_end: str


class ShiftLatenessRequest(BaseModel):
    late_minutes: int
    scheduled_start: Optional[str] = None
    note: Optional[str] = None


class ShiftLatenessByShiftRequest(BaseModel):
    guard_id: int
    date: date
    shift_start: str
    # A lookup key — see ShiftAdjustmentByShiftRequest.site_name.
    site_name: RequiredShortTextStr
    late_minutes: int
    note: OptNoteStr = None


class ShiftLateLogResponse(BaseModel):
    id: int
    assignment_id: Optional[int] = None
    guard_id: int
    site_id: Optional[int] = None
    shift_date: date
    scheduled_start: str
    actual_start: str
    late_minutes: int
    note: Optional[str] = None
    recorded_by: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LeadCreate(BaseModel):
    title: Optional[str] = None
    organization: Optional[str] = None
    contact_name: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    email_secondary: Optional[str] = None
    phone: Optional[str] = None
    phone_secondary: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None
    comments: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = "new"
    priority: Optional[str] = "moderate"
    estimated_value: Optional[float] = 0
    assigned_user_id: Optional[int] = None
    next_follow_up_at: Optional[datetime] = None
    meeting_at: Optional[datetime] = None
    force_duplicate: Optional[bool] = False


class LeadUpdate(BaseModel):
    title: Optional[str] = None
    organization: Optional[str] = None
    contact_name: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    email_secondary: Optional[str] = None
    phone: Optional[str] = None
    phone_secondary: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None
    comments: Optional[str] = None
    source: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    estimated_value: Optional[float] = None
    assigned_user_id: Optional[int] = None
    next_follow_up_at: Optional[datetime] = None
    meeting_at: Optional[datetime] = None
    force_duplicate: Optional[bool] = False


class LeadStatusChange(BaseModel):
    status: str
    note: Optional[str] = None


class LeadNoteCreate(BaseModel):
    body: RequiredNoteStr


class LeadFollowUpCreate(BaseModel):
    activity_type: RequiredShortTextStr
    title: OptShortTextStr = None
    due_at: datetime
    assigned_user_id: Optional[int] = None
    notes: OptNoteStr = None


class LeadCommunicationCreate(BaseModel):
    channel: RequiredShortTextStr
    subject: OptShortTextStr = None
    body: OptNoteStr = None


class LeadQuotationCreate(BaseModel):
    title: RequiredShortTextStr
    amount: Optional[float] = 0
    status: OptShortTextStr = "draft"
    notes: OptNoteStr = None


class LeadDocumentResponse(BaseModel):
    """Deliberately omits file_path — that is an absolute path on the server."""

    id: int
    lead_id: int
    file_name: str
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LeadQuotationResponse(BaseModel):
    id: int
    lead_id: int
    title: str
    amount: Optional[float] = 0
    status: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class LeadConvertRequest(BaseModel):
    target_type: str
    note: Optional[str] = None


class LeadFilterPresetCreate(BaseModel):
    name: RequiredShortTextStr
    filters: dict


class LeadDuplicateCheck(BaseModel):
    email: Optional[str] = None
    phone: Optional[str] = None
    exclude_id: Optional[int] = None


class LeadCustomStatusCreate(BaseModel):
    name: RequiredShortTextStr


class LeadResponse(BaseModel):
    id: int
    company_id: int
    title: str
    organization: Optional[str] = None
    contact_name: Optional[str] = None
    designation: Optional[str] = None
    email: Optional[str] = None
    email_secondary: Optional[str] = None
    phone: Optional[str] = None
    phone_secondary: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    postcode: Optional[str] = None
    comments: Optional[str] = None
    source: Optional[str] = None
    status: str
    priority: Optional[str] = None
    estimated_value: Optional[float] = 0
    assigned_user_id: Optional[int] = None
    created_by: Optional[int] = None
    converted: bool = False
    converted_at: Optional[datetime] = None
    converted_to_type: Optional[str] = None
    converted_to_id: Optional[int] = None
    next_follow_up_at: Optional[datetime] = None
    meeting_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LeadNoteResponse(BaseModel):
    id: int
    lead_id: int
    user_id: Optional[int] = None
    body: str
    created_at: datetime

    class Config:
        from_attributes = True


class LeadFollowUpResponse(BaseModel):
    id: int
    lead_id: int
    activity_type: str
    title: Optional[str] = None
    due_at: datetime
    completed_at: Optional[datetime] = None
    assigned_user_id: Optional[int] = None
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LeadCommunicationResponse(BaseModel):
    id: int
    lead_id: int
    channel: str
    subject: Optional[str] = None
    body: Optional[str] = None
    user_id: Optional[int] = None
    created_at: datetime

    class Config:
        from_attributes = True


class LeadConversionResponse(BaseModel):
    id: int
    lead_id: int
    target_type: str
    target_id: int
    user_id: Optional[int] = None
    note: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AppNotificationResponse(BaseModel):
    id: int
    kind: str
    title: str
    body: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[int] = None
    read_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class PushSubscribeRequest(BaseModel):
    endpoint: str
    p256dh: str
    auth: str


# --- Patrol ---

class PatrolRouteCreate(BaseModel):
    site_id: int
    name: str = Field(min_length=2, max_length=120)
    frequency_minutes: int = Field(default=60, ge=5, le=24 * 60)
    start_time: str = "22:00"
    end_time: str = "06:00"
    status: str = "active"


class PatrolRouteUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    frequency_minutes: Optional[int] = Field(default=None, ge=5, le=24 * 60)
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    status: Optional[str] = None


class PatrolCheckpointCreate(BaseModel):
    route_id: int
    name: str = Field(min_length=1, max_length=120)
    floor: Optional[str] = None
    description: Optional[str] = None
    latitude: float
    longitude: float
    radius_m: float = Field(default=20, ge=5, le=500)
    sort_order: int = 0
    status: str = "active"


class PatrolCheckpointUpdate(BaseModel):
    name: Optional[str] = None
    floor: Optional[str] = None
    description: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_m: Optional[float] = Field(default=None, ge=5, le=500)
    sort_order: Optional[int] = None
    status: Optional[str] = None


class PatrolCheckpointResponse(BaseModel):
    id: int
    company_id: int
    site_id: int
    route_id: int
    code: str
    name: str
    floor: Optional[str] = None
    description: Optional[str] = None
    qr_token: str
    qr_url: str
    latitude: float
    longitude: float
    radius_m: float
    sort_order: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


class PatrolRouteResponse(BaseModel):
    id: int
    company_id: int
    site_id: int
    site_name: Optional[str] = None
    name: str
    frequency_minutes: int
    start_time: str
    end_time: str
    status: str
    checkpoint_count: int = 0
    created_at: datetime
    checkpoints: list[PatrolCheckpointResponse] = []

    class Config:
        from_attributes = True


class PatrolSessionStart(BaseModel):
    route_id: int
    assignment_id: Optional[int] = None
    guard_id: Optional[int] = None


class PatrolSessionResponse(BaseModel):
    id: int
    company_id: int
    guard_id: int
    route_id: int
    assignment_id: Optional[int] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    status: str

    class Config:
        from_attributes = True


class PatrolScanRequest(BaseModel):
    qr_token: str
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    device_id: Optional[str] = None
    session_id: Optional[int] = None
    assignment_id: Optional[int] = None
    guard_id: Optional[int] = None
    photo: Optional[str] = None


class PatrolLogResponse(BaseModel):
    id: int
    company_id: int
    guard_id: int
    guard_name: Optional[str] = None
    checkpoint_id: int
    checkpoint_name: Optional[str] = None
    checkpoint_code: Optional[str] = None
    route_id: int
    route_name: Optional[str] = None
    session_id: Optional[int] = None
    assignment_id: Optional[int] = None
    scan_time: datetime
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    device_id: Optional[str] = None
    photo_url: Optional[str] = None
    distance_m: Optional[float] = None
    status: str
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class PatrolComplianceRow(BaseModel):
    site_id: int
    site_name: str
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    route_id: int
    route_name: str
    guard_id: Optional[int] = None
    guard_name: Optional[str] = None
    date: date
    required_patrols: int
    completed: int
    missed: int
    late: int
    compliance_pct: float


class PatrolTodayResponse(BaseModel):
    session: Optional[PatrolSessionResponse] = None
    route_id: Optional[int] = None
    route_name: Optional[str] = None
    site_name: Optional[str] = None
    next_checkpoint: Optional[PatrolCheckpointResponse] = None
    due_at: Optional[str] = None
    recent_logs: list[PatrolLogResponse] = []


# --- Incidents ---

class IncidentCreate(BaseModel):
    notes: str = Field(min_length=1, max_length=5000)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    occurred_at: Optional[datetime] = None
    site_id: Optional[int] = None
    client_id: Optional[int] = None
    assignment_id: Optional[int] = None
    guard_id: Optional[int] = None


class IncidentUpdate(BaseModel):
    notes: Optional[str] = None
    status: Optional[str] = None
    site_id: Optional[int] = None


class IncidentAttachmentResponse(BaseModel):
    id: int
    file_path: str
    mime_type: Optional[str] = None
    url: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class IncidentResponse(BaseModel):
    id: int
    company_id: int
    client_id: Optional[int] = None
    client_name: Optional[str] = None
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    reported_by_user_id: int
    reported_by_name: Optional[str] = None
    guard_id: Optional[int] = None
    assignment_id: Optional[int] = None
    notes: str
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    occurred_at: datetime
    status: str
    created_at: datetime
    attachments: list[IncidentAttachmentResponse] = []

    class Config:
        from_attributes = True


class IncidentSummaryRow(BaseModel):
    status: str
    count: int
    site_id: Optional[int] = None
    site_name: Optional[str] = None


# --- Lone worker / check calls -------------------------------------------------------


class LoneWorkerContactIn(BaseModel):
    level: int = Field(ge=1, le=9)
    user_id: Optional[int] = None
    name: Optional[str] = Field(default=None, max_length=120)
    email: Optional[str] = Field(default=None, max_length=EMAIL_MAX)
    phone: Optional[str] = Field(default=None, max_length=40)


class LoneWorkerContactResponse(LoneWorkerContactIn):
    id: int
    policy_id: int

    model_config = ConfigDict(from_attributes=True)


class LoneWorkerPolicyCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    site_id: Optional[int] = None
    check_in_minutes: int = Field(default=60, ge=1, le=24 * 60)
    reminder_minutes: int = Field(default=5, ge=0, le=120)
    grace_minutes: int = Field(default=5, ge=0, le=120)
    escalation_interval_minutes: int = Field(default=5, ge=1, le=120)
    require_location: bool = False
    status: str = "active"
    contacts: List[LoneWorkerContactIn] = Field(default_factory=list)


class LoneWorkerPolicyUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=120)
    site_id: Optional[int] = None
    check_in_minutes: Optional[int] = Field(default=None, ge=1, le=24 * 60)
    reminder_minutes: Optional[int] = Field(default=None, ge=0, le=120)
    grace_minutes: Optional[int] = Field(default=None, ge=0, le=120)
    escalation_interval_minutes: Optional[int] = Field(default=None, ge=1, le=120)
    require_location: Optional[bool] = None
    status: Optional[str] = None
    # When supplied the ladder is replaced wholesale; omit it to leave contacts alone.
    contacts: Optional[List[LoneWorkerContactIn]] = None


class LoneWorkerPolicyResponse(BaseModel):
    id: int
    company_id: int
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    name: str
    check_in_minutes: int
    reminder_minutes: int
    grace_minutes: int
    escalation_interval_minutes: int
    require_location: bool = False
    status: str
    contacts: List[LoneWorkerContactResponse] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class LoneWorkerSessionStart(BaseModel):
    site_id: Optional[int] = None
    guard_id: Optional[int] = None
    policy_id: Optional[int] = None
    assignment_id: Optional[int] = None
    location_note: Optional[str] = Field(default=None, max_length=200)
    expected_end_at: Optional[datetime] = None
    # Overrides the policy for this session only; the monitoring rules are then frozen.
    check_in_minutes: Optional[int] = Field(default=None, ge=1, le=24 * 60)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    device_id: Optional[str] = Field(default=None, max_length=120)


class LoneWorkerCheckIn(BaseModel):
    """I'M SAFE. `check_id` is optional — the open check is used when it is omitted."""

    session_id: Optional[int] = None
    check_id: Optional[int] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None
    note: Optional[str] = Field(default=None, max_length=500)


class LoneWorkerAlarmRequest(BaseModel):
    """I NEED ASSISTANCE / SOS."""

    session_id: Optional[int] = None
    kind: str = "sos"
    notes: Optional[str] = Field(default=None, max_length=500)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None


class LoneWorkerSessionEnd(BaseModel):
    session_id: Optional[int] = None
    confirm_safe: bool = True
    note: Optional[str] = Field(default=None, max_length=500)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy: Optional[float] = None


class LoneWorkerCheckResponse(BaseModel):
    id: int
    session_id: int
    sequence: int
    due_at: datetime
    reminder_sent_at: Optional[datetime] = None
    responded_at: Optional[datetime] = None
    status: str

    model_config = ConfigDict(from_attributes=True)


class LoneWorkerSessionResponse(BaseModel):
    id: int
    company_id: int
    guard_id: int
    guard_name: Optional[str] = None
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    policy_id: Optional[int] = None
    location_note: Optional[str] = None
    check_in_minutes: int
    reminder_minutes: int
    grace_minutes: int
    started_at: Optional[datetime] = None
    expected_end_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    last_check_in_at: Optional[datetime] = None
    status: str
    source: Optional[str] = None
    # Derived live state, the thing the mobile timer and the monitor board render.
    display_status: str = "SESSION ACTIVE"
    next_check_due_at: Optional[datetime] = None
    seconds_to_next_check: Optional[int] = None
    open_incident_id: Optional[int] = None
    open_incident_kind: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class LoneWorkerIncidentResponse(BaseModel):
    id: int
    company_id: int
    session_id: Optional[int] = None
    check_id: Optional[int] = None
    guard_id: Optional[int] = None
    guard_name: Optional[str] = None
    site_id: Optional[int] = None
    site_name: Optional[str] = None
    guard_phone: Optional[str] = None
    kind: str
    status: str
    escalation_level: int = 0
    opened_at: Optional[datetime] = None
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolution: Optional[str] = None
    notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    display_status: str = "ESCALATING"

    model_config = ConfigDict(from_attributes=True)


class LoneWorkerIncidentAction(BaseModel):
    notes: Optional[str] = Field(default=None, max_length=1000)


class LoneWorkerResolveRequest(BaseModel):
    # safe | incident | emergency
    resolution: str = "safe"
    notes: Optional[str] = Field(default=None, max_length=1000)


class LoneWorkerContactAttempt(BaseModel):
    """Supervisor logging that they tried to reach the worker."""

    method: str = "call"
    outcome: Optional[str] = Field(default=None, max_length=200)


class LoneWorkerEventResponse(BaseModel):
    id: int
    session_id: Optional[int] = None
    incident_id: Optional[int] = None
    guard_id: Optional[int] = None
    guard: str = ""
    site: str = ""
    event_type: str
    event_label: str = ""
    message: str = ""
    escalation_level: Optional[int] = None
    channel: Optional[str] = None
    recipient: Optional[str] = None
    user: str = ""
    source: str = ""
    event_date: str = ""
    event_time: str = ""
    created_at: str = ""
