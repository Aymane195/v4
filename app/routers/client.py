from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, ClientStation, Intervention, InterventionType, InterventionStatus
from app.auth import require_role
from app.services.fusionsolar import client as fs
from app.services import demo as demo_svc
from app.services.email import send_critique_soiling_alert
from app.services import weather as weather_svc
from app.services.validation import apply_realtime_correction, is_nighttime
import calendar
import datetime
import logging
import threading

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/client", tags=["Client"])

_require_client = require_role("client")

# Track which (user_id, station_code) pairs already received a critique email
# this server session (resets on restart — acceptable for this app's scale).
_critique_email_sent: set[tuple[int, str]] = set()

# Daily soiling cache: one prediction per station per solar day.
# Recomputed after 20:00 local (solar day complete), stable the rest of the day.
# { station_code: {"result": dict, "date": "YYYY-MM-DD", "day_power": float} }
_soiling_daily_cache: dict[str, dict] = {}
_SOILING_REFRESH_HOUR = 20  # local hour (Morocco UTC+1) — production is zero by then


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

    # Enrich with capacity from FusionSolar station list (cached 5 min — zero extra API calls)
    fs_meta: dict = {}
    try:
        sl = fs.get_station_list()
        for s in (sl.get("data") or []):
            code = s.get("stationCode", "")
            if code:
                cap = (
                    s.get("capacity")
                    or s.get("installedCapacity")
                    or s.get("installed_capacity")
                    or s.get("installedPower")
                    or s.get("dcCapacity")
                )
                fs_meta[code] = {
                    "installed_capacity": float(cap) if cap is not None else None,
                    "station_name_fs":    s.get("stationName"),
                    "address":            s.get("stationAddr"),
                }
    except Exception:
        pass

    result = []
    for s in stations:
        entry = {"station_code": s.station_code, "station_name": s.station_name}
        if s.station_code in fs_meta:
            entry.update(fs_meta[s.station_code])
        result.append(entry)
    return result


