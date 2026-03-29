import httpx
import time
import json
import calendar
import datetime
import logging
from app import config

logger = logging.getLogger(__name__)

# Cache: { cache_key: (timestamp, data) }
_cache: dict = {}
CACHE_TTL = 300  # 5 minutes - respects FusionSolar rate limits

# Last-known-good KPI per station: { station_code: { field: value, ... } }
# Survives API failures and nighttime empty responses. Updated whenever FusionSolar
# returns non-null values. Realtime fields (inverter_power, radiation_intensity)
# are excluded - those are always zeroed at night by apply_realtime_correction.
_last_good_kpi: dict[str, dict] = {}
_REALTIME_ONLY_FIELDS = {"inverter_power", "radiation_intensity", "use_power", "performance_ratio"}


def _cache_get(key: str):
    entry = _cache.get(key)
    if entry and (time.time() - entry[0]) < CACHE_TTL:
        return entry[1]
    return None


def _cache_set(key: str, data):
    _cache[key] = (time.time(), data)


COMMON_DOMAINS = [
    "https://uni001eu5.fusionsolar.huawei.com",
    "https://intl.fusionsolar.huawei.com",
    "https://sg01.fusionsolar.huawei.com",
    "https://cn.fusionsolar.huawei.com",
]

LOGIN_PATH = "/thirdData/login"
TIMEOUT = 30


