import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, ForeignKey, Date, DateTime, Boolean, Float, Text, UniqueConstraint, Enum, Uuid
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


def _utcnow():
    return datetime.now(timezone.utc)


class ContractorKind(str, enum.Enum):
    main = "main"
    sub = "sub"


class Role(Base):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("company_id", "slug", name="uq_roles_company_slug"),)
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)
    slug = Column(String, nullable=False)
    is_system = Column(Boolean, default=False)
    permissions_json = Column(Text, nullable=False, default="{}")
    company = relationship("Company", back_populates="roles")
    users = relationship("User", back_populates="role_row")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="company_admin")
    role_id = Column(Integer, ForeignKey("roles.id"), nullable=True)
    is_active = Column(Boolean, default=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="users", foreign_keys=[company_id])
    admin_company = relationship("Company", back_populates="admin", uselist=False, foreign_keys="Company.admin_id")
    role_row = relationship("Role", back_populates="users", foreign_keys=[role_id])

class Company(Base):
    __tablename__ = "companies"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    admin_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    subscription_tier = Column(String, default="basic")
    stripe_customer_id = Column(String)
    logo_path = Column(String)
    contract_expiry_alert_sent_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    admin = relationship("User", back_populates="admin_company", foreign_keys=[admin_id])
    users = relationship("User", back_populates="company", foreign_keys="User.company_id")
    roles = relationship("Role", back_populates="company", cascade="all, delete-orphan")
    guards = relationship("Guard", back_populates="company", cascade="all, delete-orphan")
    sites = relationship("Site", back_populates="company", cascade="all, delete-orphan")
    clients = relationship("Client", back_populates="company", cascade="all, delete-orphan")
    main_contractors = relationship("MainContractor", back_populates="company", cascade="all, delete-orphan")
    sub_contractors = relationship("SubContractor", back_populates="company", cascade="all, delete-orphan")
    allowances = relationship("Allowance", back_populates="company", cascade="all, delete-orphan")
    payrolls = relationship("Payroll", back_populates="company", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="company", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="company", cascade="all, delete-orphan")
    special_days = relationship("SpecialDay", back_populates="company", cascade="all, delete-orphan")
    directory_contractors = relationship("Contractor", back_populates="company", cascade="all, delete-orphan")

class Contractor(Base):
    __tablename__ = "contractors"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    type = Column(Enum(ContractorKind, values_callable=lambda x: [e.value for e in x], native_enum=False), nullable=False)
    contact_email = Column(String)
    contact_phone = Column(String)
    address = Column(String)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), default=_utcnow)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), default=_utcnow, onupdate=_utcnow)
    company = relationship("Company", back_populates="directory_contractors")
    assignments_as_main = relationship(
        "ContractorAssignment",
        foreign_keys="ContractorAssignment.main_contractor_id",
        back_populates="main_contractor",
        cascade="all, delete-orphan",
    )
    assignments_as_sub = relationship(
        "ContractorAssignment",
        foreign_keys="ContractorAssignment.sub_contractor_id",
        back_populates="sub_contractor",
        cascade="all, delete-orphan",
    )
    guards = relationship("Guard", back_populates="contractor")
    sites = relationship("Site", back_populates="contractor")


