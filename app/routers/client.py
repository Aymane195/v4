from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, ClientStation
from app.auth import require_role
from app.services.fusionsolar import client as fs
from app.services import demo as demo_svc
import calendar
import datetime

router = APIRouter(prefix="/client", tags=["Client"])

_require_client = require_role("client")


def _get_station_codes(current_user: User, db: Session) -> list[str]:
    stations = db.query(ClientStation).filter(ClientStation.client_id == current_user.id).all()
    if not stations:
        raise HTTPException(status_code=404, detail="No stations assigned to your account yet. Contact your employee.")
    return [s.station_code for s in stations]


def _handle(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


@router.get("/stations")
def get_my_stations(
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    stations = db.query(ClientStation).filter(ClientStation.client_id == current_user.id).all()
    return [{"station_code": s.station_code, "station_name": s.station_name} for s in stations]


@router.get("/kpi/realtime")
def get_realtime_kpi(
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    codes = _get_station_codes(current_user, db)
    if any(demo_svc.is_demo(c) for c in codes):
        return demo_svc.realtime_kpi()
    return _handle(fs.get_station_real_kpi, codes)


@router.get("/kpi/daily")
def get_daily_kpi(
    date: str = Query(..., description="YYYY-MM-DD"),
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    codes = _get_station_codes(current_user, db)
    if any(demo_svc.is_demo(c) for c in codes):
        return [demo_svc.daily_kpi(date)]
    try:
        dt = datetime.datetime.strptime(date, "%Y-%m-%d")
        collect_time = int(calendar.timegm(dt.timetuple()) * 1000)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    return [_handle(fs.get_kpi_station_day, code, collect_time) for code in codes]


@router.get("/kpi/monthly")
def get_monthly_kpi(
    date: str = Query(..., description="YYYY-MM"),
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    codes = _get_station_codes(current_user, db)
    if any(demo_svc.is_demo(c) for c in codes):
        return [demo_svc.monthly_kpi(date)]
    try:
        dt = datetime.datetime.strptime(date + "-01", "%Y-%m-%d")
        collect_time = int(calendar.timegm(dt.timetuple()) * 1000)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM")
    return [_handle(fs.get_kpi_station_month, code, collect_time) for code in codes]


@router.get("/kpi/devices")
def get_device_kpi(
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    codes = _get_station_codes(current_user, db)
    if any(demo_svc.is_demo(c) for c in codes):
        return [demo_svc.device_kpi()]
    results = []
    for code in codes:
        try:
            dev_data = _handle(fs.get_dev_list, code)
            devices = dev_data.get("data") or []
            inv_ids = [str(d["id"]) for d in devices if d.get("devTypeId") == 1]
            if inv_ids:
                results.append(_handle(fs.get_dev_real_kpi, inv_ids, 1))
        except Exception:
            pass
    return results


@router.get("/devices")
def get_devices(
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    codes = _get_station_codes(current_user, db)
    return [_handle(fs.get_dev_list, code) for code in codes]


@router.get("/alarms")
def get_alarms(
    begin_date: str = Query(None, description="YYYY-MM-DD"),
    end_date: str = Query(None, description="YYYY-MM-DD"),
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    codes = _get_station_codes(current_user, db)
    if any(demo_svc.is_demo(c) for c in codes):
        return [{"success": True, "data": demo_svc.alarms()}]

    def _parse(d):
        if d is None:
            return None
        try:
            dt = datetime.datetime.strptime(d, "%Y-%m-%d")
            return int(calendar.timegm(dt.timetuple()) * 1000)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid date: {d}")

    return [_handle(fs.get_alarm_list, code, _parse(begin_date), _parse(end_date)) for code in codes]
