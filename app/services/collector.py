"""
Scheduled data collector — runs every 30 minutes.

Pipeline:
  1. Get all station codes from the DB
  2. For each station: fetch realtime KPI from FusionSolar
  3. Fetch weather from Open-Meteo (if coordinates available)
  4. Validate and clean the raw data
  5. Run soiling prediction on valid data
  6. Save SolarMeasurement to DB
"""
import logging
from datetime import datetime

from app.database import SessionLocal
from app.models import ClientStation, SolarMeasurement
from app.services.fusionsolar import client as fs
from app.services import weather as weather_svc
from app.services import soiling as soiling_svc
from app.services.validation import validate_and_clean
from app.services.demo import is_demo, DEMO_STATION_CODE

logger = logging.getLogger(__name__)

# Track last run time and results for the status endpoint
last_run: dict = {"time": None, "stations": 0, "saved": 0, "errors": 0}


def collect_all_stations():
    """Fetch, validate, and store measurements for every registered station."""
    db = SessionLocal()
    now = datetime.utcnow()
    saved = 0
    errors = 0

    try:
        # Get unique station codes from the DB
        codes = [
            row[0]
            for row in db.query(ClientStation.station_code).distinct().all()
        ]
        # Skip demo station — it has no real FusionSolar data
        codes = [c for c in codes if not is_demo(c)]

        logger.info("[collector] starting collection for %d stations", len(codes))

        for code in codes:
            try:
                measurement = _collect_station(code, now, db)
                if measurement:
                    db.add(measurement)
                    saved += 1
            except Exception as exc:
                logger.error("[collector] station %s failed: %s", code, exc)
                errors += 1

        db.commit()
        logger.info("[collector] done — %d saved, %d errors", saved, errors)

    except Exception as exc:
        db.rollback()
        logger.error("[collector] fatal error: %s", exc)
    finally:
        db.close()

    last_run["time"] = now.isoformat()
    last_run["stations"] = len(codes) if 'codes' in dir() else 0
    last_run["saved"] = saved
    last_run["errors"] = errors

    return last_run.copy()


def _collect_station(station_code: str, utc_now: datetime, db) -> SolarMeasurement | None:
    """Fetch, validate, predict, and build a SolarMeasurement for one station."""

    # ── 1. Fetch realtime KPI from FusionSolar ───────────────────────────
    kpi_resp = fs.get_station_real_kpi([station_code])
    data_list = kpi_resp.get("data", [])
    if not data_list:
        logger.warning("[collector] %s: empty KPI response", station_code)
        return None

    kpi = data_list[0].get("dataItemMap", {})

    raw = {
        "station_code":      station_code,
        "production_current": kpi.get("inverter_power"),
        "irradiance":         kpi.get("radiation_intensity"),
        "temperature":        kpi.get("temperature"),
        "installed_capacity": kpi.get("installed_capacity"),
        "day_power":          kpi.get("day_power"),
        "performance_ratio":  kpi.get("performance_ratio"),
    }

    # ── 2. Fetch weather from Open-Meteo ─────────────────────────────────
    weather = {}
    coords = fs.get_station_location(station_code)
    if coords:
        weather = weather_svc.get_weather(*coords)

    # ── 3. Validate and clean ────────────────────────────────────────────
    cleaned = validate_and_clean(raw, utc_now)

    # ── 4. Run soiling prediction on valid data ──────────────────────────
    soiling_result = None
    if cleaned["is_valid"]:
        features = {
            "installed_capacity_kwp":   cleaned.get("installed_capacity") or 1.0,
            "p_real":                   cleaned.get("production_current"),
            "days_since_last_cleaning": 30,  # default — soiling service also queries DB
        }
        # Merge weather data (irradiation, temp, humidity, wind, precip, rain days)
        features.update(weather)
        # Compute p_theoretical from instantaneous irradiance
        irr = cleaned.get("irradiance") or 0
        cap = cleaned.get("installed_capacity") or 1.0
        features["p_theoretical_kwh"] = cap * (irr / 1000.0) if irr else None

        soiling_result = soiling_svc.predict_soiling(features)

    # ── 5. Build DB record ───────────────────────────────────────────────
    m = SolarMeasurement(
        station_code=station_code,
        recorded_at=utc_now,
        # Raw / cleaned values
        production_current=cleaned.get("production_current"),
        irradiance=cleaned.get("irradiance"),
        temperature=cleaned.get("temperature"),
        installed_capacity=cleaned.get("installed_capacity"),
        day_power=cleaned.get("day_power"),
        performance_ratio=cleaned.get("performance_ratio"),
        # Weather
        humidity_pct=weather.get("humidity_pct"),
        wind_speed_ms=weather.get("wind_speed_ms"),
        precipitation_mm=weather.get("precipitation_mm"),
        # Soiling
        soiling_index=soiling_result["soiling_index"] if soiling_result else None,
        soiling_confidence=soiling_result.get("confidence") if soiling_result else None,
        soiling_alert_level=soiling_result.get("alert_level") if soiling_result else None,
        # Validation
        is_valid=cleaned["is_valid"],
        was_corrected=cleaned["was_corrected"],
        validation_notes=cleaned.get("validation_notes"),
    )
    return m
