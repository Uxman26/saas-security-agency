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
    email_verified = Column(Boolean, default=False)
    auth_provider = Column(String, default="local")
    company_id = Column(Integer, ForeignKey("companies.id"))
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=True)
    sidebar_modules_json = Column(Text, nullable=True)
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
    subscription_status = Column(String, default="pending")
    subscription_start = Column(DateTime(timezone=True))
    subscription_end = Column(DateTime(timezone=True))
    billing_cycle = Column(String, default="monthly")
    max_users = Column(Integer)
    enabled_modules_json = Column(Text)
    stripe_customer_id = Column(String)
    stripe_subscription_id = Column(String)
    stripe_connect_account_id = Column(String)
    logo_path = Column(String)
    account_name = Column(String)
    bank_name = Column(String)
    sort_code = Column(String)
    account_number = Column(String)
    iban = Column(String)
    swift_code = Column(String)
    email = Column(String)
    phone = Column(String)
    address = Column(String)
    postcode = Column(String)
    registration_number = Column(String)
    vat_number = Column(String)
    email_templates_json = Column(Text)
    smtp_server = Column(String)
    smtp_port = Column(Integer, default=587)
    smtp_username = Column(String)
    smtp_password = Column(String)
    twilio_account_sid = Column(String)
    twilio_auth_token = Column(String)
    twilio_phone_number = Column(String)
    sms_templates_json = Column(Text)
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
    rota_plans = relationship("RotaPlan", back_populates="company", cascade="all, delete-orphan")
    subscription_receipts = relationship("SubscriptionReceipt", back_populates="company", cascade="all, delete-orphan")
    subscription_invoices = relationship("SubscriptionInvoice", back_populates="company", cascade="all, delete-orphan")
    company_subscriptions = relationship("CompanySubscription", back_populates="company", cascade="all, delete-orphan")
    billing_receipts = relationship("BillingReceipt", back_populates="company", cascade="all, delete-orphan")
    staff_requests = relationship("StaffRequest", back_populates="company", cascade="all, delete-orphan")
    expenses = relationship("Expense", back_populates="company", cascade="all, delete-orphan")
    sms_logs = relationship("SmsLog", back_populates="company", cascade="all, delete-orphan")
    email_logs = relationship("EmailLog", back_populates="company", cascade="all, delete-orphan")
    api_usage_logs = relationship("ApiUsageLog", back_populates="company", cascade="all, delete-orphan")
    leads = relationship("Lead", back_populates="company", cascade="all, delete-orphan")


class SmsLog(Base):
    __tablename__ = "sms_logs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    recipient = Column(String, nullable=False)
    body = Column(Text, nullable=False)
    template_key = Column(String)
    status = Column(String, default="sent")
    error_message = Column(String)
    twilio_sid = Column(String)
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="sms_logs")


class EmailLog(Base):
    __tablename__ = "email_logs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    recipient = Column(String, nullable=False)
    subject = Column(String)
    template_key = Column(String)
    status = Column(String, default="sent")
    sent_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="email_logs")


class ApiUsageLog(Base):
    __tablename__ = "api_usage_logs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    path = Column(String)
    method = Column(String, default="GET")
    logged_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    company = relationship("Company", back_populates="api_usage_logs")


class SubscriptionReceipt(Base):
    __tablename__ = "subscription_receipts"
    id = Column(Integer, primary_key=True, index=True)
    ref_id = Column(String, unique=True, index=True, nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    subscription_tier = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    period_days = Column(Integer, default=30)
    status = Column(String, default="pending")
    period_start = Column(DateTime(timezone=True))
    period_end = Column(DateTime(timezone=True))
    paid_at = Column(DateTime(timezone=True))
    stripe_checkout_session_id = Column(String)
    stripe_subscription_id = Column(String)
    billing_cycle = Column(String, default="monthly")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="subscription_receipts")
    user = relationship("User")


class PlatformSetting(Base):
    __tablename__ = "platform_settings"
    key = Column(String, primary_key=True)
    value = Column(Text)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class StripePlanPrice(Base):
    __tablename__ = "stripe_plan_prices"
    __table_args__ = (UniqueConstraint("tier", "billing_cycle", name="uq_stripe_plan_price"),)
    id = Column(Integer, primary_key=True, index=True)
    tier = Column(String, nullable=False)
    billing_cycle = Column(String, nullable=False)
    stripe_product_id = Column(String)
    stripe_price_id = Column(String, unique=True, index=True)
    unit_amount = Column(Integer)
    currency = Column(String, default="gbp")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CompanySubscription(Base):
    __tablename__ = "company_subscriptions"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    stripe_customer_id = Column(String)
    stripe_subscription_id = Column(String, unique=True, index=True)
    stripe_price_id = Column(String)
    plan_tier = Column(String, nullable=False)
    billing_cycle = Column(String, default="monthly")
    status = Column(String, default="active")
    current_period_start = Column(DateTime(timezone=True))
    current_period_end = Column(DateTime(timezone=True))
    cancel_at_period_end = Column(Boolean, default=False)
    canceled_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="company_subscriptions")
    user = relationship("User")
    billing_receipts = relationship("BillingReceipt", back_populates="subscription")


