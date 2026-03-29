from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import engine
from app.models import Base
from app.routers import fusionsolar, auth, client, employee, soiling, interventions, webhook, collector

# Create all DB tables on startup
Base.metadata.create_all(bind=engine)

# Add new columns to existing users table (safe to re-run — ignores if columns exist)
from sqlalchemy import text, inspect
with engine.connect() as conn:
    inspector = inspect(engine)
    existing = {c["name"] for c in inspector.get_columns("users")}
    migrations = [
        ("phone", "VARCHAR(30)"),
        ("installation_type", "ENUM('residentielle','commerciale','industrielle')"),
        ("num_panels", "INT"),
        ("fusionsolar_username", "VARCHAR(255)"),
        ("fusionsolar_password", "VARCHAR(255)"),
        ("alert_preference", "ENUM('email','whatsapp','both') DEFAULT 'email'"),
    ]
    for col_name, col_type in migrations:
        if col_name not in existing:
            conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
    conn.commit()

# Seed demo accounts (no-op if already exist)
from app.services.demo import seed_demo_accounts
seed_demo_accounts()

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
app.include_router(interventions.router)
app.include_router(webhook.router)
app.include_router(fusionsolar.router)
app.include_router(collector.router)


# ── Scheduled data collection every 30 minutes ──────────────────────────────
from contextlib import asynccontextmanager
from apscheduler.schedulers.background import BackgroundScheduler
from app.services.collector import collect_all_stations

_scheduler = BackgroundScheduler()
_scheduler.add_job(collect_all_stations, "interval", minutes=30, id="solar_collector")


@app.on_event("startup")
def _start_scheduler():
    _scheduler.start()
    import logging
    logging.getLogger(__name__).info("[scheduler] data collector started — every 30 min")


@app.on_event("shutdown")
def _stop_scheduler():
    _scheduler.shutdown(wait=False)


@app.get("/")
def root():
    return {"status": "ok", "docs": "/docs"}
