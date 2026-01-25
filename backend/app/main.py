from fastapi import FastAPI
from app.routers import auth, guards, sites, assignments, clients, sub_contractors
from app.database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Security Agency SAAS", version="1.0.0")

app.include_router(auth.router)
app.include_router(guards.router)
app.include_router(sites.router)
app.include_router(assignments.router)
app.include_router(clients.router)
app.include_router(sub_contractors.router)

@app.get("/")
def root():
    return {"message": "Security Agency SAAS API"}
