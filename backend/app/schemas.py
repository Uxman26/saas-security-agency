from pydantic import BaseModel, EmailStr
from datetime import date, datetime
from typing import Optional

class UserBase(BaseModel):
    email: EmailStr
    full_name: str

class UserCreate(UserBase):
    password: str
    company_name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(UserBase):
    id: int
    role: Optional[str] = None
    company_id: Optional[int] = None
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

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

class SubContractorBase(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    contact_person: Optional[str] = None
    license_number: Optional[str] = None

class SubContractorCreate(SubContractorBase):
    pass

class SubContractorResponse(SubContractorBase):
    id: int
    company_id: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class EmailRequest(BaseModel):
    to_email: str
    subject: str
    body: str

class GuardDocumentBase(BaseModel):
    document_type: str
    file_path: str
    expiry_date: Optional[date] = None

class GuardDocumentCreate(GuardDocumentBase):
    pass

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

    class Config:
        from_attributes = True

class InvoiceBase(BaseModel):
    client_id: int
    period_start: date
    period_end: date
    total: Optional[float] = 0
    status: Optional[str] = "draft"

class InvoiceCreate(InvoiceBase):
    pass

class InvoiceResponse(InvoiceBase):
    id: int
    company_id: int
    pdf_path: Optional[str] = None
    created_at: datetime
    lines: list[InvoiceLineResponse] = []

    class Config:
        from_attributes = True

class PaymentBase(BaseModel):
    invoice_id: int
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

class ComplianceAlert(BaseModel):
    guard_id: int
    guard_name: str
    document_type: str
    expiry_date: date
