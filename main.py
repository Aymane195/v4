from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine
from app.models import Base
from app.routers import fusionsolar, auth, client, employee, soiling

# Create all DB tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Solar AI Monitoring Platform",
    description="Solar plant monitoring with FusionSolar API integration and AI-based soiling detection.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(client.router)
app.include_router(employee.router)
app.include_router(soiling.router)
app.include_router(fusionsolar.router)


@app.get("/")
def root():
    return {"status": "ok", "docs": "/docs"}