class ContractorAssignment(Base):
    __tablename__ = "contractor_assignments"
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "main_contractor_id",
            "sub_contractor_id",
            "site_id",
            name="uq_contractor_assignment_company_main_sub_site",
        ),
    )
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    main_contractor_id = Column(Uuid(as_uuid=True), ForeignKey("contractors.id"), nullable=False)
    sub_contractor_id = Column(Uuid(as_uuid=True), ForeignKey("contractors.id"), nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"))
    start_date = Column(Date)
    end_date = Column(Date)
    notes = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company")
    main_contractor = relationship("Contractor", foreign_keys=[main_contractor_id], back_populates="assignments_as_main")
    sub_contractor = relationship("Contractor", foreign_keys=[sub_contractor_id], back_populates="assignments_as_sub")
    site = relationship("Site", back_populates="contractor_assignments")


class Guard(Base):
    __tablename__ = "guards"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    contractor_id = Column(Uuid(as_uuid=True), ForeignKey("contractors.id"))
    main_contractor_id = Column(Integer, ForeignKey("main_contractors.id"))
    sub_contractor_id = Column(Integer, ForeignKey("sub_contractors.id"))
    full_name = Column(String, nullable=False)
    title = Column(String)
    first_name = Column(String)
    middle_name = Column(String)
    last_name = Column(String)
    gender = Column(String)
    ethnicity = Column(String)
    date_of_birth = Column(Date)
    email = Column(String)
    phone = Column(String)
    work_phone = Column(String)
    job_title = Column(String)
    employment_start_date = Column(Date)
    probation_end_date = Column(Date)
    address_line_1 = Column(String)
    address_line_2 = Column(String)
    address_line_3 = Column(String)
    town_city = Column(String)
    county = Column(String)
    postcode = Column(String)
    emergency_first_name = Column(String)
    emergency_last_name = Column(String)
    emergency_mobile = Column(String)
    emergency_home_phone = Column(String)
    emergency_work_phone = Column(String)
    emergency_relationship = Column(String)
    emergency_address_line_1 = Column(String)
    emergency_address_line_2 = Column(String)
    emergency_address_line_3 = Column(String)
    emergency_town_city = Column(String)
    emergency_county = Column(String)
    emergency_postcode = Column(String)
    bank_account_name = Column(String)
    bank_name = Column(String)
    bank_branch = Column(String)
    bank_account_number = Column(String)
    bank_sort_code = Column(String)
    tax_code = Column(String)
    ni_number = Column(String)
    passport_number = Column(String)
    passport_country = Column(String)
    passport_expiry_date = Column(Date)
    driving_licence_country = Column(String)
    driving_licence_class = Column(String)
    driving_licence_expiry_date = Column(Date)
    holiday_jurisdiction = Column(String)
    employee_type = Column(String)
    working_time_pattern = Column(String)
    company_full_time_week_hrs = Column(Integer)
    company_full_time_week_mins = Column(Integer)
    entitlement_unit = Column(String)
    contracted_week_hrs = Column(Integer)
    contracted_week_mins = Column(Integer)
    average_day_hrs = Column(Integer)
    average_day_mins = Column(Integer)
    annual_leave_equivalent_hrs = Column(Integer)
    annual_leave_equivalent_mins = Column(Integer)
    leave_year_start_day = Column(Integer)
    leave_year_start_month = Column(Integer)
    leave_entitlement_hrs = Column(Integer)
    leave_entitlement_mins = Column(Integer)
    leave_allowance_hrs = Column(Integer)
    leave_allowance_mins = Column(Integer)
    badge_number = Column(String, unique=True)
    license_number = Column(String)
    sia_number = Column(String)
    sia_expiry_date = Column(Date)
    visa_status = Column(String)
    rtw_status = Column(String)
    employment_history = Column(Text)
    address = Column(String)
    dbs_status = Column(String)
    weekly_contracted_hours = Column(Float, default=40.0)
    service_area = Column(String)
    nearby_areas = Column(String)
    has_car = Column(Boolean, default=False)
    available_days = Column(String)
    availability_timing = Column(String)
    pay_frequency = Column(String, default="weekly")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="guards")
    contractor = relationship("Contractor", foreign_keys=[contractor_id])
    main_contractor = relationship("MainContractor", back_populates="guards")
    sub_contractor = relationship("SubContractor", back_populates="guards")
    assignments = relationship("Assignment", back_populates="guard", cascade="all, delete-orphan")
    documents = relationship("GuardDocument", back_populates="guard", cascade="all, delete-orphan")
    rates = relationship("GuardRate", back_populates="guard", cascade="all, delete-orphan")
    attendances = relationship("Attendance", back_populates="guard", cascade="all, delete-orphan")
    payrolls = relationship("Payroll", back_populates="guard", cascade="all, delete-orphan")

class GuardDocument(Base):
    __tablename__ = "guard_documents"
    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False)
    document_type = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    expiry_date = Column(Date)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    guard = relationship("Guard", back_populates="documents")

class Client(Base):
    __tablename__ = "clients"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)
    email = Column(String)
    phone = Column(String)
    address = Column(String)
    contact_person = Column(String)
    double_rate_special_days = Column(Boolean, default=False)
    contract_start_date = Column(Date, nullable=True)
    contract_end_date = Column(Date, nullable=True)
    contract_expiry_alert_sent_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="clients")
    sites = relationship("Site", back_populates="client", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="client", cascade="all, delete-orphan")
    contract_renewals = relationship("ClientContractRenewal", back_populates="client", cascade="all, delete-orphan")

class ClientContractRenewal(Base):
    __tablename__ = "client_contract_renewals"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    previous_end_date = Column(Date, nullable=True)
    new_end_date = Column(Date, nullable=False)
    note = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    client = relationship("Client", back_populates="contract_renewals")
    company = relationship("Company")
    user = relationship("User")

class SpecialDay(Base):
    __tablename__ = "special_days"
    __table_args__ = (UniqueConstraint("company_id", "date", name="uq_special_days_company_date"),)
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    date = Column(Date, nullable=False)
    label = Column(String, nullable=False)
    company = relationship("Company", back_populates="special_days")

class Site(Base):
    __tablename__ = "sites"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    contractor_id = Column(Uuid(as_uuid=True), ForeignKey("contractors.id"))
    main_contractor_id = Column(Integer, ForeignKey("main_contractors.id"))
    sub_contractor_id = Column(Integer, ForeignKey("sub_contractors.id"))
    client_id = Column(Integer, ForeignKey("clients.id"))
    name = Column(String, nullable=False)
    address = Column(String)
    contact_person = Column(String)
    contact_phone = Column(String)
    default_hourly_rate = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="sites")
    contractor = relationship("Contractor", foreign_keys=[contractor_id])
    main_contractor = relationship("MainContractor", back_populates="sites")
    sub_contractor = relationship("SubContractor", back_populates="sites")
    client = relationship("Client", back_populates="sites")
    assignments = relationship("Assignment", back_populates="site", cascade="all, delete-orphan")
    contractor_assignments = relationship("ContractorAssignment", back_populates="site", cascade="all, delete-orphan")
    rates = relationship("SiteRate", back_populates="site", cascade="all, delete-orphan")
    invoice_lines = relationship("InvoiceLine", back_populates="site", cascade="all, delete-orphan")