@router.get("/kpi/realtime")
def get_realtime_kpi(
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    codes = _get_station_codes(current_user, db)
    if any(demo_svc.is_demo(c) for c in codes):
        return demo_svc.realtime_kpi()
    raw = _handle(fs.get_station_real_kpi_enriched, codes)

    # Fallback: if station-level inverter_power = 0 during daytime, sum device-level KPIs.
    # FusionSolar sometimes fails to aggregate station KPI even when inverters are running.
    if not is_nighttime(datetime.datetime.utcnow()):
        for entry in raw.get("data", []):
            item_map = entry.get("dataItemMap", {})
            if not item_map.get("inverter_power"):
                code = entry.get("stationCode", "")
                fallback = fs.get_station_power_from_devices(code)
                if fallback is not None:
                    item_map["inverter_power"] = fallback

    return apply_realtime_correction(raw)


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


# Annual cache: { (user_id, year): (fetched_at_timestamp, data) }
_annual_cache: dict[tuple, tuple] = {}
_ANNUAL_CACHE_TTL = 3600  # 1 hour — monthly history never changes
import time as _time


@router.get("/kpi/annual")
def get_annual_kpi(
    year: int = Query(..., description="4-digit year, e.g. 2026"),
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    """
    Return all 12 months of KPI for the given year in a single call.
    Fetches FusionSolar sequentially with 200ms delay between calls (avoids
    rate-limiting from 12 parallel requests). Cached 1 hour on the backend.
    Response: list of 12 items [{month: 1, month_power: 123.4}, ...]
    """
    codes = _get_station_codes(current_user, db)

    # Demo path
    if any(demo_svc.is_demo(c) for c in codes):
        result = []
        for m in range(1, 13):
            date_str = f"{year}-{m:02d}"
            try:
                d = demo_svc.monthly_kpi(date_str)
                mp = float((d[0] if isinstance(d, list) else d).get("dataItemMap", {}).get("month_power") or 0)
            except Exception:
                mp = 0.0
            result.append({"month": m, "month_power": mp})
        return result

    # Serve from cache when fresh
    cache_key = (current_user.id, year)
    cached = _annual_cache.get(cache_key)
    if cached:
        fetched_at, data = cached
        if _time.time() - fetched_at < _ANNUAL_CACHE_TTL:
            logger.info("[annual] serving cached year %d for user %d", year, current_user.id)
            return data

    # Fetch 12 months sequentially — one request at a time to avoid rate limiting
    logger.info("[annual] fetching year %d for user %d (12 sequential months)", year, current_user.id)
    result = []
    for m in range(1, 13):
        date_str = f"{year}-{m:02d}"
        month_power = 0.0
        try:
            dt = datetime.datetime.strptime(date_str + "-01", "%Y-%m-%d")
            collect_time = int(calendar.timegm(dt.timetuple()) * 1000)
            resp = fs.get_kpi_station_month(codes[0], collect_time)
            data_list = resp.get("data") or []
            item_map = data_list[0].get("dataItemMap", {}) if data_list else {}
            month_power = float(item_map.get("month_power") or 0)
            logger.info("[annual] month %s → %.1f kWh", date_str, month_power)
        except Exception as e:
            logger.warning("[annual] month %s failed: %s", date_str, e)
        result.append({"month": m, "month_power": month_power})
        _time.sleep(0.2)  # 200ms pause — keeps us well below FusionSolar's rate limit

    _annual_cache[cache_key] = (_time.time(), result)
    logger.info("[annual] cached year %d: total=%.1f kWh", year, sum(r["month_power"] for r in result))
    return result


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

    # ── Daily soiling prediction (stable 23h→23h cycle) ──────────────────────
    # Soiling is computed ONCE per solar day using the real-time KPI's accumulated
    # day_power after 20:00 local (when production is complete). Before 20:00, the
    # previous day's cached result is served — no intraday fluctuation.
    now_utc = datetime.datetime.utcnow()
    hour_local = (now_utc.hour + 1) % 24  # Morocco is UTC+1
    today_str = (now_utc + datetime.timedelta(hours=1)).strftime("%Y-%m-%d")

    alerts = []
    for code in codes:
        try:
            # Check if we have a valid cached result for today
            cached = _soiling_daily_cache.get(code)
            if cached:
                # Serve cache if: already computed today, OR it's before refresh hour
                if cached["date"] == today_str or hour_local < _SOILING_REFRESH_HOUR:
                    result = cached["result"]
                    capacity = cached.get("capacity", 10.0)
                    logger.info("[soiling] station %s: serving cached result (date=%s, soiling=%.4f)",
                                code, cached["date"], result["soiling_index"])
                    # Build alert from cached result (skip if clean)
                    if result["status"] == "clean":
                        continue
                    daily_loss = round(result["energy_loss_percent"] / 100 * capacity * 5.5 * 1.5, 1)
                    title_map = {"attention": "Encrassement modéré détecté",
                                 "critique": "Encrassement critique détecté — Soiling Index élevé"}
                    alerts.append({
                        "id": f"SA-{code[:8]}", "severity": result["status"],
                        "status": "en_cours",
                        "title": title_map.get(result["status"], "Alerte encrassement"),
                        "soiling_index": result["soiling_index"],
                        "energy_loss_percent": result["energy_loss_percent"],
                        "daily_loss_dh": daily_loss,
                        "recommendation": result["recommendation"],
                        "confidence": result.get("confidence"),
                        "alert_level": result.get("alert_level"),
                        "diagnostic": result.get("diagnostic"),
                        "created_at": cached.get("computed_at", now_utc.isoformat()),
                        "resolved_at": None,
                        "station_code": code, "station_name": code,
                    })
                    # Email logic for cached critiques handled at first computation
                    continue

            # ── Compute fresh prediction ─────────────────────────────────────
            # Only compute if hour >= REFRESH_HOUR (solar day complete) or no cache exists
            if hour_local < _SOILING_REFRESH_HOUR and cached:
                continue  # too early and we already used cache above

            kpi_data = fs.get_station_real_kpi_enriched([code])
            data_list = kpi_data.get("data", [])
            kpi = data_list[0].get("dataItemMap", {}) if data_list else {}

            # Capacity priority: 1) our DB (most reliable), 2) FusionSolar station list, 3) default
            db_station = db.query(ClientStation).filter(ClientStation.station_code == code).first()
            capacity = db_station.installed_capacity_kwp if db_station and db_station.installed_capacity_kwp else None
            if not capacity:
                capacity = kpi.get("installed_capacity") or None
            if not capacity:
                capacity = fs.get_station_capacity(code)
            capacity = float(capacity) if capacity else 10.0
            day_power = kpi.get("day_power")

            cap_source = ("db" if (db_station and db_station.installed_capacity_kwp)
                          else "kpi" if kpi.get("installed_capacity")
                          else "default")
            logger.info("[soiling] station %s: computing fresh — hour_local=%d, day_power=%s, capacity=%s kWp (source=%s)",
                        code, hour_local, day_power, capacity, cap_source)

            # Guard: need real production data to predict
            if not day_power:
                logger.warning("[soiling] station %s: no day_power available, skipping", code)
                continue

            # Look up last cleaning
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
                max(0, (now_utc - last_clean.completed_date).days)
                if last_clean and last_clean.completed_date else 30
            )

            features = {
                "installed_capacity_kwp":   capacity,
                "day_power":                day_power,
                "days_since_last_cleaning": days_since_cleaning,
            }

            # Fetch today's weather (complete by evening)
            coords = fs.get_station_location(code)
            if coords:
                features.update(weather_svc.get_weather(*coords))
            result = soiling_service.predict_soiling(features)

            # Only cache after 20:00 local — before that, day_power is still partial
            # and would give a falsely high soiling index (e.g. 46% at 1pm = half-day data)
            if hour_local >= _SOILING_REFRESH_HOUR:
                _soiling_daily_cache[code] = {
                    "result": result, "date": today_str,
                    "capacity": capacity, "computed_at": now_utc.isoformat(),
                }
                logger.info("[soiling] station %s: cached final prediction — soiling=%.4f (%s)",
                            code, result["soiling_index"], result["status"])
            else:
                logger.info("[soiling] station %s: live prediction (not cached, day incomplete) — soiling=%.4f",
                            code, result["soiling_index"])
            severity = result["status"]  # clean, attention, or critique
            if severity == "clean":
                continue  # no alert when panels are clean
            title_map = {"attention": "Encrassement modéré détecté", "critique": "Encrassement critique détecté — Soiling Index élevé"}
            # daily_loss: use real capacity so DH estimate is per-station accurate
            daily_loss = round(result["energy_loss_percent"] / 100 * capacity * 5.5 * 1.5, 1)
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