class FusionSolarClient:
    def __init__(self):
        self.base_url = config.BASE_URL
        self.username = config.USERNAME
        self.system_code = config.SYSTEM_CODE
        self.token: str | None = None
        self.token_time: float = 0

    # ------------------------------------------------------------------
    # Auth
    # ------------------------------------------------------------------

    def login(self) -> None:
        url = f"{self.base_url}{LOGIN_PATH}"
        payload = {"userName": self.username, "systemCode": self.system_code}
        with httpx.Client(timeout=TIMEOUT, verify=False) as client:
            resp = client.post(url, json=payload)
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success", False):
                raise RuntimeError(f"FusionSolar login failed: {data.get('failCode')} - {data.get('message')}")
            # Token comes back in the cookie AND the response header
            self.token = resp.cookies.get("XSRF-TOKEN") or resp.headers.get("xsrf-token")
            if not self.token:
                # Some regions return it inside the response body
                self.token = data.get("data", {}).get("xsrfToken") if isinstance(data.get("data"), dict) else None
            if not self.token:
                raise RuntimeError("FusionSolar login succeeded but no xsrf-token was returned.")
            self.token_time = time.time()

    def _is_token_valid(self) -> bool:
        # Tokens expire after ~30 min idle; refresh after 25 min to be safe
        return self.token is not None and (time.time() - self.token_time) < 1500

    def _request(self, endpoint: str, payload: dict) -> dict:
        cache_key = endpoint + json.dumps(payload, sort_keys=True)
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        if not self._is_token_valid():
            self.login()
        url = f"{self.base_url}{endpoint}"
        headers = {"xsrf-token": self.token, "Content-Type": "application/json"}
        with httpx.Client(timeout=TIMEOUT, verify=False) as client:
            resp = client.post(url, json=payload, headers=headers)
            # Re-login once on 401 / session expired
            if resp.status_code in (401, 403):
                self.login()
                headers["xsrf-token"] = self.token
                resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            if not data.get("success", True):
                # On rate limit (407), return cached data if available (even stale)
                if data.get("failCode") == 407:
                    stale = _cache.get(cache_key)
                    if stale:
                        return stale[1]
                raise RuntimeError(f"FusionSolar API error [{endpoint}]: {data.get('failCode')} - {data.get('message')}")
            _cache_set(cache_key, data)
            return data

    # ------------------------------------------------------------------
    # Plant / Station
    # ------------------------------------------------------------------

    def get_station_list(self) -> dict:
        return self._request("/thirdData/getStationList", {"pageNo": 1, "pageSize": 100})

    def get_station_real_kpi(self, station_codes: list[str]) -> dict:
        return self._request("/thirdData/getStationRealKpi", {"stationCodes": ",".join(station_codes)})

    def get_kpi_station_day(self, station_code: str, collect_time: int) -> dict:
        """collect_time: Unix timestamp in ms for the target day (start of day)."""
        return self._request("/thirdData/getKpiStationDay", {
            "stationCodes": station_code,
            "collectTime": collect_time,
        })

    def get_kpi_station_month(self, station_code: str, collect_time: int) -> dict:
        """collect_time: Unix timestamp in ms for any day in the target month."""
        return self._request("/thirdData/getKpiStationMonth", {
            "stationCodes": station_code,
            "collectTime": collect_time,
        })

    def get_station_real_kpi_enriched(self, station_codes: list[str]) -> dict:
        """
        Like get_station_real_kpi but enriches stations that have empty dataItemMap.

        FusionSolar sometimes returns an empty dataItemMap for a station (often at night
        or when the station code is correct but the aggregation hasn't run yet). When this
        happens, cumulative values (day_power, month_power, installed_capacity) are still
        available via the daily/monthly KPI endpoints. This method fetches those and merges
        them into the realtime response so the dashboard never shows "--" for known values.
        """
        raw = self.get_station_real_kpi(station_codes)
        data_list = raw.get("data") or []

        # Build lookup: stationCode -> entry index (FusionSolar may omit stations with no data)
        entry_by_code: dict[str, dict] = {}
        for entry in data_list:
            code = entry.get("stationCode", "")
            if code:
                entry_by_code[code] = entry

        # Ensure every requested station has an entry (even if the API returned nothing for it)
        for code in station_codes:
            if code not in entry_by_code:
                logger.warning("[fusionsolar] station %s missing from getStationRealKpi response - will attempt enrichment", code)
                placeholder = {"stationCode": code, "dataItemMap": {}}
                data_list.append(placeholder)
                entry_by_code[code] = placeholder

        # Timestamps for today and this month
        now = datetime.datetime.utcnow()
        day_start = datetime.datetime(now.year, now.month, now.day)
        day_ts = int(calendar.timegm(day_start.timetuple()) * 1000)
        month_start = datetime.datetime(now.year, now.month, 1)
        month_ts = int(calendar.timegm(month_start.timetuple()) * 1000)

        # Pull installed_capacity from station list (already cached 5 min - free call)
        station_meta: dict[str, dict] = {}
        try:
            sl = self.get_station_list()
            for s in (sl.get("data") or []):
                sc = s.get("stationCode", "")
                if sc:
                    station_meta[sc] = s
        except Exception:
            pass

        for entry in data_list:
            item_map = entry.setdefault("dataItemMap", {})
            code = entry.get("stationCode", "")

            # Only enrich if key fields are absent/None
            needs_day = item_map.get("day_power") is None
            needs_month = item_map.get("month_power") is None
            needs_cap = item_map.get("installed_capacity") is None

            if not (needs_day or needs_month or needs_cap):
                continue

            logger.info("[fusionsolar] enriching empty dataItemMap for station %s", code)

            # Daily KPI -> day_power and potentially total_power
            if needs_day and code:
                try:
                    daily = self.get_kpi_station_day(code, day_ts)
                    dm = (daily.get("data") or [{}])[0].get("dataItemMap", {})
                    for k, v in dm.items():
                        if item_map.get(k) is None and v is not None:
                            item_map[k] = v
                except Exception as e:
                    logger.warning("[fusionsolar] daily KPI enrichment failed for %s: %s", code, e)

            # Monthly KPI -> month_power
            if needs_month and code:
                try:
                    monthly = self.get_kpi_station_month(code, month_ts)
                    mm = (monthly.get("data") or [{}])[0].get("dataItemMap", {})
                    for k, v in mm.items():
                        if item_map.get(k) is None and v is not None:
                            item_map[k] = v
                except Exception as e:
                    logger.warning("[fusionsolar] monthly KPI enrichment failed for %s: %s", code, e)

            # Station list meta -> installed_capacity (try every known field name)
            if needs_cap and code in station_meta:
                meta = station_meta[code]
                if item_map.get("installed_capacity") is None:
                    cap = (
                        meta.get("capacity")
                        or meta.get("installedCapacity")
                        or meta.get("installed_capacity")
                        or meta.get("installedPower")
                        or meta.get("dcCapacity")
                        or meta.get("systemSize")
                    )
                    if cap is not None:
                        item_map["installed_capacity"] = float(cap)

        raw["data"] = data_list
        return raw

    # ------------------------------------------------------------------
    # Devices
    # ------------------------------------------------------------------

    def get_dev_list(self, station_code: str) -> dict:
        return self._request("/thirdData/getDevList", {"stationCodes": station_code})

    def get_dev_real_kpi(self, dev_ids: list[str], dev_type_id: int) -> dict:
        return self._request("/thirdData/getDevRealKpi", {
            "devIds": ",".join(dev_ids),
            "devTypeId": dev_type_id,
        })

    # ------------------------------------------------------------------
    # Alarms
    # ------------------------------------------------------------------

    def get_alarm_list(self, station_code: str, begin_time: int | None = None, end_time: int | None = None) -> dict:
        payload: dict = {"stationCodes": station_code}
        if begin_time:
            payload["beginTime"] = begin_time
        if end_time:
            payload["endTime"] = end_time
        return self._request("/thirdData/getAlarmList", payload)

    def get_station_power_from_devices(self, station_code: str) -> float | None:
        """
        Sum inverter active_power from device-level KPIs.
        Used as fallback when station-level inverter_power = 0 despite inverters running.
        Returns total kW, or None if unavailable.
        """
        try:
            dev_data = self.get_dev_list(station_code)
            devices = dev_data.get("data", [])
            # devTypeId 1 = string inverter, 2 = central inverter
            inverter_ids = [str(d["id"]) for d in devices if d.get("devTypeId") in (1, 2)]
            if not inverter_ids:
                return None
            kpi_resp = self.get_dev_real_kpi(inverter_ids, 1)
            total = sum(
                float(e.get("dataItemMap", {}).get("active_power", 0) or 0)
                for e in kpi_resp.get("data", [])
            )
            return round(total, 3) if total > 0 else None
        except Exception:
            return None

    def get_station_location(self, station_code: str) -> tuple[float, float] | None:
        """Return (latitude, longitude) for a station from the station list, or None."""
        try:
            data = self.get_station_list()
            for entry in data.get("data", []):
                if entry.get("stationCode") == station_code:
                    lat = entry.get("latitude")
                    lng = entry.get("longitude")
                    if lat is not None and lng is not None:
                        return (float(lat), float(lng))
        except Exception:
            pass
        return None

    def get_station_capacity(self, station_code: str) -> float | None:
        """
        Return installed capacity in kWp for a station from the station list.

        Tries all known FusionSolar field names for capacity. Logs what it finds
        so mismatches can be diagnosed. Returns None if station not found.
        """
        try:
            data = self.get_station_list()
            all_codes = [s.get("stationCode") for s in (data.get("data") or [])]
            logger.info("[fusionsolar] get_station_capacity(%s): station list has %d stations, codes=%s",
                        station_code, len(all_codes), all_codes)
            for s in (data.get("data") or []):
                if s.get("stationCode") == station_code:
                    cap = (
                        s.get("capacity")
                        or s.get("installedCapacity")
                        or s.get("installed_capacity")
                        or s.get("installedPower")
                        or s.get("dcCapacity")
                        or s.get("systemSize")
                    )
                    logger.info("[fusionsolar] station %s found in list — capacity field values: "
                                "capacity=%s installedCapacity=%s installed_capacity=%s "
                                "installedPower=%s dcCapacity=%s → using %.4f",
                                station_code,
                                s.get("capacity"), s.get("installedCapacity"),
                                s.get("installed_capacity"), s.get("installedPower"),
                                s.get("dcCapacity"),
                                float(cap) if cap is not None else 0.0)
                    return float(cap) if cap is not None else None
            logger.warning("[fusionsolar] station %s NOT found in station list (code mismatch?)", station_code)
        except Exception as e:
            logger.warning("[fusionsolar] get_station_capacity failed for %s: %s", station_code, e)
        return None

    # ------------------------------------------------------------------
    # Domain discovery
    # ------------------------------------------------------------------

    def test_all_domains(self) -> list[dict]:
        results = []
        payload = {"userName": self.username, "systemCode": self.system_code}
        for domain in COMMON_DOMAINS:
            url = f"{domain}{LOGIN_PATH}"
            try:
                with httpx.Client(timeout=10, verify=False) as client:
                    resp = client.post(url, json=payload)
                    data = resp.json()
                    results.append({
                        "domain": domain,
                        "status": resp.status_code,
                        "success": data.get("success", False),
                        "failCode": data.get("failCode"),
                        "message": data.get("message"),
                    })
            except Exception as e:
                results.append({"domain": domain, "status": "error", "error": str(e)})
        return results


# Singleton client shared across requests
client = FusionSolarClient()
