import sqlite3
import os
from app.config import settings

def get_db_path():
    url = settings.database_url
    if url.startswith("sqlite:///"):
        path = url.replace("sqlite:///", "").split("?")[0]
        if not os.path.isabs(path):
            path = os.path.abspath(path)
        return path
    return None

def column_exists(cursor, table, col):
    cursor.execute(f"PRAGMA table_info({table})")
    return any(r[1] == col for r in cursor.fetchall())

def table_exists(cursor, table):
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    return cursor.fetchone() is not None

def run():
    path = get_db_path()
    if not path:
        return
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(path)
    cur = conn.cursor()
    if table_exists(cur, "companies") and not table_exists(cur, "main_contractors"):
        try:
            cur.execute(
                """CREATE TABLE main_contractors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                name TEXT NOT NULL,
                contact_person TEXT,
                phone TEXT,
                email TEXT,
                address TEXT,
                registration_number TEXT,
                contract_start_date TEXT,
                contract_end_date TEXT,
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT
            )"""
            )
        except sqlite3.OperationalError:
            pass
    alters = [
        ("users", "role", "TEXT DEFAULT 'company_admin'"),
        ("users", "company_id", "INTEGER REFERENCES companies(id)"),
        ("users", "updated_at", "TEXT"),
        ("companies", "subscription_tier", "TEXT DEFAULT 'basic'"),
        ("companies", "stripe_customer_id", "TEXT"),
        ("companies", "updated_at", "TEXT"),
        ("guards", "sia_number", "TEXT"),
        ("guards", "sia_expiry_date", "TEXT"),
        ("guards", "visa_status", "TEXT"),
        ("guards", "visa_expiry_date", "TEXT"),
        ("guards", "share_code", "TEXT"),
        ("guards", "share_code_expiry_date", "TEXT"),
        ("guards", "rtw_status", "TEXT"),
        ("guards", "employment_history", "TEXT"),
        ("guards", "updated_at", "TEXT"),
        ("clients", "updated_at", "TEXT"),
        ("sites", "client_id", "INTEGER REFERENCES clients(id)"),
        ("sites", "default_hourly_rate", "REAL"),
        ("sites", "updated_at", "TEXT"),
        ("assignments", "break_minutes", "INTEGER DEFAULT 0"),
        ("assignments", "shift_type", "TEXT DEFAULT 'day'"),
        ("assignments", "shift_rate", "REAL"),
        ("assignments", "updated_at", "TEXT"),
        ("sub_contractors", "updated_at", "TEXT"),
        ("guards", "dbs_status", "TEXT"),
        ("guards", "weekly_contracted_hours", "REAL DEFAULT 40"),
        ("guards", "main_contractor_id", "INTEGER REFERENCES main_contractors(id)"),
        ("guards", "sub_contractor_id", "INTEGER REFERENCES sub_contractors(id)"),
        ("sites", "main_contractor_id", "INTEGER REFERENCES main_contractors(id)"),
        ("sites", "sub_contractor_id", "INTEGER REFERENCES sub_contractors(id)"),
        ("sites", "color", "TEXT DEFAULT '#3b82f6'"),
        ("sub_contractors", "main_contractor_id", "INTEGER REFERENCES main_contractors(id)"),
        ("sub_contractors", "registration_number", "TEXT"),
        ("sub_contractors", "contract_start_date", "TEXT"),
        ("sub_contractors", "contract_end_date", "TEXT"),
        ("sub_contractors", "status", "TEXT DEFAULT 'active'"),
        ("companies", "logo_path", "TEXT"),
        ("companies", "account_name", "TEXT"),
        ("companies", "bank_name", "TEXT"),
        ("companies", "sort_code", "TEXT"),
        ("companies", "account_number", "TEXT"),
        ("companies", "iban", "TEXT"),
        ("companies", "swift_code", "TEXT"),
        ("companies", "email", "TEXT"),
        ("companies", "phone", "TEXT"),
        ("companies", "address", "TEXT"),
        ("companies", "contract_expiry_alert_sent_date", "TEXT"),
        ("invoices", "due_date", "TEXT"),
        ("invoices", "notes", "TEXT"),
        ("invoices", "subtotal", "REAL DEFAULT 0"),
        ("invoices", "tax_rate", "REAL DEFAULT 0"),
        ("invoices", "tax_amount", "REAL DEFAULT 0"),
        # Tenant lifecycle: archived companies keep their data but cannot sign in.
        ("companies", "archived_at", "TEXT"),
        ("companies", "archived_by_user_id", "INTEGER"),
        # Impersonation. A session carrying impersonator_user_id IS an impersonated
        # session; parent_jti points at the super admin's own still-live session, which is
        # what "exit" returns to and what is re-checked on every request.
        ("user_sessions", "impersonator_user_id", "INTEGER REFERENCES users(id)"),
        ("user_sessions", "parent_jti", "TEXT"),
        ("user_sessions", "impersonation_mode", "TEXT"),
        ("user_sessions", "impersonation_reason", "TEXT"),
        # Audit rows record the real actor as well as the acting user, so an action taken
        # while impersonating is never attributed to the customer.
        ("audit_logs", "actor_user_id", "INTEGER"),
        ("audit_logs", "impersonated", "INTEGER NOT NULL DEFAULT 0"),
        ("audit_logs", "ip_address", "TEXT"),
    ]
    for table, col, spec in alters:
        if table_exists(cur, table) and not column_exists(cur, table, col):
            try:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {spec}")
            except sqlite3.OperationalError:
                pass
    if table_exists(cur, "companies") and not table_exists(cur, "special_days"):
        try:
            cur.execute(
                """CREATE TABLE special_days (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                date TEXT NOT NULL,
                label TEXT NOT NULL,
                UNIQUE(company_id, date)
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "clients") and not column_exists(cur, "clients", "double_rate_special_days"):
        try:
            cur.execute("ALTER TABLE clients ADD COLUMN double_rate_special_days INTEGER NOT NULL DEFAULT 0")
        except sqlite3.OperationalError:
            pass
    for col, spec in [
        ("contract_start_date", "TEXT"),
        ("contract_end_date", "TEXT"),
        ("contract_expiry_alert_sent_date", "TEXT"),
    ]:
        if table_exists(cur, "clients") and not column_exists(cur, "clients", col):
            try:
                cur.execute(f"ALTER TABLE clients ADD COLUMN {col} {spec}")
            except sqlite3.OperationalError:
                pass
    if table_exists(cur, "clients") and not table_exists(cur, "client_contract_renewals"):
        try:
            cur.execute(
                """CREATE TABLE client_contract_renewals (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                client_id INTEGER NOT NULL REFERENCES clients(id),
                previous_end_date TEXT,
                new_end_date TEXT NOT NULL,
                note TEXT,
                user_id INTEGER REFERENCES users(id),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "invoices") and column_exists(cur, "invoices", "subtotal"):
        try:
            cur.execute(
                "UPDATE invoices SET subtotal = total WHERE (subtotal IS NULL OR subtotal = 0) AND total IS NOT NULL AND total != 0"
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "companies") and not table_exists(cur, "audit_logs"):
        try:
            cur.execute(
                """CREATE TABLE audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER REFERENCES companies(id),
                user_id INTEGER REFERENCES users(id),
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id INTEGER,
                meta TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "sub_contractors") and column_exists(cur, "sub_contractors", "registration_number") and column_exists(cur, "sub_contractors", "license_number"):
        try:
            cur.execute(
                "UPDATE sub_contractors SET registration_number = license_number WHERE (registration_number IS NULL OR registration_number = '') AND license_number IS NOT NULL"
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "companies") and not table_exists(cur, "roles"):
        try:
            cur.execute(
                """CREATE TABLE roles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                name TEXT NOT NULL,
                slug TEXT NOT NULL,
                is_system INTEGER NOT NULL DEFAULT 0,
                permissions_json TEXT NOT NULL DEFAULT '{}',
                UNIQUE(company_id, slug)
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "users") and not column_exists(cur, "users", "role_id"):
        try:
            cur.execute("ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id)")
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "companies") and not table_exists(cur, "contractors"):
        try:
            cur.execute(
                """CREATE TABLE contractors (
                id TEXT PRIMARY KEY NOT NULL,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                contact_email TEXT,
                contact_phone TEXT,
                address TEXT,
                is_active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "contractors") and not table_exists(cur, "contractor_assignments"):
        try:
            cur.execute(
                """CREATE TABLE contractor_assignments (
                id TEXT PRIMARY KEY NOT NULL,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                main_contractor_id TEXT NOT NULL REFERENCES contractors(id),
                sub_contractor_id TEXT NOT NULL REFERENCES contractors(id),
                site_id INTEGER REFERENCES sites(id),
                start_date TEXT,
                end_date TEXT,
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(company_id, main_contractor_id, sub_contractor_id, site_id)
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "guards") and not column_exists(cur, "guards", "contractor_id"):
        try:
            cur.execute("ALTER TABLE guards ADD COLUMN contractor_id TEXT REFERENCES contractors(id)")
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "sites") and not column_exists(cur, "sites", "contractor_id"):
        try:
            cur.execute("ALTER TABLE sites ADD COLUMN contractor_id TEXT REFERENCES contractors(id)")
        except sqlite3.OperationalError:
            pass
    guard_profile_cols = [
        ("title", "TEXT"), ("first_name", "TEXT"), ("middle_name", "TEXT"), ("last_name", "TEXT"),
        ("gender", "TEXT"), ("ethnicity", "TEXT"), ("date_of_birth", "TEXT"),
        ("work_phone", "TEXT"), ("job_title", "TEXT"),
        ("employment_start_date", "TEXT"), ("probation_end_date", "TEXT"),
        ("address_line_1", "TEXT"), ("address_line_2", "TEXT"), ("address_line_3", "TEXT"),
        ("town_city", "TEXT"), ("county", "TEXT"), ("postcode", "TEXT"),
        ("emergency_first_name", "TEXT"), ("emergency_last_name", "TEXT"),
        ("emergency_mobile", "TEXT"), ("emergency_home_phone", "TEXT"), ("emergency_work_phone", "TEXT"),
        ("emergency_relationship", "TEXT"),
        ("emergency_address_line_1", "TEXT"), ("emergency_address_line_2", "TEXT"),
        ("emergency_address_line_3", "TEXT"), ("emergency_town_city", "TEXT"),
        ("emergency_county", "TEXT"), ("emergency_postcode", "TEXT"),
        ("bank_account_name", "TEXT"), ("bank_name", "TEXT"), ("bank_branch", "TEXT"),
        ("bank_account_number", "TEXT"), ("bank_sort_code", "TEXT"),
        ("tax_code", "TEXT"), ("ni_number", "TEXT"),
        ("passport_number", "TEXT"), ("passport_country", "TEXT"), ("passport_expiry_date", "TEXT"),
        ("driving_licence_country", "TEXT"), ("driving_licence_class", "TEXT"),
        ("driving_licence_expiry_date", "TEXT"),
        ("holiday_jurisdiction", "TEXT"), ("employee_type", "TEXT"), ("working_time_pattern", "TEXT"),
        ("company_full_time_week_hrs", "INTEGER"), ("company_full_time_week_mins", "INTEGER"),
        ("entitlement_unit", "TEXT"),
        ("contracted_week_hrs", "INTEGER"), ("contracted_week_mins", "INTEGER"),
        ("average_day_hrs", "INTEGER"), ("average_day_mins", "INTEGER"),
        ("annual_leave_equivalent_hrs", "INTEGER"), ("annual_leave_equivalent_mins", "INTEGER"),
        ("leave_year_start_day", "INTEGER"), ("leave_year_start_month", "INTEGER"),
        ("leave_entitlement_hrs", "INTEGER"), ("leave_entitlement_mins", "INTEGER"),
        ("leave_allowance_hrs", "INTEGER"), ("leave_allowance_mins", "INTEGER"),
        ("service_area", "TEXT"), ("nearby_areas", "TEXT"), ("has_car", "INTEGER DEFAULT 0"),
        ("available_days", "TEXT"), ("availability_timing", "TEXT"), ("pay_frequency", "TEXT DEFAULT 'weekly'"),
    ]
    if table_exists(cur, "guards"):
        for col, spec in guard_profile_cols:
            if not column_exists(cur, "guards", col):
                try:
                    cur.execute(f"ALTER TABLE guards ADD COLUMN {col} {spec}")
                except sqlite3.OperationalError:
                    pass
    if not table_exists(cur, "rota_plans"):
        try:
            cur.execute(
                """CREATE TABLE rota_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                name TEXT NOT NULL,
                start_date TEXT NOT NULL,
                end_date TEXT NOT NULL,
                day_count INTEGER NOT NULL,
                view_mode TEXT DEFAULT 'table',
                budget REAL DEFAULT 0,
                status TEXT DEFAULT 'draft',
                planner_data TEXT,
                published_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "assignments") and not column_exists(cur, "assignments", "rota_plan_id"):
        try:
            cur.execute("ALTER TABLE assignments ADD COLUMN rota_plan_id INTEGER REFERENCES rota_plans(id)")
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "companies") and not column_exists(cur, "companies", "subscription_status"):
        try:
            cur.execute("ALTER TABLE companies ADD COLUMN subscription_status TEXT DEFAULT 'pending'")
            cur.execute("UPDATE companies SET subscription_status = 'active' WHERE subscription_status IS NULL OR subscription_status = 'pending'")
        except sqlite3.OperationalError:
            pass
    for col, spec in [
        ("subscription_start", "TEXT"),
        ("subscription_end", "TEXT"),
        ("billing_cycle", "TEXT DEFAULT 'monthly'"),
        ("max_users", "INTEGER"),
        ("enabled_modules_json", "TEXT"),
        ("twilio_account_sid", "TEXT"),
        ("twilio_auth_token", "TEXT"),
        ("twilio_phone_number", "TEXT"),
        ("sms_templates_json", "TEXT"),
    ]:
        if table_exists(cur, "companies") and not column_exists(cur, "companies", col):
            try:
                cur.execute(f"ALTER TABLE companies ADD COLUMN {col} {spec}")
            except sqlite3.OperationalError:
                pass
    if table_exists(cur, "users") and not column_exists(cur, "users", "sidebar_modules_json"):
        try:
            cur.execute("ALTER TABLE users ADD COLUMN sidebar_modules_json TEXT")
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "users") and not column_exists(cur, "users", "client_id"):
        try:
            cur.execute("ALTER TABLE users ADD COLUMN client_id INTEGER REFERENCES clients(id)")
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "users") and not column_exists(cur, "users", "guard_id"):
        try:
            cur.execute("ALTER TABLE users ADD COLUMN guard_id INTEGER REFERENCES guards(id)")
        except sqlite3.OperationalError:
            pass
    # Pins a portal login to specific sites. Deliberately left empty for every existing
    # login, which portal_access reads as "all sites of my client" — the behaviour before
    # this table existed, so no live login changes scope on deploy.
    if table_exists(cur, "users") and not table_exists(cur, "user_sites"):
        try:
            cur.execute(
                """CREATE TABLE user_sites (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                site_id INTEGER NOT NULL REFERENCES sites(id),
                company_id INTEGER NOT NULL REFERENCES companies(id),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id, site_id)
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "users") and not column_exists(cur, "users", "email_verified"):
        try:
            cur.execute("ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0")
            cur.execute("UPDATE users SET email_verified = 1")
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "users") and not column_exists(cur, "users", "auth_provider"):
        try:
            cur.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT DEFAULT 'local'")
            cur.execute("UPDATE users SET auth_provider = 'local' WHERE auth_provider IS NULL")
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "staff_requests"):
        try:
            cur.execute(
                """CREATE TABLE staff_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                client_id INTEGER NOT NULL REFERENCES clients(id),
                site_id INTEGER NOT NULL REFERENCES sites(id),
                requested_by_user_id INTEGER NOT NULL REFERENCES users(id),
                shift_date TEXT NOT NULL,
                shift_start TEXT NOT NULL,
                shift_end TEXT NOT NULL,
                break_minutes INTEGER DEFAULT 30,
                staff_count INTEGER DEFAULT 1,
                client_notes TEXT,
                status TEXT DEFAULT 'pending',
                reviewer_user_id INTEGER REFERENCES users(id),
                reviewer_comment TEXT,
                reviewed_at TEXT,
                rota_plan_id INTEGER REFERENCES rota_plans(id),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "companies") and not table_exists(cur, "subscription_receipts"):
        try:
            cur.execute(
                """CREATE TABLE subscription_receipts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                ref_id TEXT NOT NULL UNIQUE,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                user_id INTEGER NOT NULL REFERENCES users(id),
                subscription_tier TEXT NOT NULL,
                amount REAL NOT NULL,
                period_days INTEGER DEFAULT 30,
                status TEXT DEFAULT 'pending',
                period_start TEXT,
                period_end TEXT,
                paid_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "companies") and not table_exists(cur, "expenses"):
        try:
            cur.execute(
                """CREATE TABLE expenses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                expense_date TEXT NOT NULL,
                category TEXT NOT NULL,
                vendor_name TEXT,
                reference_number TEXT,
                description TEXT,
                amount_ex_vat REAL NOT NULL DEFAULT 0,
                vat_amount REAL NOT NULL DEFAULT 0,
                total_amount REAL NOT NULL DEFAULT 0,
                vat_exempt INTEGER NOT NULL DEFAULT 0,
                payment_method TEXT,
                payment_status TEXT DEFAULT 'pending',
                document_path TEXT,
                document_mime TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if table_exists(cur, "companies") and not table_exists(cur, "subscription_invoices"):
        try:
            cur.execute(
                """CREATE TABLE subscription_invoices (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                invoice_number TEXT NOT NULL UNIQUE,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                subscription_tier TEXT NOT NULL,
                billing_cycle TEXT DEFAULT 'monthly',
                period_start TEXT,
                period_end TEXT,
                due_date TEXT NOT NULL,
                amount_ex_vat REAL NOT NULL,
                vat_amount REAL NOT NULL,
                total_amount REAL NOT NULL,
                amount_paid REAL DEFAULT 0,
                status TEXT DEFAULT 'unpaid',
                email_sent INTEGER DEFAULT 0,
                sent_at TEXT,
                paid_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "login_logs"):
        try:
            cur.execute(
                """CREATE TABLE login_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id),
                email TEXT,
                full_name TEXT,
                company_id INTEGER REFERENCES companies(id),
                login_at TEXT DEFAULT CURRENT_TIMESTAMP,
                ip_address TEXT,
                user_agent TEXT,
                status TEXT NOT NULL
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "sms_logs"):
        try:
            cur.execute(
                """CREATE TABLE sms_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                recipient TEXT NOT NULL,
                body TEXT NOT NULL,
                template_key TEXT,
                status TEXT DEFAULT 'sent',
                error_message TEXT,
                twilio_sid TEXT,
                sent_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "shift_overtime_logs"):
        try:
            cur.execute(
                """CREATE TABLE shift_overtime_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                assignment_id INTEGER REFERENCES assignments(id),
                guard_id INTEGER NOT NULL REFERENCES guards(id),
                site_id INTEGER REFERENCES sites(id),
                shift_date TEXT NOT NULL,
                shift_start TEXT,
                scheduled_end TEXT NOT NULL,
                new_end TEXT NOT NULL,
                reason TEXT NOT NULL,
                recorded_by INTEGER REFERENCES users(id),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "shift_early_finish_logs"):
        try:
            cur.execute(
                """CREATE TABLE shift_early_finish_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                assignment_id INTEGER REFERENCES assignments(id),
                guard_id INTEGER NOT NULL REFERENCES guards(id),
                site_id INTEGER REFERENCES sites(id),
                shift_date TEXT NOT NULL,
                shift_start TEXT,
                scheduled_end TEXT NOT NULL,
                actual_end TEXT NOT NULL,
                reason TEXT NOT NULL,
                recorded_by INTEGER REFERENCES users(id),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "shift_late_logs"):
        try:
            cur.execute(
                """CREATE TABLE shift_late_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                assignment_id INTEGER REFERENCES assignments(id),
                guard_id INTEGER NOT NULL REFERENCES guards(id),
                site_id INTEGER REFERENCES sites(id),
                shift_date TEXT NOT NULL,
                scheduled_start TEXT NOT NULL,
                actual_start TEXT NOT NULL,
                late_minutes INTEGER NOT NULL,
                note TEXT,
                recorded_by INTEGER REFERENCES users(id),
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "leads"):
        try:
            cur.execute(
                """CREATE TABLE leads (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                title TEXT NOT NULL,
                organization TEXT,
                contact_name TEXT,
                designation TEXT,
                email TEXT,
                email_secondary TEXT,
                phone TEXT,
                phone_secondary TEXT,
                address TEXT,
                city TEXT,
                postcode TEXT,
                comments TEXT,
                source TEXT,
                status TEXT NOT NULL DEFAULT 'new',
                priority TEXT DEFAULT 'moderate',
                estimated_value REAL DEFAULT 0,
                assigned_user_id INTEGER REFERENCES users(id),
                created_by INTEGER REFERENCES users(id),
                converted INTEGER DEFAULT 0,
                converted_at TEXT,
                converted_to_type TEXT,
                converted_to_id INTEGER,
                next_follow_up_at TEXT,
                meeting_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    for t in [
        ("lead_custom_statuses", """CREATE TABLE lead_custom_statuses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            name TEXT NOT NULL,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(company_id, name)
        )"""),
        ("lead_status_history", """CREATE TABLE lead_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL REFERENCES leads(id),
            from_status TEXT,
            to_status TEXT NOT NULL,
            user_id INTEGER REFERENCES users(id),
            note TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
        ("lead_notes", """CREATE TABLE lead_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL REFERENCES leads(id),
            user_id INTEGER REFERENCES users(id),
            body TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
        ("lead_follow_ups", """CREATE TABLE lead_follow_ups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL REFERENCES leads(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            activity_type TEXT NOT NULL,
            title TEXT,
            due_at TEXT NOT NULL,
            completed_at TEXT,
            assigned_user_id INTEGER REFERENCES users(id),
            notes TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
        ("lead_communications", """CREATE TABLE lead_communications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL REFERENCES leads(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            channel TEXT NOT NULL,
            subject TEXT,
            body TEXT,
            attachment_path TEXT,
            user_id INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
        ("lead_conversions", """CREATE TABLE lead_conversions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL REFERENCES leads(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            target_type TEXT NOT NULL,
            target_id INTEGER NOT NULL,
            user_id INTEGER REFERENCES users(id),
            note TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
        ("lead_documents", """CREATE TABLE lead_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL REFERENCES leads(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            file_name TEXT NOT NULL,
            file_path TEXT NOT NULL,
            uploaded_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
        ("lead_quotations", """CREATE TABLE lead_quotations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_id INTEGER NOT NULL REFERENCES leads(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            title TEXT NOT NULL,
            amount REAL DEFAULT 0,
            status TEXT DEFAULT 'draft',
            notes TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
        ("lead_filter_presets", """CREATE TABLE lead_filter_presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            name TEXT NOT NULL,
            filters_json TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
        ("app_notifications", """CREATE TABLE app_notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            kind TEXT NOT NULL,
            title TEXT NOT NULL,
            body TEXT,
            entity_type TEXT,
            entity_id INTEGER,
            read_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
        ("push_subscriptions", """CREATE TABLE push_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            company_id INTEGER NOT NULL REFERENCES companies(id),
            endpoint TEXT NOT NULL,
            p256dh TEXT NOT NULL,
            auth TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
        ("sales_opportunities", """CREATE TABLE sales_opportunities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            lead_id INTEGER REFERENCES leads(id),
            client_id INTEGER REFERENCES clients(id),
            title TEXT NOT NULL,
            value REAL DEFAULT 0,
            status TEXT DEFAULT 'open',
            notes TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
        ("sales_projects", """CREATE TABLE sales_projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            lead_id INTEGER REFERENCES leads(id),
            client_id INTEGER REFERENCES clients(id),
            title TEXT NOT NULL,
            value REAL DEFAULT 0,
            status TEXT DEFAULT 'planned',
            start_date TEXT,
            end_date TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
        ("sales_contracts", """CREATE TABLE sales_contracts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            lead_id INTEGER REFERENCES leads(id),
            client_id INTEGER REFERENCES clients(id),
            title TEXT NOT NULL,
            value REAL DEFAULT 0,
            status TEXT DEFAULT 'draft',
            start_date TEXT,
            end_date TEXT,
            created_by INTEGER REFERENCES users(id),
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )"""),
    ]:
        if not table_exists(cur, t[0]):
            try:
                cur.execute(t[1])
            except sqlite3.OperationalError:
                pass
    for table, col, spec in [
        ("sites", "postcode", "TEXT"),
        ("sites", "contact_email", "TEXT"),
        ("sites", "contract_start_date", "TEXT"),
        ("sites", "contract_end_date", "TEXT"),
        ("sites", "staff_hourly_rate", "REAL"),
        ("sites", "site_type", "INTEGER NOT NULL DEFAULT 1"),
        ("sites", "reference", "TEXT"),
        ("clients", "postcode", "TEXT"),
        ("contractors", "postcode", "TEXT"),
        ("main_contractors", "postcode", "TEXT"),
        ("sub_contractors", "postcode", "TEXT"),
        ("companies", "postcode", "TEXT"),
        ("companies", "registration_number", "TEXT"),
        ("companies", "vat_number", "TEXT"),
        ("companies", "email_templates_json", "TEXT"),
        ("companies", "smtp_server", "TEXT"),
        ("companies", "smtp_port", "INTEGER DEFAULT 587"),
        ("companies", "smtp_username", "TEXT"),
        ("companies", "smtp_password", "TEXT"),
        ("expenses", "vat_exempt", "INTEGER NOT NULL DEFAULT 0"),
        ("email_logs", "template_key", "TEXT"),
        ("guard_documents", "file_name", "TEXT"),
        ("leads", "organization", "TEXT"),
        ("leads", "designation", "TEXT"),
        ("leads", "email_secondary", "TEXT"),
        ("leads", "phone_secondary", "TEXT"),
        ("leads", "postcode", "TEXT"),
        ("leads", "comments", "TEXT"),
        ("leads", "meeting_at", "TEXT"),
        ("companies", "stripe_subscription_id", "TEXT"),
        ("companies", "stripe_connect_account_id", "TEXT"),
        ("subscription_receipts", "stripe_checkout_session_id", "TEXT"),
        ("subscription_receipts", "stripe_subscription_id", "TEXT"),
        ("companies", "website", "TEXT"),
        ("companies", "smtp_from", "TEXT"),
        ("companies", "smtp_from_name", "TEXT"),
        ("attendance", "note", "TEXT"),
        ("attendance", "updated_by_user_id", "INTEGER"),
        ("guards", "photo_path", "TEXT"),
        ("subscription_receipts", "billing_cycle", "TEXT DEFAULT 'monthly'"),
    ]:
        if table_exists(cur, table) and not column_exists(cur, table, col):
            try:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {spec}")
            except sqlite3.OperationalError:
                pass
    for ddl in [
        """CREATE TABLE IF NOT EXISTS platform_settings (
            key TEXT PRIMARY KEY,
            value TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS stripe_plan_prices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tier TEXT NOT NULL,
            billing_cycle TEXT NOT NULL,
            stripe_product_id TEXT,
            stripe_price_id TEXT UNIQUE,
            unit_amount INTEGER,
            currency TEXT DEFAULT 'gbp',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(tier, billing_cycle)
        )""",
        """CREATE TABLE IF NOT EXISTS company_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            stripe_customer_id TEXT,
            stripe_subscription_id TEXT UNIQUE,
            stripe_price_id TEXT,
            plan_tier TEXT NOT NULL,
            billing_cycle TEXT DEFAULT 'monthly',
            status TEXT DEFAULT 'active',
            current_period_start TEXT,
            current_period_end TEXT,
            cancel_at_period_end INTEGER DEFAULT 0,
            canceled_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
        """CREATE TABLE IF NOT EXISTS billing_receipts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            user_id INTEGER NOT NULL REFERENCES users(id),
            subscription_id INTEGER REFERENCES company_subscriptions(id),
            stripe_invoice_id TEXT UNIQUE,
            receipt_number TEXT UNIQUE,
            amount REAL NOT NULL,
            currency TEXT DEFAULT 'gbp',
            plan_name TEXT,
            billing_cycle TEXT,
            payment_method_last4 TEXT,
            invoice_url TEXT,
            next_renewal_date TEXT,
            paid_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )""",
    ]:
        try:
            cur.execute(ddl)
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "email_logs"):
        try:
            cur.execute(
                """CREATE TABLE email_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                recipient TEXT NOT NULL,
                subject TEXT,
                status TEXT DEFAULT 'sent',
                sent_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "api_usage_logs"):
        try:
            cur.execute(
                """CREATE TABLE api_usage_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                path TEXT,
                method TEXT DEFAULT 'GET',
                logged_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    for table, col, typedef in [
        ("sites", "latitude", "REAL"),
        ("sites", "longitude", "REAL"),
    ]:
        if table_exists(cur, table) and not column_exists(cur, table, col):
            try:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typedef}")
            except sqlite3.OperationalError:
                pass
    # Tables for patrol + incidents
    if not table_exists(cur, "patrol_routes"):
        try:
            cur.execute(
                """CREATE TABLE patrol_routes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                site_id INTEGER NOT NULL REFERENCES sites(id),
                name TEXT NOT NULL,
                frequency_minutes INTEGER NOT NULL DEFAULT 60,
                start_time TEXT NOT NULL DEFAULT '22:00',
                end_time TEXT NOT NULL DEFAULT '06:00',
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "patrol_checkpoints"):
        try:
            cur.execute(
                """CREATE TABLE patrol_checkpoints (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                site_id INTEGER NOT NULL REFERENCES sites(id),
                route_id INTEGER NOT NULL REFERENCES patrol_routes(id),
                code TEXT NOT NULL,
                name TEXT NOT NULL,
                floor TEXT,
                description TEXT,
                qr_token TEXT NOT NULL UNIQUE,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                radius_m REAL DEFAULT 20,
                sort_order INTEGER DEFAULT 0,
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "patrol_sessions"):
        try:
            cur.execute(
                """CREATE TABLE patrol_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                guard_id INTEGER NOT NULL REFERENCES guards(id),
                route_id INTEGER NOT NULL REFERENCES patrol_routes(id),
                assignment_id INTEGER REFERENCES assignments(id),
                started_at TEXT DEFAULT CURRENT_TIMESTAMP,
                ended_at TEXT,
                status TEXT DEFAULT 'active',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "patrol_logs"):
        try:
            cur.execute(
                """CREATE TABLE patrol_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                guard_id INTEGER NOT NULL REFERENCES guards(id),
                checkpoint_id INTEGER NOT NULL REFERENCES patrol_checkpoints(id),
                route_id INTEGER NOT NULL REFERENCES patrol_routes(id),
                session_id INTEGER REFERENCES patrol_sessions(id),
                assignment_id INTEGER REFERENCES assignments(id),
                scan_time TEXT DEFAULT CURRENT_TIMESTAMP,
                latitude REAL,
                longitude REAL,
                accuracy REAL,
                device_id TEXT,
                photo_path TEXT,
                distance_m REAL,
                status TEXT DEFAULT 'completed',
                notes TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "patrol_alerts"):
        try:
            cur.execute(
                """CREATE TABLE patrol_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                route_id INTEGER NOT NULL REFERENCES patrol_routes(id),
                checkpoint_id INTEGER REFERENCES patrol_checkpoints(id),
                session_id INTEGER REFERENCES patrol_sessions(id),
                guard_id INTEGER REFERENCES guards(id),
                alert_type TEXT DEFAULT 'missed_checkpoint',
                message TEXT,
                window_start TEXT,
                window_end TEXT,
                notified_at TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "incidents"):
        try:
            cur.execute(
                """CREATE TABLE incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_id INTEGER NOT NULL REFERENCES companies(id),
                client_id INTEGER REFERENCES clients(id),
                site_id INTEGER REFERENCES sites(id),
                reported_by_user_id INTEGER NOT NULL REFERENCES users(id),
                guard_id INTEGER REFERENCES guards(id),
                assignment_id INTEGER REFERENCES assignments(id),
                notes TEXT NOT NULL,
                latitude REAL,
                longitude REAL,
                accuracy REAL,
                occurred_at TEXT NOT NULL,
                status TEXT DEFAULT 'open',
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "incident_attachments"):
        try:
            cur.execute(
                """CREATE TABLE incident_attachments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id INTEGER NOT NULL REFERENCES incidents(id),
                file_path TEXT NOT NULL,
                mime_type TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "app_modules"):
        try:
            cur.execute(
                """CREATE TABLE app_modules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                icon TEXT NOT NULL DEFAULT 'LayoutDashboard',
                sidebar_path TEXT NOT NULL,
                sidebar_order INTEGER DEFAULT 0,
                section_key TEXT DEFAULT 'sectionOperations',
                is_active INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "role_module_permissions"):
        try:
            cur.execute(
                """CREATE TABLE role_module_permissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role_id INTEGER NOT NULL REFERENCES roles(id),
                module_id INTEGER NOT NULL REFERENCES app_modules(id),
                can_view INTEGER DEFAULT 0,
                can_create INTEGER DEFAULT 0,
                can_edit INTEGER DEFAULT 0,
                can_delete INTEGER DEFAULT 0,
                UNIQUE(role_id, module_id)
            )"""
            )
        except sqlite3.OperationalError:
            pass
    if not table_exists(cur, "role_module_actions"):
        try:
            cur.execute(
                """CREATE TABLE role_module_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                role_id INTEGER NOT NULL REFERENCES roles(id),
                module_id INTEGER NOT NULL REFERENCES app_modules(id),
                action_key TEXT NOT NULL,
                allowed INTEGER DEFAULT 0,
                UNIQUE(role_id, module_id, action_key)
            )"""
            )
            cur.execute(
                "CREATE INDEX IF NOT EXISTS ix_role_module_actions_role_id "
                "ON role_module_actions(role_id)"
            )
        except sqlite3.OperationalError:
            pass
    # --- Indexes -------------------------------------------------------------------
    # Only primary keys were indexed, so every lookup by company_id, guard_id, site_id
    # or date was a full table scan. Harmless at today's row counts, quadratic as the
    # tenant grows — api_usage_logs already has 133k rows and scanned in ~76ms.
    # All are covering the filters the services actually issue; see the query in
    # each referenced service for the column order.
    for statement in (
        # Written on every authenticated request, read by usage reports filtered on
        # company + date range.
        "CREATE INDEX IF NOT EXISTS ix_api_usage_company_logged ON api_usage_logs(company_id, logged_at)",
        # Rota / assignment lookups: by plan on publish, by guard or site on the grid.
        "CREATE INDEX IF NOT EXISTS ix_assignments_rota_plan ON assignments(rota_plan_id)",
        "CREATE INDEX IF NOT EXISTS ix_assignments_guard_date ON assignments(guard_id, date)",
        "CREATE INDEX IF NOT EXISTS ix_assignments_site_date ON assignments(site_id, date)",
        "CREATE INDEX IF NOT EXISTS ix_assignments_date ON assignments(date)",
        "CREATE INDEX IF NOT EXISTS ix_attendance_assignment ON attendance(assignment_id)",
        "CREATE INDEX IF NOT EXISTS ix_attendance_guard ON attendance(guard_id)",
        # Shift adjustment logs, joined per shift on the rota grid and in reports.
        "CREATE INDEX IF NOT EXISTS ix_overtime_company_date ON shift_overtime_logs(company_id, shift_date)",
        "CREATE INDEX IF NOT EXISTS ix_overtime_assignment ON shift_overtime_logs(assignment_id)",
        "CREATE INDEX IF NOT EXISTS ix_early_finish_company_date ON shift_early_finish_logs(company_id, shift_date)",
        "CREATE INDEX IF NOT EXISTS ix_early_finish_assignment ON shift_early_finish_logs(assignment_id)",
        "CREATE INDEX IF NOT EXISTS ix_late_company_date ON shift_late_logs(company_id, shift_date)",
        "CREATE INDEX IF NOT EXISTS ix_late_assignment ON shift_late_logs(assignment_id)",
        # Tenant-scoped list endpoints.
        "CREATE INDEX IF NOT EXISTS ix_guards_company ON guards(company_id)",
        "CREATE INDEX IF NOT EXISTS ix_sites_company ON sites(company_id)",
        "CREATE INDEX IF NOT EXISTS ix_rota_plans_company ON rota_plans(company_id)",
        "CREATE INDEX IF NOT EXISTS ix_invoices_company ON invoices(company_id)",
        "CREATE INDEX IF NOT EXISTS ix_invoice_lines_invoice ON invoice_lines(invoice_id)",
        "CREATE INDEX IF NOT EXISTS ix_payments_company ON payments(company_id)",
        "CREATE INDEX IF NOT EXISTS ix_payments_invoice ON payments(invoice_id)",
        "CREATE INDEX IF NOT EXISTS ix_expenses_company ON expenses(company_id)",
        "CREATE INDEX IF NOT EXISTS ix_leads_company ON leads(company_id)",
        "CREATE INDEX IF NOT EXISTS ix_incidents_company_created ON incidents(company_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_patrol_logs_company_created ON patrol_logs(company_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_guard_documents_guard ON guard_documents(guard_id)",
        "CREATE INDEX IF NOT EXISTS ix_login_logs_company ON login_logs(company_id)",
        # Shift history is always read as "this company, this date window", then narrowed.
        "CREATE INDEX IF NOT EXISTS ix_shift_audit_company_created ON shift_audit_logs(company_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_shift_audit_guard ON shift_audit_logs(guard_id)",
        "CREATE INDEX IF NOT EXISTS ix_shift_audit_site ON shift_audit_logs(site_id)",
        "CREATE INDEX IF NOT EXISTS ix_shift_audit_plan ON shift_audit_logs(rota_plan_id)",
        # Lone worker: the sweep scans active sessions and open incidents every minute,
        # and the audit report reads "this company, this date window".
        "CREATE INDEX IF NOT EXISTS ix_lw_sessions_status ON lone_worker_sessions(status)",
        "CREATE INDEX IF NOT EXISTS ix_lw_sessions_company_started ON lone_worker_sessions(company_id, started_at)",
        "CREATE INDEX IF NOT EXISTS ix_lw_checks_session_status ON lone_worker_checks(session_id, status)",
        "CREATE INDEX IF NOT EXISTS ix_lw_checks_due ON lone_worker_checks(due_at)",
        "CREATE INDEX IF NOT EXISTS ix_lw_incidents_status ON lone_worker_incidents(status)",
        "CREATE INDEX IF NOT EXISTS ix_lw_incidents_company_opened ON lone_worker_incidents(company_id, opened_at)",
        "CREATE INDEX IF NOT EXISTS ix_lw_events_company_created ON lone_worker_events(company_id, created_at)",
        "CREATE INDEX IF NOT EXISTS ix_lw_events_session ON lone_worker_events(session_id)",
        "CREATE INDEX IF NOT EXISTS ix_lw_events_incident ON lone_worker_events(incident_id)",
        "CREATE INDEX IF NOT EXISTS ix_email_logs_company ON email_logs(company_id)",
        "CREATE INDEX IF NOT EXISTS ix_sms_logs_company ON sms_logs(company_id)",
        # Permission resolution runs on every guarded request.
        "CREATE INDEX IF NOT EXISTS ix_role_module_perms_role ON role_module_permissions(role_id)",
        "CREATE INDEX IF NOT EXISTS ix_users_company ON users(company_id)",
        "CREATE INDEX IF NOT EXISTS ix_users_role ON users(role_id)",
        # Portal site pins are resolved on every scoped portal query.
        "CREATE INDEX IF NOT EXISTS ix_user_sites_user ON user_sites(user_id)",
        "CREATE INDEX IF NOT EXISTS ix_user_sites_site ON user_sites(site_id)",
        "CREATE INDEX IF NOT EXISTS ix_user_sites_company ON user_sites(company_id)",
    ):
        try:
            cur.execute(statement)
        except sqlite3.OperationalError:
            # Table not present on this database yet — created later by create_all.
            pass

    # --- Incident categories + emergency services called ------------------------------
    # Added with the Incident Reports Summary. Existing rows default to "other" so the
    # matrix still totals correctly against the raw incident count.
    if table_exists(cur, "incidents"):
        for col, ddl in (
            ("category", "TEXT DEFAULT 'other'"),
            ("police_called", "BOOLEAN DEFAULT 0"),
            ("ambulance_called", "BOOLEAN DEFAULT 0"),
            ("fire_brigade_called", "BOOLEAN DEFAULT 0"),
        ):
            if not column_exists(cur, "incidents", col):
                cur.execute(f"ALTER TABLE incidents ADD COLUMN {col} {ddl}")
        cur.execute("UPDATE incidents SET category = 'other' WHERE category IS NULL OR category = ''")
        try:
            cur.execute("CREATE INDEX IF NOT EXISTS ix_incidents_category ON incidents(category)")
        except sqlite3.OperationalError:
            pass

    # --- Accident report log (digital X-FORM-077) -------------------------------------
    if not table_exists(cur, "accident_reports"):
        cur.execute(
            """CREATE TABLE accident_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            site_id INTEGER REFERENCES sites(id),
            client_id INTEGER REFERENCES clients(id),
            guard_id INTEGER REFERENCES guards(id),
            created_by_user_id INTEGER NOT NULL REFERENCES users(id),
            reference TEXT,
            report_date DATE NOT NULL,
            supervisor_name TEXT NOT NULL,
            sia_number TEXT,
            accident_type TEXT,
            accident_time TEXT,
            accident_location TEXT,
            persons_involved TEXT,
            police_informed BOOLEAN DEFAULT 0,
            police_time_informed TEXT,
            police_time_attended TEXT,
            police_time_left TEXT,
            fire_informed BOOLEAN DEFAULT 0,
            fire_time_informed TEXT,
            fire_time_attended TEXT,
            fire_time_left TEXT,
            ambulance_informed BOOLEAN DEFAULT 0,
            ambulance_time_informed TEXT,
            ambulance_time_attended TEXT,
            ambulance_time_left TEXT,
            comments TEXT,
            status TEXT DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )"""
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS ix_accident_reports_company ON accident_reports(company_id)",
            "CREATE INDEX IF NOT EXISTS ix_accident_reports_site ON accident_reports(site_id)",
            "CREATE INDEX IF NOT EXISTS ix_accident_reports_ref ON accident_reports(reference)",
        ):
            cur.execute(statement)

    # --- Tasks (staff to-do list) -----------------------------------------------------
    if not table_exists(cur, "tasks"):
        cur.execute(
            """CREATE TABLE tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            guard_id INTEGER REFERENCES guards(id),
            site_id INTEGER REFERENCES sites(id),
            created_by_user_id INTEGER NOT NULL REFERENCES users(id),
            completed_by_user_id INTEGER REFERENCES users(id),
            title TEXT NOT NULL,
            description TEXT,
            priority TEXT DEFAULT 'normal',
            status TEXT DEFAULT 'todo',
            due_date DATE,
            completed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )"""
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS ix_tasks_company ON tasks(company_id)",
            "CREATE INDEX IF NOT EXISTS ix_tasks_guard ON tasks(guard_id)",
            "CREATE INDEX IF NOT EXISTS ix_tasks_status ON tasks(status)",
            "CREATE INDEX IF NOT EXISTS ix_tasks_due ON tasks(due_date)",
        ):
            cur.execute(statement)

    # --- Daily occurrences sheet ------------------------------------------------------
    if not table_exists(cur, "occurrence_sheets"):
        cur.execute(
            """CREATE TABLE occurrence_sheets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_id INTEGER NOT NULL REFERENCES companies(id),
            site_id INTEGER REFERENCES sites(id),
            client_id INTEGER REFERENCES clients(id),
            guard_id INTEGER REFERENCES guards(id),
            created_by_user_id INTEGER NOT NULL REFERENCES users(id),
            reference TEXT,
            sheet_date DATE NOT NULL,
            officer_names TEXT,
            shift_start TEXT,
            shift_end TEXT,
            signature_name TEXT,
            status TEXT DEFAULT 'open',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )"""
        )
        for statement in (
            "CREATE INDEX IF NOT EXISTS ix_occ_sheets_company ON occurrence_sheets(company_id)",
            "CREATE INDEX IF NOT EXISTS ix_occ_sheets_site ON occurrence_sheets(site_id)",
            "CREATE INDEX IF NOT EXISTS ix_occ_sheets_date ON occurrence_sheets(sheet_date)",
        ):
            cur.execute(statement)
    if not table_exists(cur, "occurrence_entries"):
        cur.execute(
            """CREATE TABLE occurrence_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sheet_id INTEGER NOT NULL REFERENCES occurrence_sheets(id),
            serial_no INTEGER NOT NULL DEFAULT 1,
            start_time TEXT,
            finish_time TEXT,
            occurrence TEXT,
            action_taken TEXT
        )"""
        )
        cur.execute("CREATE INDEX IF NOT EXISTS ix_occ_entries_sheet ON occurrence_entries(sheet_id)")

    conn.commit()
    conn.close()
    try:
        from app.database import SessionLocal
        from app.services.role_service import backfill_user_roles
        from app.services.module_service import ensure_app_modules, backfill_role_module_permissions
        from app.models import Role
        from app.rbac_matrix import default_matrix_client_portal, default_matrix_staff_portal, default_matrix_supervisor, wrap_matrix

        db = SessionLocal()
        try:
            ensure_app_modules(db)
            db.commit()
            backfill_user_roles(db)
            backfill_role_module_permissions(db)
            for role in db.query(Role).all():
                if role.slug == "client":
                    role.permissions_json = wrap_matrix(default_matrix_client_portal())
                elif role.slug == "staff":
                    role.permissions_json = wrap_matrix(default_matrix_staff_portal())
                elif role.slug == "supervisor":
                    from app.services.role_service import matrix_from_permissions_json

                    m = matrix_from_permissions_json(role.permissions_json) or default_matrix_supervisor()
                    m["staff_requests"] = {"view": True, "create": False, "edit": True, "delete": False}
                    m["patrol"] = {"view": True, "create": True, "edit": True, "delete": False}
                    m["incidents"] = {"view": True, "create": True, "edit": True, "delete": False}
                    m["lone_worker"] = {"view": True, "create": True, "edit": True, "delete": False}
                    role.permissions_json = wrap_matrix(m)
            db.commit()
            backfill_role_module_permissions(db)
        finally:
            db.close()
    except Exception as e:
        import logging

        logging.getLogger(__name__).warning("RBAC backfill failed: %s", e)

if __name__ == "__main__":
    run()
