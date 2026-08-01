import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, guards, sites, assignments, clients, sub_contractors, main_contractors, email, rota_plans, staff_requests
from app.routers import subscriptions, documents, rates, allowances, attendance, payroll, invoices, payments, reports, admin, roles, users, special_days, contractors, receipts, company, expenses, sms, leads, marketing, stripe_billing, billing, portal, patrol, incidents, modules
from app.middleware.api_usage import ApiUsageMiddleware
from app.database import engine, Base
from app.config import settings
from app.openapi import configure_openapi

def _ensure_db():
    if settings.database_url.startswith("sqlite"):
        path = settings.database_url.replace("sqlite:///", "").split("?")[0]
        if path and not os.path.isabs(path):
            path = os.path.abspath(path)
        if path:
            parent = os.path.dirname(path)
            if parent:
                os.makedirs(parent, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    from migrate_db import run as run_migrate
    run_migrate()

if os.getenv("CONTROL_OPS_SKIP_DB_INIT") != "1":
    _ensure_db()

app = FastAPI(
    title="ControlOps API",
    version="1.0.0",
    description=(
        "API for ControlOps web and mobile clients. In Swagger, select **Authorize** "
        "and enter the user's email in the Username field plus their password. "
        "Other clients sign in with `POST /auth/login` and send the returned Bearer JWT."
    ),
    docs_url="/swagger/",
    redoc_url=None,
    openapi_url="/swagger/openapi.json",
    swagger_ui_parameters={
        "docExpansion": "none",
        "defaultModelsExpandDepth": -1,
        "displayRequestDuration": True,
        "filter": True,
        "persistAuthorization": True,
    },
    servers=[
        {"url": "/api", "description": "Production same-origin API proxy"},
        {"url": "http://localhost:8000", "description": "Local development"},
    ],
)
configure_openapi(app)
app.add_middleware(ApiUsageMiddleware)

origins = [o.strip() for o in settings.cors_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(guards.router)
app.include_router(sites.router)
app.include_router(assignments.router)
app.include_router(rota_plans.router)
app.include_router(staff_requests.router)
app.include_router(clients.router)
app.include_router(sub_contractors.router)
app.include_router(main_contractors.router)
app.include_router(email.router)
app.include_router(subscriptions.router)
app.include_router(documents.router)
app.include_router(documents.legacy_router)
app.include_router(rates.router)
app.include_router(allowances.router)
app.include_router(special_days.router)
app.include_router(attendance.router)
app.include_router(payroll.router)
app.include_router(invoices.router)
app.include_router(payments.router)
app.include_router(reports.router)
app.include_router(admin.router)
app.include_router(receipts.router)
app.include_router(roles.router)
app.include_router(modules.router)
app.include_router(users.router)
app.include_router(contractors.router)
app.include_router(company.router)
app.include_router(expenses.router)
app.include_router(sms.router)
app.include_router(leads.router)
app.include_router(marketing.router)
app.include_router(stripe_billing.router)
app.include_router(billing.router)
app.include_router(portal.router)
app.include_router(patrol.router)
app.include_router(incidents.router)

# The uploads directory is deliberately NOT mounted as static files. It holds guard
# documents, incident photos and patrol scans, so serving it publicly would let anyone
# holding a URL read another tenant's files with no login and no permission check.
# Every upload is reachable only through an authenticated, tenant-scoped route:
#   guard documents   -> GET /documents/{doc_id}/file
#   incident photos   -> GET /incidents/{incident_id}/attachments/{attachment_id}/file
#   patrol scans      -> GET /patrol/logs/{log_id}/photo
#   company logo      -> GET /auth/company-logo
#   guard photo       -> GET /guards/{guard_id}/photo
_uploads = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")
os.makedirs(_uploads, exist_ok=True)

@app.get("/")
def root():
    return {"message": "ControlOps API"}
