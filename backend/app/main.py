from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, guards, sites, assignments, clients, sub_contractors, main_contractors, email
from app.routers import subscriptions, documents, rates, allowances, attendance, payroll, invoices, payments, reports, admin, roles, users, special_days, contractors
from app.database import engine, Base
from app.config import settings

try:
    from migrate_db import run as run_migrate
    run_migrate()
except Exception:
    pass
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SecureForce Manager", version="1.0.0")

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
app.include_router(roles.router)
app.include_router(users.router)
app.include_router(contractors.router)

@app.get("/")
def root():
    return {"message": "SecureForce Manager API"}
