# ControlOps API reference

This file is generated from `docs/openapi.json`; do not edit it manually.

- Production base URL: `https://controlops.co.uk/api`
- Interactive documentation: `https://controlops.co.uk/swagger/`
- Authentication: `Authorization: Bearer <access_token>`
- Obtain a token with `POST /auth/login`.

Every JSON error uses `{"detail": ...}`. Validation failures return HTTP 422. Protected operations can also return 401, 402, or 403.

## Admin

### `GET /admin/dashboard`

Admin Dashboard

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `GET /admin/companies`

List All Companies

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `GET /admin/companies/{company_id}`

Get Company

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PATCH /admin/companies/{company_id}`

Patch Company

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `PATCH /admin/companies/{company_id}/modules`

Patch Company Modules

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `GET /admin/users`

List Users

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `PATCH /admin/users/{user_id}/active`

Patch User Active

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `GET /admin/invoices`

List Invoices

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /admin/invoices/{invoice_id}`

Get Invoice

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PATCH /admin/invoices/{invoice_id}/status`

Patch Invoice Status

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /admin/invoices/{invoice_id}/payment`

Record Invoice Payment

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /admin/invoices/{invoice_id}/send-email`

Send Invoice Email

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /admin/invoices/generate`

Generate Invoices

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 500

### `GET /admin/payments`

List Payments

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /admin/packages`

List Packages

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `PATCH /admin/packages/{tier}`

Patch Package

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `GET /admin/smtp`

Get Smtp

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `PATCH /admin/smtp`

Patch Smtp

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `GET /admin/settings/billing`

Get Billing Settings

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `PATCH /admin/settings/billing`

Patch Billing Settings

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `POST /admin/stripe/sync-plans`

Sync Stripe Plans

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 500

### `POST /admin/coupons`

Create Coupon

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `GET /admin/receipts`

List Receipts

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `POST /admin/receipts/{receipt_id}/mark-paid`

Mark Paid

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `GET /admin/login-logs`

Login Logs

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /admin/admins`

List Admins

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `GET /admin/admins/{user_id}`

Get Admin

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PATCH /admin/admins/{user_id}/sidebar`

Patch Sidebar

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /admin/admins/{user_id}/reset-password`

Reset Password

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

## Allowances

### `GET /allowances`

List Allowances

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `POST /allowances`

Create Allowance

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /allowances/{allowance_id}`

Get Allowance

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PUT /allowances/{allowance_id}`

Update Allowance

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /allowances/{allowance_id}`

Delete Allowance

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

## Assignments

### `GET /assignments`

Get Assignments

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /assignments`

Create Assignment

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /assignments/rota/detail`

Get Rota Detail

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /assignments/rota/summary`

Get Rota Summary

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /assignments/rota/export`

Export Rota

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /assignments/rota`

Get Rota

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /assignments/by-shift/overtime`

Record Shift Overtime

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `POST /assignments/by-shift/early-finish`

Record Shift Early Finish

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `POST /assignments/by-shift/lateness`

Record Shift Lateness

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `GET /assignments/{assignment_id}`

Get Assignment

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PUT /assignments/{assignment_id}`

Update Assignment

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /assignments/{assignment_id}`

Delete Assignment

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `POST /assignments/{assignment_id}/overtime`

Record Assignment Overtime

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /assignments/{assignment_id}/early-finish`

Record Assignment Early Finish

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /assignments/{assignment_id}/lateness`

Record Assignment Lateness

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

## Attendance

### `GET /attendance`

List Attendance All

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /attendance`

Create Attendance

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `POST /attendance/book`

Book On Off

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `POST /attendance/by-shift`

Upsert By Shift

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `GET /attendance/assignment/{assignment_id}`

List Attendance

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `GET /attendance/late`

Late Summary

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `PUT /attendance/{attendance_id}`

