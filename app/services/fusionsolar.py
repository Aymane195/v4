import httpx
import time
import json
from app import config

# Cache: { cache_key: (timestamp, data) }
_cache: dict = {}
CACHE_TTL = 300  # 5 minutes — respects FusionSolar rate limits


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
                raise RuntimeError(f"FusionSolar login failed: {data.get('failCode')} — {data.get('message')}")
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
                raise RuntimeError(f"FusionSolar API error [{endpoint}]: {data.get('failCode')} — {data.get('message')}")
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
