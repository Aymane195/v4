from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, ClientStation, UserRole
from app.schemas import ClientStationIn, ClientStationOut, UserOut
from app.auth import require_role
from app.services.fusionsolar import client as fs
import calendar
import datetime

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
    station = ClientStation(client_id=client_id, station_code=body.station_code, station_name=body.station_name)
    db.add(station)
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
    return _handle(fs.get_station_real_kpi, [station_code])


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