class Assignment(Base):
    __tablename__ = "assignments"
    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    date = Column(Date, nullable=False)
    shift_start = Column(String)
    shift_end = Column(String)
    break_minutes = Column(Integer, default=0)
    shift_type = Column(String, default="day")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    guard = relationship("Guard", back_populates="assignments")
    site = relationship("Site", back_populates="assignments")
    attendances = relationship("Attendance", back_populates="assignment", cascade="all, delete-orphan")

class GuardRate(Base):
    __tablename__ = "guard_rates"
    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False)
    hourly_rate = Column(Float, nullable=False)
    effective_from = Column(Date, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    guard = relationship("Guard", back_populates="rates")

class SiteRate(Base):
    __tablename__ = "site_rates"
    id = Column(Integer, primary_key=True, index=True)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    shift_type = Column(String, default="day")
    hourly_rate = Column(Float, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    site = relationship("Site", back_populates="rates")

class Allowance(Base):
    __tablename__ = "allowances"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)
    allowance_type = Column(String, default="fixed")
    amount = Column(Float, nullable=False)
    in_payroll = Column(Boolean, default=True)
    in_invoice = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="allowances")

class Attendance(Base):
    __tablename__ = "attendance"
    id = Column(Integer, primary_key=True, index=True)
    assignment_id = Column(Integer, ForeignKey("assignments.id"), nullable=False)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False)
    booked_at = Column(DateTime(timezone=True))
    booked_off_at = Column(DateTime(timezone=True))
    status = Column(String, default="on_time")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    assignment = relationship("Assignment", back_populates="attendances")
    guard = relationship("Guard", back_populates="attendances")

class Payroll(Base):
    __tablename__ = "payroll"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    total_hours = Column(Float, default=0)
    hourly_rate = Column(Float, default=0)
    bank_amount = Column(Float, default=0)
    cash_amount = Column(Float, default=0)
    allowance_total = Column(Float, default=0)
    payment_mode = Column(String, default="100_bank")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="payrolls")
    guard = relationship("Guard", back_populates="payrolls")

class Invoice(Base):
    __tablename__ = "invoices"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    period_start = Column(Date, nullable=False)
    period_end = Column(Date, nullable=False)
    due_date = Column(Date)
    notes = Column(Text)
    subtotal = Column(Float, default=0)
    tax_rate = Column(Float, default=0)
    tax_amount = Column(Float, default=0)
    total = Column(Float, default=0)
    status = Column(String, default="draft")
    pdf_path = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="invoices")
    client = relationship("Client", back_populates="invoices")
    lines = relationship("InvoiceLine", back_populates="invoice", cascade="all, delete-orphan")
    payments = relationship("Payment", back_populates="invoice", cascade="all, delete-orphan")

class InvoiceLine(Base):
    __tablename__ = "invoice_lines"
    id = Column(Integer, primary_key=True, index=True)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    guard_id = Column(Integer, ForeignKey("guards.id"))
    hours = Column(Float, default=0)
    rate = Column(Float, default=0)
    amount = Column(Float, default=0)
    allowance_amount = Column(Float, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    invoice = relationship("Invoice", back_populates="lines")
    site = relationship("Site", back_populates="invoice_lines")
    guard = relationship("Guard")

class Payment(Base):
    __tablename__ = "payments"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    invoice_id = Column(Integer, ForeignKey("invoices.id"), nullable=False)
    amount = Column(Float, nullable=False)
    method = Column(String)
    paid_at = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="payments")
    invoice = relationship("Invoice", back_populates="payments")

class MainContractor(Base):
    __tablename__ = "main_contractors"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)
    contact_person = Column(String)
    phone = Column(String)
    email = Column(String)
    address = Column(String)
    registration_number = Column(String)
    contract_start_date = Column(Date)
    contract_end_date = Column(Date)
    status = Column(String, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="main_contractors")
    sub_contractors = relationship("SubContractor", back_populates="main_contractor")
    guards = relationship("Guard", back_populates="main_contractor")
    sites = relationship("Site", back_populates="main_contractor")


class SubContractor(Base):
    __tablename__ = "sub_contractors"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    main_contractor_id = Column(Integer, ForeignKey("main_contractors.id"))
    name = Column(String, nullable=False)
    email = Column(String)
    phone = Column(String)
    address = Column(String)
    contact_person = Column(String)
    license_number = Column(String)
    registration_number = Column(String)
    contract_start_date = Column(Date)
    contract_end_date = Column(Date)
    status = Column(String, default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="sub_contractors")
    main_contractor = relationship("MainContractor", back_populates="sub_contractors")
    guards = relationship("Guard", back_populates="sub_contractor")
    sites = relationship("Site", back_populates="sub_contractor")


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    action = Column(String, nullable=False)
    entity_type = Column(String, nullable=False)
    entity_id = Column(Integer)
    meta = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
