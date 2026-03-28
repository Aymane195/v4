import logging
import time
import httpx

logger = logging.getLogger(__name__)

_OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
_CACHE_TTL = 3600  # 1 hour
_cache: dict = {}  # { (lat_rounded, lng_rounded): (timestamp, data) }


def get_weather(lat: float, lng: float) -> dict:
    """
    Fetch today's weather from Open-Meteo (free, no API key).

    Returns dict with keys matching soiling model feature names:
        irradiation_kwh_m2, temp_air_c, humidity_pct,
        wind_speed_ms, precipitation_mm, days_since_last_rain

    Returns {} on any network/parse error — caller falls back to defaults.
    """
    # Round to 2 decimal places for cache key (~1 km resolution)
    key = (round(lat, 2), round(lng, 2))
    cached = _cache.get(key)
    if cached and (time.time() - cached[0]) < _CACHE_TTL:
        return cached[1]

    try:
        params = {
            "latitude":  lat,
            "longitude": lng,
            "daily": ",".join([
                "shortwave_radiation_sum",
                "precipitation_sum",
                "wind_speed_10m_max",
                "relative_humidity_2m_mean",
                "temperature_2m_mean",
            ]),
            "timezone":      "Africa/Casablanca",
            "past_days":     7,
            "forecast_days": 1,
        }
        with httpx.Client(timeout=10) as client:
            resp = client.get(_OPEN_METEO_URL, params=params)
            resp.raise_for_status()
            data = resp.json()

        daily = data.get("daily", {})

        # Each key maps to a list ordered oldest → newest; today is the last entry
        def last(key_name):
            vals = daily.get(key_name, [])
            return vals[-1] if vals else None

        irradiation  = last("shortwave_radiation_sum")  # kWh/m²/day — matches training data
        temp         = last("temperature_2m_mean")       # °C
        humidity     = last("relative_humidity_2m_mean") # %
        wind         = last("wind_speed_10m_max")        # m/s (max of day is a good proxy)
        precip_today = last("precipitation_sum")         # mm

        # Calculate days since last rain from past 7 days + today
        precip_series = daily.get("precipitation_sum", [])
        days_since_rain = 7  # default if nothing found
        for i, p in enumerate(reversed(precip_series)):
            if p is not None and p > 0.1:
                days_since_rain = i
                break

        result = {}
        if irradiation  is not None: result["irradiation_kwh_m2"]   = irradiation
        if temp         is not None: result["temp_air_c"]            = temp
        if humidity     is not None: result["humidity_pct"]          = humidity
        if wind         is not None: result["wind_speed_ms"]         = wind
        if precip_today is not None: result["precipitation_mm"]      = precip_today
        result["days_since_last_rain"] = days_since_rain

        _cache[key] = (time.time(), result)
        logger.info("[weather] fetched Open-Meteo for (%.2f, %.2f): irrad=%.2f, temp=%.1f, hum=%.0f%%",
                    lat, lng, irradiation or 0, temp or 0, humidity or 0)
        return result

    except Exception as exc:
        logger.warning("[weather] Open-Meteo failed for (%.2f, %.2f): %s", lat, lng, exc)
        return {}
