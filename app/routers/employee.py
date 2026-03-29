from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, ClientStation, UserRole
from app.schemas import ClientStationIn, ClientStationOut, UserOut
from app.auth import require_role
from app.services.fusionsolar import client as fs
from app.services.validation import apply_realtime_correction, is_nighttime
import datetime
import calendar

router = APIRouter(prefix="/employee", tags=["Employee"])

_require_employee = require_role("employee")


def _handle(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))


# --- Client management ---

@router.get("/clients", response_model=list[UserOut])
def list_clients(
    current_user: User = Depends(_require_employee),
    db: Session = Depends(get_db),
):
    return db.query(User).filter(User.role == UserRole.client).all()


@router.get("/clients/{client_id}/stations", response_model=list[ClientStationOut])
def get_client_stations(
    client_id: int,
    current_user: User = Depends(_require_employee),
    db: Session = Depends(get_db),
):
    client = db.query(User).filter(User.id == client_id, User.role == UserRole.client).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    return db.query(ClientStation).filter(ClientStation.client_id == client_id).all()


@router.post("/clients/{client_id}/stations", response_model=ClientStationOut, status_code=201)
def assign_station(
    client_id: int,
    body: ClientStationIn,
    current_user: User = Depends(_require_employee),
    db: Session = Depends(get_db),
):
    client = db.query(User).filter(User.id == client_id, User.role == UserRole.client).first()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    existing = db.query(ClientStation).filter(
        ClientStation.client_id == client_id,
        ClientStation.station_code == body.station_code,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Station already assigned to this client")
    station = ClientStation(
        client_id=client_id,
        station_code=body.station_code,
        station_name=body.station_name,
        installed_capacity_kwp=body.installed_capacity_kwp,
    )
    db.add(station)
    db.commit()
    db.refresh(station)
    return station


@router.patch("/clients/{client_id}/stations/{station_code}", response_model=ClientStationOut)
def update_station(
    client_id: int,
    station_code: str,
    body: ClientStationIn,
    current_user: User = Depends(_require_employee),
    db: Session = Depends(get_db),
):
    station = db.query(ClientStation).filter(
        ClientStation.client_id == client_id,
        ClientStation.station_code == station_code,
    ).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    if body.station_name is not None:
        station.station_name = body.station_name
    if body.installed_capacity_kwp is not None:
        station.installed_capacity_kwp = body.installed_capacity_kwp
    db.commit()
    db.refresh(station)
    return station


@router.delete("/clients/{client_id}/stations/{station_code}", status_code=204)
def remove_station(
    client_id: int,
    station_code: str,
    current_user: User = Depends(_require_employee),
    db: Session = Depends(get_db),
):
    station = db.query(ClientStation).filter(
        ClientStation.client_id == client_id,
        ClientStation.station_code == station_code,
    ).first()
    if not station:
        raise HTTPException(status_code=404, detail="Station not found")
    db.delete(station)
    db.commit()


# --- All stations view ---

@router.get("/stations")
def list_all_stations(
    current_user: User = Depends(_require_employee),
    db: Session = Depends(get_db),
):
    stations = db.query(ClientStation).all()
    return [
        {
            "station_code": s.station_code,
            "station_name": s.station_name,
            "client_id": s.client_id,
        }
        for s in stations
    ]


@router.get("/alarms")
def get_all_alarms(
    current_user: User = Depends(_require_employee),
    db: Session = Depends(get_db),
):
    """Aggregated alarms from all managed stations, sorted by severity then time."""
    stations = db.query(ClientStation).all()
    results = []
    for s in stations:
        try:
            data = fs.get_alarm_list(s.station_code)
            for a in (data.get("data") or []):
                a["station_code"] = s.station_code
                a["station_name"] = s.station_name or s.station_code
            results.extend(data.get("data") or [])
        except Exception:
            pass
    results.sort(key=lambda x: ((x.get("lev") or 9), -(x.get("raiseTime") or 0)))
    return results


@router.get("/stations/{station_code}/kpi/realtime")
def get_station_realtime(
    station_code: str,
    current_user: User = Depends(_require_employee),
):
    raw = _handle(fs.get_station_real_kpi_enriched, [station_code])

    if not is_nighttime(datetime.datetime.utcnow()):
        for entry in raw.get("data", []):
            item_map = entry.get("dataItemMap", {})
            if not item_map.get("inverter_power"):
                fallback = fs.get_station_power_from_devices(station_code)
                if fallback is not None:
                    item_map["inverter_power"] = fallback

    return apply_realtime_correction(raw)


@router.get("/stations/{station_code}/devices")
def get_station_devices(
    station_code: str,
    current_user: User = Depends(_require_employee),
):
    return _handle(fs.get_dev_list, station_code)


@router.get("/stations/{station_code}/alarms")
def get_station_alarms(
    station_code: str,
    begin_date: str = Query(None, description="YYYY-MM-DD"),
    end_date: str = Query(None, description="YYYY-MM-DD"),
    current_user: User = Depends(_require_employee),
):
    def _parse(d):
        if d is None:
            return None
        try:
            dt = datetime.datetime.strptime(d, "%Y-%m-%d")
            return int(calendar.timegm(dt.timetuple()) * 1000)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid date: {d}")

    return _handle(fs.get_alarm_list, station_code, _parse(begin_date), _parse(end_date))


# --- Diagnostics ---

@router.get("/debug/station/{station_code}")
def debug_station(
    station_code: str,
    current_user: User = Depends(_require_employee),
):
    """
    Raw FusionSolar diagnostic for a station code.
    Use this to verify the station code is correct and see exactly what the API returns.
    Also lists all station codes available on this API account.
    """
    result: dict = {"station_code_queried": station_code, "errors": {}}

    # 1. List all stations accessible on this account
    try:
        sl = fs.get_station_list()
        result["station_list"] = {
            "success": sl.get("success"),
            "count": len(sl.get("data") or []),
            "station_codes": [s.get("stationCode") for s in (sl.get("data") or [])],
            "station_names": {s.get("stationCode"): s.get("stationName") for s in (sl.get("data") or [])},
        }
        result["station_in_list"] = station_code in result["station_list"]["station_codes"]
    except Exception as e:
        result["errors"]["station_list"] = str(e)

    # 2. Raw getStationRealKpi response (no enrichment)
    try:
        raw = fs.get_station_real_kpi([station_code])
        result["realtime_raw"] = raw
        data_list = raw.get("data") or []
        found = next((e for e in data_list if e.get("stationCode") == station_code), None)
        result["realtime_entry_found"] = found is not None
        result["dataItemMap_keys"] = list((found or {}).get("dataItemMap", {}).keys()) if found else []
    except Exception as e:
        result["errors"]["realtime"] = str(e)

    # 3. Today's daily KPI
    import calendar as _cal
    now = datetime.datetime.utcnow()
    day_ts = int(_cal.timegm(datetime.datetime(now.year, now.month, now.day).timetuple()) * 1000)
    try:
        daily = fs.get_kpi_station_day(station_code, day_ts)
        result["daily_kpi"] = daily
    except Exception as e:
        result["errors"]["daily_kpi"] = str(e)

    # 4. Device list
    try:
        devs = fs.get_dev_list(station_code)
        result["device_list"] = {
            "success": devs.get("success"),
            "count": len(devs.get("data") or []),
            "devices": [{"id": d.get("id"), "devName": d.get("devName"), "devTypeId": d.get("devTypeId")} for d in (devs.get("data") or [])],
        }
    except Exception as e:
        result["errors"]["device_list"] = str(e)

    return result
