from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, ClientStation, Intervention, InterventionType, InterventionStatus
from app.auth import require_role
from app.services.fusionsolar import client as fs
from app.services import demo as demo_svc
from app.services.email import send_critique_soiling_alert
from app.services import weather as weather_svc
import calendar
import datetime
import threading

router = APIRouter(prefix="/client", tags=["Client"])

_require_client = require_role("client")

# Track which (user_id, station_code) pairs already received a critique email
# this server session (resets on restart — acceptable for this app's scale).
_critique_email_sent: set[tuple[int, str]] = set()


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


@router.get("/soiling-alerts")
def get_soiling_alerts(
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    from app.services import soiling as soiling_service
    codes = _get_station_codes(current_user, db)
    if any(demo_svc.is_demo(c) for c in codes):
        return [a for a in demo_svc.demo_soiling_alerts() if a["severity"] != "info"]

    # Real clients: return current soiling reading as a single alert (if soiling detected)
    alerts = []
    for code in codes:
        try:
            kpi_data = fs.get_station_real_kpi([code])
            data_list = kpi_data.get("data", [])
            kpi = data_list[0].get("dataItemMap", {}) if data_list else {}

            radiation   = kpi.get("radiation_intensity") or 0.0
            inverter_pwr = kpi.get("inverter_power") or 0.0
            capacity    = kpi.get("installed_capacity") or 1.0

            # Look up last cleaning from interventions so the model knows how dirty panels likely are
            last_clean = (
                db.query(Intervention)
                .filter(
                    Intervention.station_code == code,
                    Intervention.type == InterventionType.nettoyage,
                    Intervention.status == InterventionStatus.terminee,
                    Intervention.completed_date.isnot(None),
                )
                .order_by(Intervention.completed_date.desc())
                .first()
            )
            days_since_cleaning = (
                max(0, (datetime.datetime.utcnow() - last_clean.completed_date).days)
                if last_clean and last_clean.completed_date else 30
            )

            features = {
                "installed_capacity_kwp":   capacity,
                "p_theoretical_kwh":        capacity * (radiation / 1000.0) if radiation else None,
                "p_real":                   inverter_pwr,
                "days_since_last_cleaning": days_since_cleaning,
            }

            # Fetch real weather from Open-Meteo (replaces hardcoded defaults)
            coords = fs.get_station_location(code)
            if coords:
                features.update(weather_svc.get_weather(*coords))
            result = soiling_service.predict_soiling(features)
            severity = result["status"]  # clean, attention, or critique
            if severity == "clean":
                continue  # no alert when panels are clean
            title_map = {"attention": "Encrassement modéré détecté", "critique": "Encrassement critique détecté — Soiling Index élevé"}
            daily_loss = round(result["energy_loss_percent"] * 0.15 * 50, 1)
            alerts.append({
                "id": f"SA-{code[:8]}",
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
                "created_at": datetime.datetime.utcnow().isoformat(),
                "resolved_at": None,
                "station_code": code,
                "station_name": code,
            })
            # Auto-email client on critique detection (once per server session)
            if severity == "critique":
                key = (current_user.id, code)
                if key not in _critique_email_sent:
                    _critique_email_sent.add(key)
                    threading.Thread(
                        target=send_critique_soiling_alert,
                        args=(
                            current_user.email,
                            current_user.full_name,
                            code,
                            result["soiling_index"],
                            result["energy_loss_percent"],
                            daily_loss,
                            result["recommendation"],
                        ),
                        daemon=True,
                    ).start()
        except Exception:
            pass
    return alerts
