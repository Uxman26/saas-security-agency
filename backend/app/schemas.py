from pydantic import BaseModel, EmailStr, Field, model_validator
from datetime import date, datetime
from typing import Any, List, Optional

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

class UserResponse(UserBase):
    id: int
    role: Optional[str] = None
    role_id: Optional[int] = None
    company_id: Optional[int] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class UserMeResponse(UserResponse):
    permissions: List[str] = Field(default_factory=list)
    plan: Optional[dict[str, Any]] = None

class CompanyBase(BaseModel):
    name: str

class CompanyResponse(CompanyBase):
    id: int
    admin_id: int
    subscription_tier: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class GuardBase(BaseModel):
    full_name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    badge_number: Optional[str] = None
    license_number: Optional[str] = None
    sia_number: Optional[str] = None
    sia_expiry_date: Optional[date] = None
    visa_status: Optional[str] = None
    rtw_status: Optional[str] = None
    employment_history: Optional[str] = None
    address: Optional[str] = None
    dbs_status: Optional[str] = None
    main_contractor_id: Optional[int] = None
    sub_contractor_id: Optional[int] = None
    weekly_contracted_hours: Optional[float] = 40.0

class GuardCreate(GuardBase):
    pass

class GuardResponse(GuardBase):
    id: int
    company_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class SiteBase(BaseModel):
    name: str
    client_id: Optional[int] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    contact_phone: Optional[str] = None
    default_hourly_rate: Optional[float] = None
    main_contractor_id: Optional[int] = None
    sub_contractor_id: Optional[int] = None

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

class AssignmentCreate(AssignmentBase):
    pass

class AssignmentResponse(AssignmentBase):
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

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
    contact_person: Optional[str] = None

class ClientCreate(ClientBase):
    pass

class ClientResponse(ClientBase):
    id: int
    company_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class MainContractorBase(BaseModel):
    name: str
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    address: Optional[str] = None
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
    lines: list[InvoiceLineResponse] = []

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

class SubscriptionUpdate(BaseModel):
    subscription_tier: str

class DashboardStats(BaseModel):
    active_guards: int
    expiring_documents: int
    revenue_total: float
    late_count: int
    upcoming_shifts: int
    main_contractors_total: int = 0
    main_contractors_active: int = 0
    sub_contractors_total: int = 0
    sub_contractors_active: int = 0

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