class BillingReceipt(Base):
    __tablename__ = "billing_receipts"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    subscription_id = Column(Integer, ForeignKey("company_subscriptions.id"))
    stripe_invoice_id = Column(String, unique=True, index=True)
    receipt_number = Column(String, unique=True, index=True)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="gbp")
    plan_name = Column(String)
    billing_cycle = Column(String)
    payment_method_last4 = Column(String)
    invoice_url = Column(String)
    next_renewal_date = Column(DateTime(timezone=True))
    paid_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="billing_receipts")
    user = relationship("User")
    subscription = relationship("CompanySubscription", back_populates="billing_receipts")


class SubscriptionInvoice(Base):
    __tablename__ = "subscription_invoices"
    id = Column(Integer, primary_key=True, index=True)
    invoice_number = Column(String, unique=True, index=True, nullable=False)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    subscription_tier = Column(String, nullable=False)
    billing_cycle = Column(String, default="monthly")
    period_start = Column(DateTime(timezone=True))
    period_end = Column(DateTime(timezone=True))
    due_date = Column(Date, nullable=False)
    amount_ex_vat = Column(Float, nullable=False)
    vat_amount = Column(Float, nullable=False)
    total_amount = Column(Float, nullable=False)
    amount_paid = Column(Float, default=0)
    status = Column(String, default="unpaid")
    email_sent = Column(Boolean, default=False)
    sent_at = Column(DateTime(timezone=True))
    paid_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    company = relationship("Company", back_populates="subscription_invoices")


class LoginLog(Base):
    __tablename__ = "login_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    email = Column(String)
    full_name = Column(String)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=True, index=True)
    login_at = Column(DateTime(timezone=True), server_default=func.now())
    ip_address = Column(String)
    user_agent = Column(String)
    status = Column(String, nullable=False)


class Contractor(Base):
    __tablename__ = "contractors"
    id = Column(Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    type = Column(Enum(ContractorKind, values_callable=lambda x: [e.value for e in x], native_enum=False), nullable=False)
    contact_email = Column(String)
    contact_phone = Column(String)
    address = Column(String)
    postcode = Column(String)
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
    visa_expiry_date = Column(Date)
    share_code = Column(String)
    share_code_expiry_date = Column(Date)
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
    file_name = Column(String)
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
    postcode = Column(String)
    contact_person = Column(String)
    double_rate_special_days = Column(Boolean, default=False)
    contract_start_date = Column(Date, nullable=True)
    contract_end_date = Column(Date, nullable=True)
    contract_expiry_alert_sent_date = Column(Date, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="clients")
    sites = relationship("Site", back_populates="client")
    invoices = relationship("Invoice", back_populates="client", cascade="all, delete-orphan")
    contract_renewals = relationship("ClientContractRenewal", back_populates="client", cascade="all, delete-orphan")
    staff_requests = relationship("StaffRequest", back_populates="client", cascade="all, delete-orphan")

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
    color = Column(String, default="#3b82f6")
    address = Column(String)
    postcode = Column(String)
    contact_person = Column(String)
    contact_email = Column(String)
    contact_phone = Column(String)
    contract_start_date = Column(Date, nullable=True)
    contract_end_date = Column(Date, nullable=True)
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

class RotaPlan(Base):
    __tablename__ = "rota_plans"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    day_count = Column(Integer, nullable=False)
    view_mode = Column(String, default="table")
    budget = Column(Float, default=0)
    status = Column(String, default="draft")
    planner_data = Column(Text)
    published_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="rota_plans")
    assignments = relationship("Assignment", back_populates="rota_plan")
    staff_requests = relationship("StaffRequest", back_populates="rota_plan")


