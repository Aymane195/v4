"""
Data validation and cleaning for solar measurements.

Rules:
  1. Nighttime (20:00–06:00): production_current forced to 0, irradiance forced to 0
  2. production_current cannot exceed installed_capacity
  3. production_current cannot be negative
  4. irradiance must be 0–1500 W/m²
  5. temperature must be -10–80 °C (panel temp range)
  6. performance_ratio must be 0–1
  7. If irradiance > 50 W/m² but production = 0 during daytime → flag as suspicious
"""
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Morocco timezone offset (UTC+1, no DST since 2018)
_MOROCCO_UTC_OFFSET = 1


def _local_hour(utc_dt: datetime) -> int:
    """Get approximate Morocco local hour from a UTC datetime."""
    return (utc_dt.hour + _MOROCCO_UTC_OFFSET) % 24


def is_nighttime(utc_dt: datetime) -> bool:
    """True if it's nighttime in Morocco (20:00–06:00 local)."""
    h = _local_hour(utc_dt)
    return h >= 20 or h < 6


def validate_and_clean(data: dict, utc_now: datetime | None = None) -> dict:
    """
    Validate and clean a raw measurement dict from FusionSolar.

    Args:
        data: dict with keys like production_current, irradiance, temperature,
              installed_capacity, day_power, performance_ratio
        utc_now: timestamp of the measurement (defaults to now)

    Returns:
        dict with same keys plus:
            is_valid: bool — False if data is unreliable even after correction
            was_corrected: bool — True if any value was modified
            validation_notes: str — comma-separated list of corrections/flags
    """
    if utc_now is None:
        utc_now = datetime.utcnow()

    notes = []
    corrected = False
    valid = True

    production = data.get("production_current")
    irradiance = data.get("irradiance")
    temperature = data.get("temperature")
    capacity = data.get("installed_capacity")
    perf_ratio = data.get("performance_ratio")

    # ── Rule 1: Nighttime → zero production and irradiance ───────────────
    if is_nighttime(utc_now):
        if production and production > 0:
            notes.append(f"nuit: production {production} kW → 0")
            data["production_current"] = 0.0
            corrected = True
        if irradiance and irradiance > 0:
            notes.append(f"nuit: irradiance {irradiance} W/m² → 0")
            data["irradiance"] = 0.0
            corrected = True

    # ── Rule 2: Production cannot exceed installed capacity ──────────────
    if production is not None and capacity is not None and capacity > 0:
        if production > capacity * 1.1:  # 10% tolerance for measurement spikes
            notes.append(f"production {production} kW > capacité {capacity} kWp")
            data["production_current"] = capacity
            corrected = True

    # ── Rule 3: No negative production ───────────────────────────────────
    if production is not None and production < 0:
        notes.append(f"production négative {production} kW → 0")
        data["production_current"] = 0.0
        corrected = True

    # ── Rule 4: Irradiance range 0–1500 W/m² ────────────────────────────
    if irradiance is not None:
        if irradiance < 0:
            notes.append(f"irradiance négative {irradiance} → 0")
            data["irradiance"] = 0.0
            corrected = True
        elif irradiance > 1500:
            notes.append(f"irradiance {irradiance} W/m² hors plage → invalide")
            valid = False

    # ── Rule 5: Temperature range -10–80 °C ──────────────────────────────
    if temperature is not None:
        if temperature < -10 or temperature > 80:
            notes.append(f"température {temperature}°C hors plage → invalide")
            valid = False

    # ── Rule 6: Performance ratio 0–1 ────────────────────────────────────
    if perf_ratio is not None:
        if perf_ratio < 0 or perf_ratio > 1:
            notes.append(f"performance_ratio {perf_ratio} hors [0,1] → invalide")
            valid = False

    # ── Rule 7: Daytime with irradiance but zero production → suspicious ─
    if not is_nighttime(utc_now):
        prod = data.get("production_current") or 0
        irr = data.get("irradiance") or 0
        if irr > 50 and prod == 0:
            notes.append("irradiance >50 W/m² mais production=0 — possible panne")
            valid = False

    data["is_valid"] = valid
    data["was_corrected"] = corrected
    data["validation_notes"] = ", ".join(notes) if notes else None

    if notes:
        logger.info("[validation] station=%s: %s", data.get("station_code", "?"), "; ".join(notes))

    return data


def apply_realtime_correction(fusionsolar_response: dict, utc_now: datetime | None = None) -> dict:
    """
    Apply nighttime correction directly to a raw FusionSolar getStationRealKpi response.
    Returns the same response dict with corrected dataItemMap values.
    Used for live dashboard endpoints (not just background collection).
    """
    if utc_now is None:
        utc_now = datetime.utcnow()

    if not is_nighttime(utc_now):
        return fusionsolar_response  # daytime — nothing to correct

    data_list = fusionsolar_response.get("data", [])
    for entry in data_list:
        item_map = entry.get("dataItemMap", {})
        if item_map.get("inverter_power", 0) != 0:
            logger.info("[validation] nighttime correction: inverter_power %s → 0",
                        item_map.get("inverter_power"))
            item_map["inverter_power"] = 0
        if item_map.get("radiation_intensity", 0) != 0:
            item_map["radiation_intensity"] = 0

    return fusionsolar_response
