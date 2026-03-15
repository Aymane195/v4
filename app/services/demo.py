"""
Demo account seeding and fake data generation.
All KPI values are time-of-day aware and randomized on each call.
"""
import random
import math
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

DEMO_CLIENT_EMAIL    = "demo@solar.ma"
DEMO_CLIENT_PASSWORD = "demo123"
DEMO_EMPLOYEE_EMAIL    = "employe@solar.ma"
DEMO_EMPLOYEE_PASSWORD = "demo123"
DEMO_STATION_CODE = "DEMO-STATION-001"
DEMO_STATION_NAME = "Installation Démo — Casablanca"


def is_demo(station_code: str) -> bool:
    return station_code == DEMO_STATION_CODE


# ── Helpers ───────────────────────────────────────────────────────────────────

def _solar_factor() -> float:
    """0–1 bell curve peaking at 13:00, zero outside 6h–20h."""
    hour = datetime.now().hour + datetime.now().minute / 60
    if hour < 6 or hour > 20:
        return 0.0
    return max(0.0, math.exp(-0.5 * ((hour - 13) / 3.5) ** 2))


# ── KPI generators ────────────────────────────────────────────────────────────

def realtime_kpi() -> dict:
    factor   = _solar_factor()
    capacity = round(random.uniform(9, 14), 1)          # kWp installed
    power    = round(capacity * factor * random.uniform(0.82, 0.98), 2) if factor > 0.05 else 0
    elapsed  = max(0, datetime.now().hour - 6)
    day_pwr  = round(power * elapsed * 0.6 * random.uniform(0.9, 1.1), 2) if power > 0 else round(random.uniform(0, 8), 2)
    total    = round(random.uniform(9000, 16000), 2)
    radiation = round(1000 * factor * random.uniform(0.78, 1.02), 1) if factor > 0.05 else 0

    return {
        "success": True,
        "data": [{
            "stationCode": DEMO_STATION_CODE,
            "dataItemMap": {
                "inverter_power":      power if power > 0 else None,
                "day_power":           day_pwr,
                "total_power":         total,
                "month_power":         round(random.uniform(160, 480), 1),
                "use_power":           round(random.uniform(0.5, 3.0), 2) if power > 0 else None,
                "day_use_energy":      round(random.uniform(4, 18), 2),
                "day_on_grid_energy":  round(day_pwr * random.uniform(0.2, 0.55), 2),
                "day_income":          round(day_pwr * 1.5, 2),
                "total_income":        round(total * 1.5, 2),
                "real_health_state":   3,
                "performance_ratio":   round(random.uniform(0.78, 0.96), 3),
                "radiation_intensity": radiation if radiation > 0 else None,
                "installed_capacity":  capacity,
            },
        }],
    }


def daily_kpi(date_str: str) -> dict:
    """Seeded by date so the same day always returns the same value."""
    random.seed(date_str)
    month    = int(date_str[5:7])
    seasonal = 0.5 + 0.5 * math.cos(math.pi * (month - 7) / 6)
    day_pwr  = round(random.uniform(15, 85) * seasonal, 1)
    random.seed()
    return {"success": True, "data": [{"stationCode": DEMO_STATION_CODE, "dataItemMap": {"day_power": day_pwr}}]}


def monthly_kpi(month_str: str) -> dict:
    """Seeded by month so the same month always returns the same value."""
    random.seed(month_str)
    month     = int(month_str[5:7])
    seasonal  = 0.5 + 0.5 * math.cos(math.pi * (month - 7) / 6)
    month_pwr = round(random.uniform(120, 380) * (0.5 + seasonal), 1)
    random.seed()
    return {"success": True, "data": [{"stationCode": DEMO_STATION_CODE, "dataItemMap": {"month_power": month_pwr}}]}


