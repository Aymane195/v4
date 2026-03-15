from fastapi import APIRouter, HTTPException, Query
from app.services.fusionsolar import client
import calendar
import datetime

router = APIRouter(prefix="/api", tags=["FusionSolar"])


def _handle(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------------------------------------------
# Connection test — use this first to find your working domain
# ------------------------------------------------------------------

@router.get("/test-connection")
def test_connection():
    """Try all common FusionSolar domains and return which ones respond."""
    return client.test_all_domains()


# ------------------------------------------------------------------
# Plants
# ------------------------------------------------------------------

@router.get("/plants")
def get_plants():
    """List all plants/stations associated with your account."""
    return _handle(client.get_station_list)


@router.get("/plants/{station_code}/kpi/realtime")
def get_plant_realtime_kpi(station_code: str):
    """Real-time KPIs for a plant: current power, energy today, CO2 reduction, etc."""
    return _handle(client.get_station_real_kpi, [station_code])


@router.get("/plants/{station_code}/kpi/daily")
def get_plant_daily_kpi(
    station_code: str,
    date: str = Query(..., description="Date in YYYY-MM-DD format, e.g. 2026-03-15"),
):
    """Daily KPI stats for a plant."""
    try:
        dt = datetime.datetime.strptime(date, "%Y-%m-%d")
        collect_time = int(calendar.timegm(dt.timetuple()) * 1000)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM-DD")
    return _handle(client.get_kpi_station_day, station_code, collect_time)


@router.get("/plants/{station_code}/kpi/monthly")
def get_plant_monthly_kpi(
    station_code: str,
    date: str = Query(..., description="Month in YYYY-MM format, e.g. 2026-03"),
):
    """Monthly KPI stats for a plant."""
    try:
        dt = datetime.datetime.strptime(date + "-01", "%Y-%m-%d")
        collect_time = int(calendar.timegm(dt.timetuple()) * 1000)
    except ValueError:
        raise HTTPException(status_code=400, detail="date must be YYYY-MM")
    return _handle(client.get_kpi_station_month, station_code, collect_time)


# ------------------------------------------------------------------
# Devices
# ------------------------------------------------------------------

@router.get("/plants/{station_code}/devices")
def get_devices(station_code: str):
    """List all devices (inverters, meters, etc.) at a plant."""
    return _handle(client.get_dev_list, station_code)


@router.get("/plants/{station_code}/devices/kpi/realtime")
def get_devices_realtime_kpi(
    station_code: str,
    dev_type_id: int = Query(1, description="Device type: 1=inverter, 2=string inverter, 10=meter, 17=EMI, 47=optimizer"),
):
    """Real-time KPIs for all devices of a given type at a plant."""
    dev_data = _handle(client.get_dev_list, station_code)
    devices = dev_data.get("data", [])
    dev_ids = [str(d["id"]) for d in devices if d.get("devTypeId") == dev_type_id]
    if not dev_ids:
        return {"message": f"No devices found with devTypeId={dev_type_id}", "data": []}
    return _handle(client.get_dev_real_kpi, dev_ids, dev_type_id)


# ------------------------------------------------------------------
# Alarms
# ------------------------------------------------------------------

@router.get("/plants/{station_code}/alarms")
def get_alarms(
    station_code: str,
    begin_date: str = Query(None, description="Start date YYYY-MM-DD (optional)"),
    end_date: str = Query(None, description="End date YYYY-MM-DD (optional)"),
):
    """Active and historical alarms for a plant."""
    def _parse(d):
        if d is None:
            return None
        try:
            dt = datetime.datetime.strptime(d, "%Y-%m-%d")
            return int(calendar.timegm(dt.timetuple()) * 1000)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid date format: {d}, expected YYYY-MM-DD")

    return _handle(client.get_alarm_list, station_code, _parse(begin_date), _parse(end_date))
