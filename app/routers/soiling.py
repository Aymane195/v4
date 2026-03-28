from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.schemas import SoilingRequest, SoilingResponse
from app.services import soiling as soiling_service
from app.services import weather as weather_svc
from app.services.fusionsolar import client as fs
from app.auth import get_current_user
from app.database import get_db
from app.models import User, Intervention, InterventionType, InterventionStatus
from datetime import datetime

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
    from app.services.demo import is_demo, soiling as demo_soiling
    if is_demo(station_code):
        return demo_soiling()

    try:
        kpi_data = fs.get_station_real_kpi([station_code])
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    data_list = kpi_data.get("data", [])
    kpi = data_list[0].get("dataItemMap", {}) if data_list else {}

    # FusionSolar instantaneous values
    radiation_w_m2 = kpi.get("radiation_intensity") or 0.0   # W/m² — for p_theoretical only
    inverter_pwr   = kpi.get("inverter_power") or 0.0
    capacity       = kpi.get("installed_capacity") or 1.0

    # p_theoretical from instantaneous irradiance (physics: kWp × kW/m² = kW output)
    p_theoretical = capacity * (radiation_w_m2 / 1000.0) if radiation_w_m2 else None

    features = {
        "installed_capacity_kwp":   capacity,
        "p_theoretical_kwh":        p_theoretical,
        "p_real":                   inverter_pwr,
        "days_since_last_cleaning": _days_since_last_cleaning(station_code, db),
    }

    # Fetch real weather from Open-Meteo (replaces all hardcoded defaults)
    coords = fs.get_station_location(station_code)
    if coords:
        weather = weather_svc.get_weather(*coords)
        features.update(weather)  # irradiation_kwh_m2 from here is daily kWh/m² — correct unit

    return soiling_service.predict_soiling(features)