class StaffRequest(Base):
    __tablename__ = "staff_requests"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    client_id = Column(Integer, ForeignKey("clients.id"), nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    requested_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    shift_date = Column(Date, nullable=False)
    shift_start = Column(String, nullable=False)
    shift_end = Column(String, nullable=False)
    break_minutes = Column(Integer, default=30)
    staff_count = Column(Integer, default=1)
    client_notes = Column(Text)
    status = Column(String, default="pending")
    reviewer_user_id = Column(Integer, ForeignKey("users.id"))
    reviewer_comment = Column(Text)
    reviewed_at = Column(DateTime(timezone=True))
    rota_plan_id = Column(Integer, ForeignKey("rota_plans.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="staff_requests")
    client = relationship("Client", back_populates="staff_requests")
    site = relationship("Site")
    requested_by = relationship("User", foreign_keys=[requested_by_user_id])
    reviewer = relationship("User", foreign_keys=[reviewer_user_id])
    rota_plan = relationship("RotaPlan", back_populates="staff_requests")


class Assignment(Base):
    __tablename__ = "assignments"
    id = Column(Integer, primary_key=True, index=True)
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"), nullable=False)
    rota_plan_id = Column(Integer, ForeignKey("rota_plans.id"))
    date = Column(Date, nullable=False)
    shift_start = Column(String)
    shift_end = Column(String)
    break_minutes = Column(Integer, default=0)
    shift_type = Column(String, default="day")
    shift_rate = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    guard = relationship("Guard", back_populates="assignments")
    site = relationship("Site", back_populates="assignments")
    rota_plan = relationship("RotaPlan", back_populates="assignments")
    attendances = relationship("Attendance", back_populates="assignment", cascade="all, delete-orphan")

class ShiftOvertimeLog(Base):
    __tablename__ = "shift_overtime_logs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    assignment_id = Column(Integer, ForeignKey("assignments.id"))
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"))
    shift_date = Column(Date, nullable=False)
    shift_start = Column(String)
    scheduled_end = Column(String, nullable=False)
    new_end = Column(String, nullable=False)
    reason = Column(Text, nullable=False)
    recorded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    guard = relationship("Guard")
    site = relationship("Site")
    assignment = relationship("Assignment")
    recorder = relationship("User", foreign_keys=[recorded_by])

class ShiftEarlyFinishLog(Base):
    __tablename__ = "shift_early_finish_logs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    assignment_id = Column(Integer, ForeignKey("assignments.id"))
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"))
    shift_date = Column(Date, nullable=False)
    shift_start = Column(String)
    scheduled_end = Column(String, nullable=False)
    actual_end = Column(String, nullable=False)
    reason = Column(Text, nullable=False)
    recorded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    guard = relationship("Guard")
    site = relationship("Site")
    assignment = relationship("Assignment")
    recorder = relationship("User", foreign_keys=[recorded_by])

class ShiftLateLog(Base):
    __tablename__ = "shift_late_logs"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    assignment_id = Column(Integer, ForeignKey("assignments.id"))
    guard_id = Column(Integer, ForeignKey("guards.id"), nullable=False)
    site_id = Column(Integer, ForeignKey("sites.id"))
    shift_date = Column(Date, nullable=False)
    scheduled_start = Column(String, nullable=False)
    actual_start = Column(String, nullable=False)
    late_minutes = Column(Integer, nullable=False)
    note = Column(Text)
    recorded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    guard = relationship("Guard")
    site = relationship("Site")
    assignment = relationship("Assignment")
    recorder = relationship("User", foreign_keys=[recorded_by])

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
    postcode = Column(String)
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
    postcode = Column(String)
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


class Expense(Base):
    __tablename__ = "expenses"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    expense_date = Column(Date, nullable=False)
    category = Column(String, nullable=False)
    vendor_name = Column(String)
    reference_number = Column(String)
    description = Column(Text)
    amount_ex_vat = Column(Float, nullable=False, default=0)
    vat_amount = Column(Float, nullable=False, default=0)
    total_amount = Column(Float, nullable=False, default=0)
    vat_exempt = Column(Boolean, default=False, nullable=False)
    payment_method = Column(String)
    payment_status = Column(String, default="pending")
    document_path = Column(String)
    document_mime = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="expenses")


DEFAULT_LEAD_STATUSES = (
    "new",
    "contacted",
    "follow_up",
    "meeting",
    "qualified",
    "proposal_sent",
    "negotiation",
    "won",
    "lost",
    "on_hold",
)


class Lead(Base):
    __tablename__ = "leads"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    organization = Column(String)
    contact_name = Column(String)
    designation = Column(String)
    email = Column(String, index=True)
    email_secondary = Column(String)
    phone = Column(String, index=True)
    phone_secondary = Column(String)
    address = Column(String)
    city = Column(String)
    postcode = Column(String)
    comments = Column(Text)
    source = Column(String)
    status = Column(String, default="new", nullable=False)
    priority = Column(String, default="moderate")
    estimated_value = Column(Float, default=0)
    assigned_user_id = Column(Integer, ForeignKey("users.id"))
    created_by = Column(Integer, ForeignKey("users.id"))
    converted = Column(Boolean, default=False)
    converted_at = Column(DateTime(timezone=True))
    converted_to_type = Column(String)
    converted_to_id = Column(Integer)
    next_follow_up_at = Column(DateTime(timezone=True))
    meeting_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    company = relationship("Company", back_populates="leads")
    assignee = relationship("User", foreign_keys=[assigned_user_id])
    creator = relationship("User", foreign_keys=[created_by])
    status_history = relationship("LeadStatusHistory", back_populates="lead", cascade="all, delete-orphan")
    notes = relationship("LeadNote", back_populates="lead", cascade="all, delete-orphan")
    follow_ups = relationship("LeadFollowUp", back_populates="lead", cascade="all, delete-orphan")
    communications = relationship("LeadCommunication", back_populates="lead", cascade="all, delete-orphan")
    conversions = relationship("LeadConversion", back_populates="lead", cascade="all, delete-orphan")
    documents = relationship("LeadDocument", back_populates="lead", cascade="all, delete-orphan")
    quotations = relationship("LeadQuotation", back_populates="lead", cascade="all, delete-orphan")


class LeadCustomStatus(Base):
    __tablename__ = "lead_custom_statuses"
    __table_args__ = (UniqueConstraint("company_id", "name", name="uq_lead_custom_status"),)
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    name = Column(String, nullable=False)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LeadStatusHistory(Base):
    __tablename__ = "lead_status_history"
    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    from_status = Column(String)
    to_status = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"))
    note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    lead = relationship("Lead", back_populates="status_history")
    user = relationship("User")


class LeadNote(Base):
    __tablename__ = "lead_notes"
    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    lead = relationship("Lead", back_populates="notes")
    user = relationship("User")


class LeadFollowUp(Base):
    __tablename__ = "lead_follow_ups"
    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    activity_type = Column(String, nullable=False)
    title = Column(String)
    due_at = Column(DateTime(timezone=True), nullable=False)
    completed_at = Column(DateTime(timezone=True))
    assigned_user_id = Column(Integer, ForeignKey("users.id"))
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    lead = relationship("Lead", back_populates="follow_ups")
    assignee = relationship("User", foreign_keys=[assigned_user_id])


class LeadCommunication(Base):
    __tablename__ = "lead_communications"
    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    channel = Column(String, nullable=False)
    subject = Column(String)
    body = Column(Text)
    attachment_path = Column(String)
    user_id = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    lead = relationship("Lead", back_populates="communications")
    user = relationship("User")


class LeadConversion(Base):
    __tablename__ = "lead_conversions"
    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    target_type = Column(String, nullable=False)
    target_id = Column(Integer, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"))
    note = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    lead = relationship("Lead", back_populates="conversions")
    user = relationship("User")


class LeadDocument(Base):
    __tablename__ = "lead_documents"
    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    lead = relationship("Lead", back_populates="documents")


class LeadQuotation(Base):
    __tablename__ = "lead_quotations"
    id = Column(Integer, primary_key=True, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    title = Column(String, nullable=False)
    amount = Column(Float, default=0)
    status = Column(String, default="draft")
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    lead = relationship("Lead", back_populates="quotations")


class LeadFilterPreset(Base):
    __tablename__ = "lead_filter_presets"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    name = Column(String, nullable=False)
    filters_json = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class AppNotification(Base):
    __tablename__ = "app_notifications"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    kind = Column(String, nullable=False)
    title = Column(String, nullable=False)
    body = Column(Text)
    entity_type = Column(String)
    entity_id = Column(Integer)
    read_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False)
    endpoint = Column(Text, nullable=False)
    p256dh = Column(String, nullable=False)
    auth = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SalesOpportunity(Base):
    __tablename__ = "sales_opportunities"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"))
    client_id = Column(Integer, ForeignKey("clients.id"))
    title = Column(String, nullable=False)
    value = Column(Float, default=0)
    status = Column(String, default="open")
    notes = Column(Text)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SalesProject(Base):
    __tablename__ = "sales_projects"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"))
    client_id = Column(Integer, ForeignKey("clients.id"))
    title = Column(String, nullable=False)
    value = Column(Float, default=0)
    status = Column(String, default="planned")
    start_date = Column(Date)
    end_date = Column(Date)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class SalesContract(Base):
    __tablename__ = "sales_contracts"
    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("companies.id"), nullable=False, index=True)
    lead_id = Column(Integer, ForeignKey("leads.id"))
    client_id = Column(Integer, ForeignKey("clients.id"))
    title = Column(String, nullable=False)
    value = Column(Float, default=0)
    status = Column(String, default="draft")
    start_date = Column(Date)
    end_date = Column(Date)
    created_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


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