Update Attendance

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /attendance/{attendance_id}`

Delete Attendance

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

## Auth

### `POST /auth/signup`

Signup

- Access: Public
- Documented responses: 201, 400, 409, 422, 500

### `POST /auth/login`

Login

- Access: Public
- Documented responses: 200, 400, 409, 422, 500

### `POST /auth/forgot-password`

Forgot Password

- Access: Public
- Documented responses: 200, 400, 409, 422, 500

### `POST /auth/reset-password`

Reset Password

- Access: Public
- Documented responses: 200, 400, 409, 422, 500

### `POST /auth/verify-email`

Verify Email

- Access: Public
- Documented responses: 200, 400, 409, 422, 500

### `POST /auth/resend-verification`

Resend Verification

- Access: Public
- Documented responses: 200, 400, 409, 422, 500

### `GET /auth/me`

Get Me

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `GET /auth/company-logo`

Company Logo

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

## Billing

### `GET /billing/receipts`

List Receipts

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `GET /billing/receipts/{receipt_id}`

Get Receipt

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

## Clients

### `GET /clients`

Get Clients

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `POST /clients`

Create Client

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /clients/{client_id}`

Get Client

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PUT /clients/{client_id}`

Update Client

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /clients/{client_id}`

Delete Client

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `POST /clients/{client_id}/renew`

Renew Client Contract

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `GET /clients/{client_id}/renewals`

List Client Renewals

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

## Company

### `GET /company/profile`

Get Profile

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `PATCH /company/profile`

Patch Profile

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `POST /company/logo`

Upload Logo

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

## Contractors

### `GET /contractors/assignments`

List Assignments

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /contractors/assignments`

Create Assignment Route

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `DELETE /contractors/assignments/{assignment_id}`

Delete Assignment Route

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `GET /contractors`

List Contractors Route

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /contractors`

Create Contractor Route

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /contractors/{contractor_id}`

Get Contractor Route

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PATCH /contractors/{contractor_id}`

Update Contractor Route

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /contractors/{contractor_id}/deactivate`

Deactivate Contractor Route

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

## Documents

### `GET /documents`

List Documents

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /documents`

Create Document

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `POST /documents/upload`

Upload Documents

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /documents/{doc_id}/file`

Download Document

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `DELETE /documents/{doc_id}`

Delete Document

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `GET /guards/{guard_id}/documents`

List Documents Legacy

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `POST /guards/{guard_id}/documents`

Create Document Legacy

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /guards/{guard_id}/documents/upload`

Upload Documents Legacy

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /guards/{guard_id}/documents/{doc_id}`

Delete Document Legacy

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

## Email

### `GET /email/config`

Get Config

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500, 503

### `PATCH /email/config`

Patch Config

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500, 503

### `POST /email/send`

Send Email

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500, 503

### `POST /email/test`

Test Email

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500, 503

### `GET /email/logs`

Email Logs

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500, 503

## Expenses

### `GET /expenses/meta`

Expense Meta

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `GET /expenses/dashboard`

Dashboard

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /expenses/reports/expenses`

Expense Report

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /expenses/reports/vat`

Vat Report

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /expenses`

List Expenses

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /expenses`

Create Expense

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /expenses/{expense_id}`

Get Expense

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PUT /expenses/{expense_id}`

Update Expense

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /expenses/{expense_id}`

Delete Expense

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `GET /expenses/{expense_id}/document`

Download Document

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `POST /expenses/{expense_id}/document`

Upload Document

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /expenses/{expense_id}/document`

Remove Document

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

## Guards

### `GET /guards`

Get Guards

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /guards`

Create Guard

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /guards/{guard_id}`

Get Guard

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PUT /guards/{guard_id}`

Update Guard

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /guards/{guard_id}`

Delete Guard

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `GET /guards/{guard_id}/photo`

Get Guard Photo

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `POST /guards/{guard_id}/photo`

Upload Guard Photo

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

## Invoices

### `GET /invoices`

List Invoices

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /invoices`

Create Invoice

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `POST /invoices/generate`

Generate Invoice

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `GET /invoices/{invoice_id}/audit`

Invoice Audit

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `GET /invoices/{invoice_id}/pdf`

Invoice Pdf

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `GET /invoices/{invoice_id}`

Get Invoice

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PATCH /invoices/{invoice_id}`

Patch Invoice

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /invoices/{invoice_id}`

Delete Invoice

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `PUT /invoices/{invoice_id}/lines/{line_id}`

Update Line

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /invoices/{invoice_id}/lines/{line_id}`

Delete Line

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `POST /invoices/{invoice_id}/duplicate`

Duplicate Invoice

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 404, 409, 422, 500

### `PATCH /invoices/{invoice_id}/status`

Update Status

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /invoices/{invoice_id}/lines`