def soiling() -> dict:
    index = round(random.uniform(0.01, 0.14), 4)
    if index < 0.02:
        status, rec = "clean", "Panneaux propres. Aucune action requise."
    elif index < 0.05:
        status, rec = "light_soiling", "Légère poussière. Nettoyage recommandé dans 2 semaines."
    elif index < 0.10:
        status, rec = "moderate_soiling", "Encrassement modéré. Nettoyage recommandé cette semaine."
    else:
        status, rec = "heavy_soiling", "Encrassement important. Nettoyage immédiat recommandé."
    return {
        "soiling_index": index,
        "energy_loss_percent": round(index * 100, 2),
        "status": status,
        "recommendation": rec,
    }


_ALARM_POOL = [
    {"alarmName": "Surtension CA", "devName": "Onduleur 1", "lev": 2,
     "alarmCause": "Tension réseau supérieure au seuil autorisé",
     "alarmSuggest": "Vérifier la tension du réseau électrique et contacter le fournisseur"},
    {"alarmName": "Température élevée onduleur", "devName": "Onduleur 1", "lev": 3,
     "alarmCause": "Température interne supérieure à 85°C",
     "alarmSuggest": "Vérifier la ventilation du local et nettoyer les filtres"},
    {"alarmName": "Défaut communication compteur", "devName": "Compteur 1", "lev": 4,
     "alarmCause": "Perte de communication RS485 avec le compteur",
     "alarmSuggest": "Vérifier le câblage RS485 et redémarrer le compteur"},
    {"alarmName": "Production faible — String 3", "devName": "String 3", "lev": 3,
     "alarmCause": "Production inférieure à 60% du théorique",
     "alarmSuggest": "Inspecter les panneaux et connexions du string 3"},
    {"alarmName": "Perte de réseau", "devName": "Onduleur 1", "lev": 1,
     "alarmCause": "Coupure réseau détectée, onduleur en attente",
     "alarmSuggest": "Attendre le retour du réseau ou contacter le fournisseur"},
]


def alarms() -> list:
    now_ms = int(datetime.now().timestamp() * 1000)
    count  = random.randint(0, 3)
    picked = random.sample(_ALARM_POOL, min(count, len(_ALARM_POOL)))
    for i, a in enumerate(picked):
        a = dict(a)
        a["raiseTime"] = now_ms - random.randint(1800, 86400) * 1000
        a["status"] = 1
        a["station_name"] = DEMO_STATION_NAME
        a["station_code"] = DEMO_STATION_CODE
        picked[i] = a
    return picked


def device_kpi() -> dict:
    factor = _solar_factor()
    return {
        "success": True,
        "data": [{
            "dataItemMap": {
                "temperature": round(random.uniform(38, 68), 1) if factor > 0.1 else round(random.uniform(20, 38), 1),
                "efficiency":  round(random.uniform(0.93, 0.98), 3) if factor > 0.1 else None,
            }
        }],
    }


# ── Account seeding ───────────────────────────────────────────────────────────

def seed_demo_accounts():
    """Auto-create demo client + employee accounts on startup if not present."""
    from app.database import SessionLocal
    from app.models import User, UserRole, ClientStation
    from app.auth import hash_password

    db = SessionLocal()
    try:
        if not db.query(User).filter_by(email=DEMO_CLIENT_EMAIL).first():
            client = User(
                email=DEMO_CLIENT_EMAIL,
                password_hash=hash_password(DEMO_CLIENT_PASSWORD),
                full_name="Client Démo",
                role=UserRole.client,
            )
            db.add(client)
            db.flush()
            db.add(ClientStation(
                client_id=client.id,
                station_code=DEMO_STATION_CODE,
                station_name=DEMO_STATION_NAME,
            ))
            logger.info("[demo] demo client created")

        if not db.query(User).filter_by(email=DEMO_EMPLOYEE_EMAIL).first():
            db.add(User(
                email=DEMO_EMPLOYEE_EMAIL,
                password_hash=hash_password(DEMO_EMPLOYEE_PASSWORD),
                full_name="Employé Démo",
                role=UserRole.employee,
            ))
            logger.info("[demo] demo employee created")

        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"[demo] seed failed: {e}")
    finally:
        db.close()
