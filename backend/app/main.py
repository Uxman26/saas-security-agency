from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, guards, sites, assignments, clients, sub_contractors, email
from app.routers import subscriptions, documents, rates, allowances, attendance, payroll, invoices, payments, reports
from app.database import engine, Base

try:
    from migrate_db import run as run_migrate
    run_migrate()
except Exception:
    pass
Base.metadata.create_all(bind=engine)

app = FastAPI(title="SecureForce Manager", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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
app.include_router(email.router)
app.include_router(subscriptions.router)
app.include_router(documents.router)
app.include_router(rates.router)
app.include_router(allowances.router)
app.include_router(attendance.router)
app.include_router(payroll.router)
app.include_router(invoices.router)
app.include_router(payments.router)
app.include_router(reports.router)

@app.get("/")
def root():
    return {"message": "SecureForce Manager API"}
