# Product requirements vs current codebase

Status: **Done** (shipped in repo) · **Partial** · **Not started**

Use this as the master backlog.

## SaaS foundations implemented in repo (baseline)

- **Plan tiers** (`basic` / `starter` alias, `standard`, `premium`, `enterprise`): max guards/sites and feature flags in `backend/app/plan_config.py`; enforced on create guard/site and sub-contractor APIs.
- **RBAC**: role → permission codes in `backend/app/rbac.py`; roles `super_admin`, `company_admin`, `manager`, `supervisor`; all protected routers use `require_perm(...)`.
- **`GET /auth/me`**: returns `permissions[]` and `plan` (usage + features) for the UI (`UserMeResponse`).
- **Audit trail**: `audit_logs` table + writes on guard/site create/update/delete (`backend/app/services/audit_service.py`).
- **Guard DBS field**: `dbs_status` on guard model + API + form column.
- **Frontend**: `lib/permissions.ts` (`can()`), `lib/date-format.ts` (DD-MM-YYYY display), nav hides Sub-Contractors when plan excludes it; guards page respects delete/write permissions.

---

## 1. User access & CRUD permissions

| Item | Status | Notes |
|------|--------|--------|
| Per-entity view/edit/delete for companies, guards, clients, sub-contractors | **Partial** | Tenant CRUD exists; **RBAC** added with role → permission codes on API routes. Company record still edited mainly via subscription/admin flows. |
| RBAC (Admin, Manager, Supervisor, …) | **Partial** | Roles: `super_admin`, `company_admin`, `manager`, `supervisor` enforced on backend. **Client** / **sub-contractor portal users** not modeled yet. |
| Permission matrix | **Partial** | Implemented as code in `backend/app/rbac.py`. Custom roles DB UI not built. |

## 2. Flexible roles & permissions module

| Item | Status | Notes |
|------|--------|--------|
| Create custom roles | **Not started** | Next step: `roles` + `role_permissions` tables per company. |
| Module-wise granular permissions | **Partial** | Granular codes exist; assign via DB/UI pending. |
| Restrict per company/site/user | **Partial** | Company isolation done; site/user scoping not done. |

## 3. Guard profile (UK compliance)

| Item | Status | Notes |
|------|--------|--------|
| Personal details | **Partial** | Name, contact, address on `Guard`. |
| 5-year work history (structured) | **Partial** | `employment_history` text only; no timeline UI/validation. |
| RTW / visa, SIA, DBS | **Partial** | SIA, visa, RTW fields exist; **DBS** field missing. |
| SIA expiry alerts | **Partial** | Compliance report exists; **no automated 30/7-day jobs**. |
| Emergency contact | **Not started** | |
| Training certificates | **Not started** | Documents generic; no certificate type workflow. |
| Photo upload | **Not started** | |
| Passport / visa / SIA documents | **Partial** | Guard documents + file path; upload pipeline depends on storage config. |

## 4–5. Sub-contractor hierarchy & availability

| Item | Status | Notes |
|------|--------|--------|
| Main vs sub-contractor hierarchy, contracts, deployment graph | **Not started** | Sub-contractors are flat records under one company. |
| Real-time availability by area/city/site + status filters | **Not started** | Rota/assignments exist; no availability engine or map. |

## 6. Rota / scheduling

| Item | Status | Notes |
|------|--------|--------|
| Site-wise rota, guard shifts | **Partial** | Assignments + rota UI. |
| Weekly/monthly views | **Partial** | Depends on current UI depth. |
| PDF export | **Not started** | |
| Auto conflict / double-booking prevention | **Not started** | |

## 7. Additional staff (housekeeping / cleaning)

| Item | Status | Notes |
|------|--------|--------|
| Separate staff type + same rota | **Not started** | Only `Guard` model. |

## 8. Hours, timesheets, invoices

| Item | Status | Notes |
|------|--------|--------|
| Site/client hours, editable timesheets | **Partial** | Hours from assignments; no dedicated timesheet editor. |
| Overtime / billable split | **Not started** | |
| Auto invoice per client/site/range | **Partial** | Generate from assignments exists. |
| Editable invoice, PDF, email | **Partial** | CRUD/status; **PDF/email send** not fully productized. |

## 9. Reports

| Item | Status | Notes |
|------|--------|--------|
| Full report suite from spec | **Partial** | Dashboard + compliance; **plan-gated** reporting can be extended per tier. |

## 10. Attendance (live)

| Item | Status | Notes |
|------|--------|--------|
| Check-in/out, late, no-show, statuses | **Partial** | Booking on/off + status field; not “live ops” grade. |

## 11. SIA expiry alerts (automated)

| Item | Status | Notes |
|------|--------|--------|
| 30d / 7d / expired + email/SMS/dashboard | **Not started** | Needs scheduler + notification service. |

## 12. Date format DD-MM-YYYY

| Item | Status | Notes |
|------|--------|--------|
| System-wide | **Partial** | `frontend/lib/date-format.ts` helper added; **apply across all screens/exports** incrementally. |

## 13. Pricing & packages (SaaS)

| Item | Status | Notes |
|------|--------|--------|
| Starter / Standard / Premium | **Partial** | Tiers: `basic`, `standard`, `premium`, `enterprise` (+ `starter` alias). **Enforced:** max guards/sites + feature flags (e.g. sub-contractors on Standard+). |
| Lock features by plan | **Partial** | Expand `plan_config.py` as you add modules. |

## 14–20. Mobile, incidents, GPS, client portal, audit, payroll export, notifications

| Item | Status |
|------|--------|
| Mobile app | **Not started** |
| Incident reporting | **Not started** |
| GPS / geofencing | **Not started** |
| Client portal | **Not started** |
| Audit log (full activity) | **Partial** — `audit_logs` + writes on key mutations (extend coverage). |
| Payroll integration export | **Partial** — payroll records; **no third-party export**. |
| Email/SMS/WhatsApp notifications | **Partial** — email utility exists; not wired to all events. |

## 21. Main / sub-contractor separation module

| Item | Status | Notes |
|------|--------|--------|
| Dual relationship, dashboards, deployment traceability | **Not started** | Requires new domain model (contracts, parties, guard supply links). |

## 22. Client module (bookings, approval, calendar)

| Item | Status | Notes |
|------|--------|--------|
| Client booking lifecycle, calendar, approvals | **Not started** | Clients exist for billing/sites; no client login or booking entity. |

---

## Recommended implementation order (engineering)

1. **SaaS core (done in this pass):** plan quotas, feature flags, RBAC on APIs, audit log seed, `/auth/me` + permissions for UI.  
2. **Compliance:** DBS fields, structured work history, scheduled SIA jobs + notification templates.  
3. **Rota hardening:** conflict detection, PDF export.  
4. **Client portal + bookings:** `client_users`, `bookings`, approval workflow, link to assignments.  
5. **Contractor hierarchy:** `contract_party`, `staffing_agreement`, guard deployment source.  
6. **Mobile / GPS / incidents:** new services + optional native app.
