from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, guards, sites, assignments, clients, sub_contractors, email
from app.database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Security Agency SAAS", version="1.0.0")

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

@app.get("/")
def root():
    return {"message": "Security Agency SAAS API"}
