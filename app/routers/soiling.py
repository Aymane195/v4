from fastapi import APIRouter, Depends, HTTPException
from app.schemas import SoilingRequest, SoilingResponse
from app.services import soiling as soiling_service
from app.services.fusionsolar import client as fs
from app.auth import get_current_user
from app.models import User

router = APIRouter(prefix="/soiling", tags=["Soiling AI"])


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
):
    from app.services.demo import is_demo, soiling as demo_soiling
    if is_demo(station_code):
        return demo_soiling()
    try:
        kpi_data = fs.get_station_real_kpi([station_code])
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))

    # Extract relevant fields from FusionSolar KPI response
    data_list = kpi_data.get("data", [])
    kpi = data_list[0].get("dataItemMap", {}) if data_list else {}

    features = {
        "radiation_intensity": kpi.get("radiation_intensity"),
        "inverter_power": kpi.get("inverter_power"),
        "installed_capacity": kpi.get("installed_capacity"),
        "temperature": kpi.get("temperature"),
        "power_ratio": kpi.get("power_ratio"),
    }

    return soiling_service.predict_soiling(features)
