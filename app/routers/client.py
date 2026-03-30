from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, cast, Date
from app.database import get_db
from app.models import User, ClientStation, Intervention, InterventionType, InterventionStatus, SolarMeasurement
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
import time as _time

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


@router.get("/kpi/history")
def get_kpi_history(
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    """
    Last 12 months of production history — one entry per month.

    Flow:
      1. Token already managed by FusionSolarClient singleton (re-login on expiry).
      2. Calls getKpiStationMonth for each of the last 12 months sequentially
         with 300ms delay between calls to stay under rate limits.
      3. Extracts month_power, on_grid_power, use_power from each response.
      4. Returns a clean structured JSON with totals and stats.

    Result is cached 1 hour (history never changes for past months).
    """
    codes = _get_station_codes(current_user, db)
    station_code = codes[0]
    station_id   = station_code.replace("NE=", "").replace("ne=", "")

    # Demo mode
    if demo_svc.is_demo(station_code):
        import math
        now = datetime.datetime.utcnow()
        historique = []
        for i in range(11, -1, -1):
            dt = (now.replace(day=1) - datetime.timedelta(days=i * 28)).replace(day=1)
            prod = round(250 + 300 * abs(math.sin(math.pi * dt.month / 12)) + (dt.month % 3) * 40, 1)
            historique.append({
                "mois": dt.strftime("%Y-%m"),
                "production_kwh": prod,
                "injection_reseau_kwh": round(prod * 0.65, 1),
                "consommation_propre_kwh": round(prod * 0.35, 1),
            })
        total = sum(h["production_kwh"] for h in historique)
        return {
            "station_id": station_id,
            "periode": "12 derniers mois",
            "historique": historique,
            "total_annuel_kwh": round(total, 1),
            "pic_mensuel_kwh": round(max(h["production_kwh"] for h in historique), 1),
            "moyenne_mensuelle_kwh": round(total / len(historique), 1),
        }

    # Cache key per station (not per user — same station, same data)
    cache_key = ("history_12m", station_code)
    cached = _annual_cache.get(cache_key)
    if cached:
        fetched_at, data = cached
        if _time.time() - fetched_at < _ANNUAL_CACHE_TTL:
            logger.info("[history] serving cached 12-month history for %s", station_code)
            return data

    # Build list of last 12 months (oldest first)
    now = datetime.datetime.utcnow()
    months = []
    for i in range(11, -1, -1):
        # Go back i months from current month
        year  = now.year  - ((now.month - 1 - (11 - i)) // 12 + (1 if (now.month - 1 - (11 - i)) < 0 else 0))
        month = ((now.month - 1 - (11 - i)) % 12) + 1 if (now.month - 1 - (11 - i)) % 12 >= 0 else ((now.month - 1 - (11 - i)) % 12) + 13
        # Simpler: subtract months via relativedelta-free arithmetic
        total_months = now.year * 12 + (now.month - 1) - i
        y = total_months // 12
        m = total_months % 12 + 1
        months.append((y, m))

    logger.info("[history] fetching 12 months for %s: %s → %s",
                station_code,
                f"{months[0][0]}-{months[0][1]:02d}",
                f"{months[-1][0]}-{months[-1][1]:02d}")

    historique = []
    for (y, m) in months:
        label = f"{y}-{m:02d}"
        production = on_grid = use = 0.0
        try:
            dt = datetime.datetime(y, m, 1)
            collect_time = int(calendar.timegm(dt.timetuple()) * 1000)
            resp = fs.get_kpi_station_month(station_code, collect_time)
            data_list = resp.get("data") or []
            item_map  = data_list[0].get("dataItemMap", {}) if data_list else {}

            production = float(item_map.get("month_power")    or 0)
            on_grid    = float(item_map.get("on_grid_power")  or
                               item_map.get("day_on_grid_energy") or 0)
            use        = float(item_map.get("use_power")       or
                               item_map.get("day_use_energy")    or 0)

            # If use/on_grid not in monthly KPI, estimate from production
            if production > 0 and on_grid == 0 and use == 0:
                on_grid = round(production * 0.65, 2)
                use     = round(production * 0.35, 2)

            logger.info("[history] %s %s → prod=%.1f  grid=%.1f  use=%.1f",
                        station_code, label, production, on_grid, use)
        except Exception as e:
            logger.warning("[history] %s %s failed: %s", station_code, label, e)

        historique.append({
            "mois": label,
            "production_kwh": round(production, 1),
            "injection_reseau_kwh": round(on_grid, 1),
            "consommation_propre_kwh": round(use, 1),
        })
        _time.sleep(0.3)

    total = sum(h["production_kwh"] for h in historique)
    result = {
        "station_id": station_id,
        "periode": "12 derniers mois",
        "historique": historique,
        "total_annuel_kwh": round(total, 1),
        "pic_mensuel_kwh": round(max((h["production_kwh"] for h in historique), default=0), 1),
        "moyenne_mensuelle_kwh": round(total / len(historique), 1) if historique else 0,
    }

    if total > 0:
        _annual_cache[cache_key] = (_time.time(), result)
        logger.info("[history] cached — total=%.1f kWh", total)
    else:
        logger.warning("[history] all zeros — not caching, will retry")

    return result


@router.get("/kpi/month-days")
def get_month_days_kpi(
    year: int = Query(..., description="Year, e.g. 2026"),
    month: int = Query(..., description="Month 1-12"),
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    """
    Daily production kWh for every day of the requested month.
    Strategy: read MAX(day_power) per day from our DB (collector stores every 30 min).
    For days not yet in DB, call FusionSolar getKpiStationDay sequentially.
    Returns: list of {day: 1..31, production_kwh: float}
    """
    codes = _get_station_codes(current_user, db)
    station_code = codes[0]

    if demo_svc.is_demo(station_code):
        import math
        result = []
        for d in range(1, 32):
            try:
                dt = datetime.date(year, month, d)
            except ValueError:
                break
            solar = max(0.0, math.sin(math.pi * (d % 30) / 30) * 18 + (d % 7) * 0.5)
            result.append({"day": d, "production_kwh": round(solar, 2)})
        return result

    import calendar as _cal
    days_in_month = _cal.monthrange(year, month)[1]
    today = datetime.date.today()

    # ── Step 1: Read from DB (MAX day_power per calendar day) ─────────────
    month_start = datetime.datetime(year, month, 1)
    month_end   = datetime.datetime(year, month, days_in_month, 23, 59, 59)

    db_rows = (
        db.query(
            cast(SolarMeasurement.recorded_at, Date).label("day"),
            func.max(SolarMeasurement.day_power).label("production_kwh"),
        )
        .filter(
            SolarMeasurement.station_code == station_code,
            SolarMeasurement.recorded_at >= month_start,
            SolarMeasurement.recorded_at <= month_end,
            SolarMeasurement.day_power.isnot(None),
            SolarMeasurement.day_power > 0,
        )
        .group_by(cast(SolarMeasurement.recorded_at, Date))
        .all()
    )
    db_by_day = {row.day.day: float(row.production_kwh) for row in db_rows}
    logger.info("[month-days] %s %d-%02d: %d days found in DB", station_code, year, month, len(db_by_day))

    # ── Step 2: Fetch missing days from FusionSolar sequentially ──────────
    result = []
    for d in range(1, days_in_month + 1):
        try:
            day_date = datetime.date(year, month, d)
        except ValueError:
            break

        if d in db_by_day:
            result.append({"day": d, "production_kwh": db_by_day[d]})
            continue

        # Skip future days
        if day_date > today:
            result.append({"day": d, "production_kwh": 0.0})
            continue

        # Fetch from FusionSolar
        production = 0.0
        try:
            dt = datetime.datetime(year, month, d)
            collect_time = int(calendar.timegm(dt.timetuple()) * 1000)
            resp = fs.get_kpi_station_day(station_code, collect_time)
            data_list = resp.get("data") or []
            item_map = data_list[0].get("dataItemMap", {}) if data_list else {}
            production = float(item_map.get("day_power") or 0)
            logger.info("[month-days] %s day %d/%02d/%d → %.2f kWh (FusionSolar)", station_code, d, month, year, production)
        except Exception as e:
            logger.warning("[month-days] %s day %d failed: %s", station_code, d, e)
        result.append({"day": d, "production_kwh": production})
        _time.sleep(0.25)  # 250ms between FusionSolar calls — avoids rate limiting

    return result


# Annual cache: { (user_id, year): (fetched_at_timestamp, data) }
_annual_cache: dict[tuple, tuple] = {}
_ANNUAL_CACHE_TTL = 3600  # 1 hour — monthly history never changes


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
        _time.sleep(0.3)  # 300ms pause between calls — stays well below FusionSolar rate limit

    total = sum(r["month_power"] for r in result)
    logger.info("[annual] year %d done: total=%.1f kWh", year, total)

    # Only cache if we got real data — never cache an all-zero result (means API was failing)
    if total > 0:
        _annual_cache[cache_key] = (_time.time(), result)
        logger.info("[annual] cached year %d", year)
    else:
        logger.warning("[annual] year %d returned all zeros — NOT caching, will retry next request", year)

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
