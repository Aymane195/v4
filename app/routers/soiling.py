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
import calendar
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/soiling", tags=["Soiling AI"])


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

    # Use YESTERDAY's complete daily KPI for a stable soiling index
    # (full solar day, no intraday fluctuation from partial production).
    now = datetime.utcnow()
    yesterday = now - timedelta(days=1)
    yest_start = datetime(yesterday.year, yesterday.month, yesterday.day)
    yesterday_ts = int(calendar.timegm(yest_start.timetuple()) * 1000)

    # Get installed_capacity from station list (cached 5 min)
    capacity = 10.0
    try:
        sl = fs.get_station_list()
        for s in (sl.get("data") or []):
            if s.get("stationCode") == station_code:
                cap = (s.get("capacity") or s.get("installedCapacity")
                       or s.get("installed_capacity") or s.get("installedPower"))
                if cap:
                    capacity = float(cap)
                break
    except Exception:
        pass

    # Fetch yesterday's COMPLETE daily production
    try:
        daily_kpi = fs.get_kpi_station_day(station_code, yesterday_ts)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    dm = ((daily_kpi.get("data") or [{}])[0]).get("dataItemMap", {})

    logger.info("[soiling] station %s daily KPI fields: %s", station_code, list(dm.keys()))

    # Try every known field name for daily production (kWh)
    day_power = None
    for key in ("day_power", "inverter_power", "product_power",
                "ongrid_power", "installed_power", "use_power",
                "reduction_total_power", "total_power"):
        val = dm.get(key)
        if val:
            day_power = float(val)
            logger.info("[soiling] station %s day_power=%.2f from field '%s'", station_code, day_power, key)
            break

    # Fallback: compute from specific energy × capacity
    if not day_power and dm.get("perpower_ratio") and capacity:
        day_power = float(dm["perpower_ratio"]) * capacity
        logger.info("[soiling] station %s day_power=%.2f computed from perpower_ratio", station_code, day_power)

    features = {
        "installed_capacity_kwp":   capacity,
        "day_power":                day_power,
        "days_since_last_cleaning": _days_since_last_cleaning(station_code, db),
    }

    # Yesterday's weather from Open-Meteo (matches the daily KPI window)
    coords = fs.get_station_location(station_code)
    if coords:
        weather = weather_svc.get_weather(*coords, yesterday=True)
        features.update(weather)

    # power_ratio = day_power / (capacity * irradiation_kwh_m2)
    irrad = features.get("irradiation_kwh_m2", 5.5)
    if day_power and capacity and irrad:
        p_theoretical = capacity * irrad
        features["power_ratio"] = float(min(day_power / p_theoretical, 1.5)) if p_theoretical > 0 else None

    return soiling_service.predict_soiling(features)


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
