from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.schemas import SoilingRequest, SoilingResponse
from app.services import soiling as soiling_service
from app.services import weather as weather_svc
from app.services.fusionsolar import client as fs
from app.auth import get_current_user
from app.database import get_db
from app.models import User, Intervention, InterventionType, InterventionStatus
from datetime import datetime, timedelta
import logging  # noqa: E402

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/soiling", tags=["Soiling AI"])

# Daily soiling cache shared with client.py: one result per station per solar day.
# Recomputed after 20:00 local (solar day complete), stable the rest of the day.
# { station_code: {"result": dict, "date": "YYYY-MM-DD", "capacity": float} }
_soiling_daily_cache: dict[str, dict] = {}
_SOILING_REFRESH_HOUR = 20  # Morocco local hour (UTC+1)


def _days_since_last_cleaning(station_code: str, db: Session) -> int:
    """Query DB for the most recent completed cleaning intervention for this station."""
    last = (
        db.query(Intervention)
        .filter(
            Intervention.station_code == station_code,
            Intervention.type == InterventionType.nettoyage,
            Intervention.status == InterventionStatus.terminee,
            Intervention.completed_date.isnot(None),
        )
        .order_by(Intervention.completed_date.desc())
        .first()
    )
    if last and last.completed_date:
        delta = datetime.utcnow() - last.completed_date
        return max(0, delta.days)
    return 30  # default: assume 30 days if no cleaning on record


@router.post("/predict", response_model=SoilingResponse)
def predict(
    body: SoilingRequest,
    current_user: User = Depends(get_current_user),
):
    result = soiling_service.predict_soiling(body.model_dump())
    return result


@router.get("/station/{station_code}", response_model=SoilingResponse)
def predict_for_station(
    station_code: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.services.demo import is_demo
    if is_demo(station_code):
        # Run real model with representative Morocco demo parameters
        return _predict_demo(station_code, db)

    # ── Daily soiling prediction (stable 23h→23h cycle) ──────────────────────
    # Computed ONCE per solar day using real-time KPI's accumulated day_power
    # after 20:00 local (production complete). Before 20:00, cached result served.
    now = datetime.utcnow()
    hour_local = (now.hour + 1) % 24  # Morocco UTC+1
    today_str = (now + timedelta(hours=1)).strftime("%Y-%m-%d")

    # Check cache first
    cached = _soiling_daily_cache.get(station_code)
    if cached:
        if cached["date"] == today_str or hour_local < _SOILING_REFRESH_HOUR:
            logger.info("[soiling] station %s: serving cached result (date=%s)", station_code, cached["date"])
            return cached["result"]

    # Too early and no cache yet — still compute (first request of the day)
    try:
        kpi_data = fs.get_station_real_kpi_enriched([station_code])
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    data_list = kpi_data.get("data", [])
    kpi = data_list[0].get("dataItemMap", {}) if data_list else {}

    capacity = kpi.get("installed_capacity") or 10.0
    day_power = kpi.get("day_power")

    logger.info("[soiling] station %s: computing — hour_local=%d, day_power=%s, capacity=%s",
                station_code, hour_local, day_power, capacity)

    features = {
        "installed_capacity_kwp":   capacity,
        "day_power":                day_power,
        "days_since_last_cleaning": _days_since_last_cleaning(station_code, db),
    }

    coords = fs.get_station_location(station_code)
    if coords:
        features.update(weather_svc.get_weather(*coords))

    # power_ratio = day_power / (capacity * irradiation_kwh_m2)
    irrad = features.get("irradiation_kwh_m2", 5.5)
    if day_power and capacity and irrad:
        p_theoretical = capacity * irrad
        features["power_ratio"] = float(min(day_power / p_theoretical, 1.5)) if p_theoretical > 0 else None

    result = soiling_service.predict_soiling(features)

    # Only cache after 20:00 — before that, day_power is partial (midday request
    # would give falsely high soiling from incomplete daily production)
    if hour_local >= _SOILING_REFRESH_HOUR:
        _soiling_daily_cache[station_code] = {
            "result": result, "date": today_str, "capacity": capacity,
        }
        logger.info("[soiling] station %s: cached final prediction — soiling=%.4f (%s)",
                    station_code, result["soiling_index"], result["status"])
    else:
        logger.info("[soiling] station %s: live prediction (not cached, day incomplete) — soiling=%.4f",
                    station_code, result["soiling_index"])

    return result


def _predict_demo(station_code: str, db: Session) -> dict:
    """
    Run the real RandomForest model with typical Morocco residential demo parameters.
    Varies slightly based on time of day to make the dashboard feel live.
    """
    import math
    from datetime import datetime

    now = datetime.utcnow()
    hour = now.hour + now.minute / 60.0

    # Simulate gradual dust accumulation: worst mid-afternoon, resets after rain
    dust_cycle = abs(math.sin(now.timetuple().tm_yday / 30.0 * math.pi))
    days_since_rain    = int(5 + 25 * dust_cycle)           # 5–30 days
    days_since_clean   = _days_since_last_cleaning(station_code, db)  # real DB value

    # Simulate realistic power_ratio: high at noon, lower at edges of day, reduced by dust
    solar_peak = max(0.0, math.sin(math.pi * (hour - 6) / 14)) if 6 <= hour <= 20 else 0.0
    dust_loss  = 0.05 + 0.20 * dust_cycle                   # 5–25% dust loss
    power_ratio = max(0.45, solar_peak * (1.0 - dust_loss)) if solar_peak > 0 else 0.75

    features = {
        "irradiation_kwh_m2":       5.5,       # Morocco average
        "temp_air_c":               28.0,
        "humidity_pct":             45.0,
        "wind_speed_ms":            4.5,
        "precipitation_mm":         0.0,
        "days_since_last_rain":     days_since_rain,
        "days_since_last_cleaning": days_since_clean,
        "installed_capacity_kwp":   10.0,       # typical residential 10 kWp
        "power_ratio":              round(power_ratio, 3),
    }

    return soiling_service.predict_soiling(features)