Add Line

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 404, 409, 422, 500

## Leads

### `GET /leads/statuses`

List Statuses

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `POST /leads/statuses`

Create Status

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `GET /leads/dashboard`

Dashboard

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /leads/check-duplicate`

Check Duplicate

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `GET /leads/filter-presets`

List Presets

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `POST /leads/filter-presets`

Save Preset

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `DELETE /leads/filter-presets/{preset_id}`

Delete Preset

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `POST /leads/push/subscribe`

Push Subscribe

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `GET /leads/follow-ups/calendar`

Follow Up Calendar

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /leads/export`

Export Leads

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /leads/notifications`

List Notifications

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /leads/notifications/{notification_id}/read`

Read Notification

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `GET /leads`

List Leads

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /leads`

Create Lead

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /leads/{lead_id}/detail`

Lead Detail

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `GET /leads/{lead_id}/documents/{doc_id}/file`

Download Document

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `GET /leads/{lead_id}`

Get Lead

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PUT /leads/{lead_id}`

Update Lead

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /leads/{lead_id}`

Delete Lead

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `POST /leads/{lead_id}/status`

Change Status

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /leads/{lead_id}/assign`

Assign Lead

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `GET /leads/{lead_id}/audit`

Lead Audit

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `POST /leads/{lead_id}/notes`

Add Note

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /leads/{lead_id}/follow-ups`

Add Follow Up

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /leads/follow-ups/{follow_up_id}/complete`

Complete Follow Up

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /leads/{lead_id}/communications`

Add Communication

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /leads/{lead_id}/convert`

Convert Lead

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /leads/{lead_id}/quotations`

Add Quotation

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /leads/{lead_id}/documents`

Upload Document

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

## Main Contractors

### `GET /main-contractors`

List Main Contractors

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `POST /main-contractors`

Create Main Contractor

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /main-contractors/{main_id}`

Get Main Contractor

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PUT /main-contractors/{main_id}`

Update Main Contractor

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /main-contractors/{main_id}`

Delete Main Contractor

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

## Marketing

### `POST /marketing/demo`

Request Demo

- Access: Public
- Documented responses: 200, 400, 409, 422, 500

## Other

### `GET /`

Root

- Access: Public
- Documented responses: 200, 500

## Payments

### `GET /payments`

List Payments

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /payments`

Create Payment

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /payments/{payment_id}`

Get Payment

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PUT /payments/{payment_id}`

Update Payment

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /payments/{payment_id}`

Delete Payment

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

## Payroll

### `GET /payroll`

List Payrolls

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /payroll`

Create Payroll

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `POST /payroll/calculate`

Calculate Payroll

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `POST /payroll/calculate-batch`

Calculate Payroll Batch

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `GET /payroll/{payroll_id}`

Get Payroll

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PUT /payroll/{payroll_id}`

Update Payroll

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /payroll/{payroll_id}`

Delete Payroll

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

## Rates

### `GET /rates/guards/{guard_id}`

List Guard Rates

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `POST /rates/guards/{guard_id}`

Create Guard Rate

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /rates/guards/{rate_id}`

Delete Guard Rate

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `GET /rates/sites/{site_id}`

List Site Rates

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `POST /rates/sites/{site_id}`

Create Site Rate

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /rates/sites/{rate_id}`

Delete Site Rate

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

## Receipts

### `GET /receipts/public/{ref_id}`

Get Public Receipt

- Access: Public
- Documented responses: 200, 404, 422, 500

## Reports

### `GET /reports/dashboard`

Dashboard Stats

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `GET /reports/compliance`

Compliance Alerts

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/contracts-expiring`

Contracts Expiring

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/hub`

Reports Hub

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/staff/shift-hours`

Staff Shift Hours

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/staff/monthly`

Staff Monthly

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/staff/{guard_id}`

Staff Individual

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `GET /reports/attendance`

Attendance Report

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/shift-overtime`

Shift Overtime Report

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/shift-early-finish`

Shift Early Finish Report

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/shift-lateness`

Shift Lateness Report

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/financial/invoices`

Financial Invoices

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/subscription/summary`

Subscription Summary

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `GET /reports/subscription/invoices`

Subscription Invoices

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/usage/logins`

