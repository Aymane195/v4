"""
Demo account seeding and fake data generation.
All KPI values are time-of-day aware and randomized on each call.
"""
import random
import math
import logging
from datetime import datetime, timedelta, date

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
    factor   = _solar_factor()   # 0 at night (20h–6h), bell curve during the day
    capacity = round(random.uniform(9, 14), 1)          # kWp installed
    power    = round(capacity * factor * random.uniform(0.82, 0.98), 2) if factor > 0 else 0.0
    elapsed  = max(3, datetime.now().hour - 6)          # hours since sunrise for day energy
    day_pwr  = round(power * elapsed * 0.6 * random.uniform(0.9, 1.1), 2) if factor > 0 else round(random.uniform(15, 45), 2)
    total    = round(random.uniform(9000, 16000), 2)
    radiation = round(1000 * factor * random.uniform(0.78, 1.02), 1) if factor > 0 else 0.0

    return {
        "success": True,
        "data": [{
            "stationCode": DEMO_STATION_CODE,
            "dataItemMap": {
                "inverter_power":      power,
                "day_power":           day_pwr,
                "total_power":         total,
                "month_power":         round(random.uniform(160, 480), 1),
                "use_power":           round(random.uniform(0.5, 3.0), 2),
                "day_use_energy":      round(random.uniform(4, 18), 2),
                "day_on_grid_energy":  round(day_pwr * random.uniform(0.2, 0.55), 2),
                "day_income":          round(day_pwr * 1.5, 2),
                "total_income":        round(total * 1.5, 2),
                "real_health_state":   3,
                "performance_ratio":   round(random.uniform(0.78, 0.96), 3),
                "radiation_intensity": radiation,
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


def soiling(days_since_last_cleaning: int = 30) -> dict:
    """Real model prediction using typical Morocco demo parameters."""
    from app.services.soiling import predict_soiling
    dust_cycle = abs(math.sin(datetime.utcnow().timetuple().tm_yday / 30.0 * math.pi))
    days_since_rain = int(5 + 25 * dust_cycle)
    power_ratio = round(max(0.50, 0.92 - 0.30 * dust_cycle), 3)
    return predict_soiling({
        "irradiation_kwh_m2":       5.5,
        "temp_air_c":               28.0,
        "humidity_pct":             45.0,
        "wind_speed_ms":            4.5,
        "precipitation_mm":         0.0,
        "days_since_last_rain":     days_since_rain,
        "days_since_last_cleaning": days_since_last_cleaning,
        "installed_capacity_kwp":   10.0,
        "power_ratio":              power_ratio,
    })


_ALARM_POOL = [
    {"alarmName": "Surtension CA", "devName": "Onduleur 1", "lev": 2,
     "alarmCause": "Tension réseau supérieure au seuil autorisé",
     "alarmSuggest": "Vérifier la tension du réseau électrique et contacter le fournisseur"},
    {"alarmName": "Courant de fuite élevé", "devName": "Onduleur 1", "lev": 3,
     "alarmCause": "Courant résiduel supérieur au seuil de sécurité",
     "alarmSuggest": "Vérifier l'isolation des câbles DC et les connecteurs des panneaux"},
    {"alarmName": "Défaut communication compteur", "devName": "Compteur 1", "lev": 4,
     "alarmCause": "Perte de communication RS485 avec le compteur",
     "alarmSuggest": "Vérifier le câblage RS485 et redémarrer le compteur"},
    {"alarmName": "Production faible — String 3", "devName": "String 3", "lev": 3,
     "alarmCause": "Production inférieure à 60% du théorique",
     "alarmSuggest": "Inspecter les panneaux et connexions du string 3"},
    {"alarmName": "Déséquilibre tension DC", "devName": "Onduleur 1", "lev": 1,
     "alarmCause": "Écart de tension entre les strings MPPT supérieur à 20%",
     "alarmSuggest": "Vérifier les strings pour ombrage partiel ou panneau défaillant"},
]


def alarms() -> list:
    now = datetime.now()
    now_ms = int(now.timestamp() * 1000)
    count  = random.randint(1, 3)
    picked = random.sample(_ALARM_POOL, min(count, len(_ALARM_POOL)))
    result = []
    for a in picked:
        a = dict(a)
        a["raiseTime"] = now_ms - random.randint(1800, 86400) * 1000
        a["status"] = 1
        a["station_name"] = DEMO_STATION_NAME
        a["station_code"] = DEMO_STATION_CODE
        result.append(a)
    return result


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


# ── Demo interventions ────────────────────────────────────────────────────────

def _get_demo_client_id() -> int:
    """Look up the demo client's user ID."""
    from app.database import SessionLocal
    from app.models import User
    db = SessionLocal()
    try:
        user = db.query(User).filter_by(email=DEMO_CLIENT_EMAIL).first()
        return user.id if user else 1
    finally:
        db.close()


def demo_interventions(client_id: int) -> list[dict]:
    """Return 5 fake interventions at various statuses for demo display."""
    now = datetime.utcnow()
    return [
        {
            "id": 9001,
            "station_code": DEMO_STATION_CODE,
            "station_name": DEMO_STATION_NAME,
            "client_id": client_id,
            "client_name": "Client Démo",
            "alarm_name": "Encrassement détecté — Soiling Index élevé",
            "alarm_severity": 2,
            "type": "nettoyage",
            "description": "Tempête de sable hier, production en baisse de 20%. Les panneaux sont visiblement couverts de poussière.",
            "priority": "haute",
            "status": "en_attente",
            "assigned_to": None,
            "scheduled_date": None,
            "completed_date": None,
            "employee_notes": None,
            "resolution": None,
            "created_at": (now - timedelta(hours=3)).isoformat(),
        },
        {
            "id": 9002,
            "station_code": DEMO_STATION_CODE,
            "station_name": DEMO_STATION_NAME,
            "client_id": client_id,
            "client_name": "Client Démo",
            "alarm_name": "Température élevée onduleur",
            "alarm_severity": 3,
            "type": "maintenance",
            "description": "Vérification annuelle de l'onduleur demandée suite à des alertes de température répétées.",
            "priority": "normale",
            "status": "planifiee",
            "assigned_to": None,
            "scheduled_date": (now + timedelta(days=2)).date().isoformat(),
            "completed_date": None,
            "employee_notes": "Équipe terrain prévue vendredi matin. Prévoir remplacement filtre ventilation.",
            "resolution": None,
            "created_at": (now - timedelta(days=2)).isoformat(),
        },
        {
            "id": 9003,
            "station_code": DEMO_STATION_CODE,
            "station_name": DEMO_STATION_NAME,
            "client_id": client_id,
            "client_name": "Client Démo",
            "alarm_name": "Perte de réseau",
            "alarm_severity": 1,
            "type": "urgence",
            "description": "Onduleur arrêté depuis ce matin, aucune production. Coupure réseau probable.",
            "priority": "critique",
            "status": "en_cours",
            "assigned_to": None,
            "scheduled_date": now.date().isoformat(),
            "completed_date": None,
            "employee_notes": "Technicien sur site depuis 10h. Coordination avec le fournisseur d'énergie en cours.",
            "resolution": None,
            "created_at": (now - timedelta(hours=6)).isoformat(),
        },
        {
            "id": 9004,
            "station_code": DEMO_STATION_CODE,
            "station_name": DEMO_STATION_NAME,
            "client_id": client_id,
            "client_name": "Client Démo",
            "alarm_name": "Encrassement modéré détecté",
            "alarm_severity": 3,
            "type": "nettoyage",
            "description": "Baisse progressive de rendement observée sur les 2 dernières semaines.",
            "priority": "normale",
            "status": "terminee",
            "assigned_to": None,
            "scheduled_date": (now - timedelta(days=2)).date().isoformat(),
            "completed_date": (now - timedelta(days=1)).isoformat(),
            "employee_notes": "Nettoyage effectué par équipe Casablanca.",
            "resolution": "Nettoyage haute pression effectué sur 24 panneaux. Rendement rétabli à 97%. Prochaine inspection dans 3 mois.",
            "created_at": (now - timedelta(days=5)).isoformat(),
        },
        {
            "id": 9005,
            "station_code": DEMO_STATION_CODE,
            "station_name": DEMO_STATION_NAME,
            "client_id": client_id,
            "client_name": "Client Démo",
            "alarm_name": "Inspection périodique",
            "alarm_severity": 4,
            "type": "inspection",
            "description": "Inspection de routine demandée par le client.",
            "priority": "basse",
            "status": "cloturee",
            "assigned_to": None,
            "scheduled_date": (now - timedelta(days=9)).date().isoformat(),
            "completed_date": (now - timedelta(days=8)).isoformat(),
            "employee_notes": "Visite effectuée. Tous les composants en bon état.",
            "resolution": "RAS — installation conforme. Câblage vérifié, connecteurs en bon état, onduleur fonctionnel.",
            "created_at": (now - timedelta(days=12)).isoformat(),
        },
    ]


# ── Demo soiling alerts ───────────────────────────────────────────────────────

def demo_soiling_alerts() -> list[dict]:
    """Derive soiling alerts from soiling() — single source of truth with the gauge."""
    result = soiling()
    severity = result["status"]

    if severity == "clean":
        return []  # No alert when panels are clean (> 85%)

    now = datetime.utcnow()
    title_map = {
        "attention": "Encrassement modéré détecté",
        "critique": "Encrassement critique détecté — Soiling Index élevé",
    }
    daily_loss = round(result["energy_loss_percent"] * 0.15 * 50, 1)

    return [{
        "id": f"SA-{DEMO_STATION_CODE[:8]}",
        "severity": severity,
        "status": "en_cours",
        "title": title_map.get(severity, "Alerte encrassement"),
        "soiling_index": result["soiling_index"],
        "energy_loss_percent": result["energy_loss_percent"],
        "daily_loss_dh": daily_loss,
        "recommendation": result["recommendation"],
        "confidence": result.get("confidence"),
        "alert_level": result.get("alert_level"),
        "diagnostic": result.get("diagnostic"),
        "created_at": now.isoformat(),
        "resolved_at": None,
        "station_code": DEMO_STATION_CODE,
        "station_name": DEMO_STATION_NAME,
    }]


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