Usage Logins

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/usage/summary`

Usage Summary

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `GET /reports/export/{report_type}`

Export Report

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

## Roles

### `GET /roles`

List Roles

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `POST /roles`

Create Role

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `PUT /roles/{role_id}`

Update Role

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /roles/{role_id}`

Delete Role

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

## Rotas

### `GET /rotas`

List Rotas

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `POST /rotas`

Create Rota

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `POST /rotas/{plan_id}/copy`

Copy Rota

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 404, 409, 422, 500

### `GET /rotas/{plan_id}`

Get Rota

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PATCH /rotas/{plan_id}`

Update Rota

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /rotas/{plan_id}`

Delete Rota

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `POST /rotas/{plan_id}/publish`

Publish Rota

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

## Sites

### `GET /sites`

Get Sites

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `POST /sites`

Create Site

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /sites/{site_id}`

Get Site

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PUT /sites/{site_id}`

Update Site

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /sites/{site_id}`

Delete Site

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

## Sms

### `GET /sms/config`

Get Config

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500, 503

### `PATCH /sms/config`

Patch Config

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500, 503

### `POST /sms/send`

Send Sms

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500, 503

### `GET /sms/logs`

Sms Logs

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500, 503

## Special Days

### `GET /special-days`

List Special Days

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /special-days`

Create Special Day

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `POST /special-days/seed-uk`

Seed Uk Holidays

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

### `DELETE /special-days/{day_id}`

Delete Special Day

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

## Staff Requests

### `GET /staff-requests`

List Requests

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /staff-requests`

Create Request

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `POST /staff-requests/bulk`

Create Requests Bulk

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /staff-requests/{request_id}`

Get Request

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `POST /staff-requests/{request_id}/approve`

Approve Request

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `POST /staff-requests/{request_id}/reject`

Reject Request

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

## Stripe

### `GET /stripe/config`

Stripe Config

- Access: Public
- Documented responses: 200, 500, 503

### `POST /stripe/checkout-session`

Checkout Session

- Access: Public
- Documented responses: 200, 400, 409, 422, 500, 503

### `GET /stripe/session-status`

Session Status

- Access: Public
- Documented responses: 200, 422, 500, 503

### `POST /stripe/webhook`

Stripe Webhook

- Access: Public
- Documented responses: 200, 400, 409, 422, 500, 503

### `POST /stripe/portal`

Billing Portal

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 500, 503

### `POST /stripe/preview-change`

Preview Change

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500, 503

### `POST /stripe/change-plan`

Change Plan

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500, 503

### `POST /stripe/cancel`

Cancel Sub

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 500, 503

### `POST /stripe/reactivate`

Reactivate Sub

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 500, 503

### `POST /stripe/connect/account`

Connect Account

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 500, 503

### `POST /stripe/connect/onboard`

Connect Onboard

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500, 503

## Sub Contractors

### `GET /sub-contractors`

Get Sub Contractors

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 422, 500

### `POST /sub-contractors`

Create Sub Contractor

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /sub-contractors/{sub_contractor_id}`

Get Sub Contractor

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PUT /sub-contractors/{sub_contractor_id}`

Update Sub Contractor

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /sub-contractors/{sub_contractor_id}`

Delete Sub Contractor

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

## Subscriptions

### `GET /subscriptions/packages`

List Packages

- Access: Public
- Documented responses: 200, 500

### `GET /subscriptions`

Get Subscription

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `PUT /subscriptions`

Update Subscription

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 409, 422, 500

## Users

### `GET /users`

List Company Users

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 500

### `POST /users`

Create Company User

- Access: Bearer
- Documented responses: 201, 400, 401, 402, 403, 409, 422, 500

### `GET /users/{user_id}`

Get Company User

- Access: Bearer
- Documented responses: 200, 401, 402, 403, 404, 422, 500

### `PUT /users/{user_id}`

Update Company User

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `DELETE /users/{user_id}`

Delete Company User

- Access: Bearer
- Documented responses: 204, 401, 402, 403, 404, 422, 500

### `POST /users/{user_id}/reset-password`

Reset Company User Password

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

### `PATCH /users/{user_id}/role`

Patch User Role

- Access: Bearer
- Documented responses: 200, 400, 401, 402, 403, 404, 409, 422, 500

Total operations: **259**.
