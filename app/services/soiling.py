import os
import logging
import joblib
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "ml_models", "model_soiling_rf_optimized.pkl")

# 9 features in the exact order the model was trained on
FEATURES_ORDER = [
    "irradiation_kwh_m2",      # daily irradiation kWh/m²/day (Open-Meteo)
    "temp_air_c",              # air temperature °C
    "humidity_pct",            # relative humidity %
    "wind_speed_ms",           # wind speed m/s
    "precipitation_mm",        # precipitation mm
    "days_since_last_rain",    # days since last rain (> 0.1 mm)
    "days_since_last_cleaning",# days since last panel cleaning
    "installed_capacity_kwp",  # installed capacity kWp
    "power_ratio",             # actual_day_power / theoretical_day_power (0–1)
]

# Safe defaults for features not available in real-time
_DEFAULTS = {
    "temp_air_c":              28.0,
    "humidity_pct":            50.0,   # Morocco average
    "wind_speed_ms":            4.0,   # Morocco average
    "precipitation_mm":         0.0,   # conservative
    "days_since_last_rain":    10,
    "days_since_last_cleaning": 30,
}

_model = None


def _load_model():
    global _model
    if _model is None:
        if os.path.exists(MODEL_PATH):
            _model = joblib.load(MODEL_PATH)
            logger.info("[soiling] model loaded: %s", MODEL_PATH)
        else:
            _model = "stub"
            logger.warning("[soiling] stub mode — model not found at %s", MODEL_PATH)
    return _model


# ── Method 1: direct production ratio ────────────────────────────────────────

def _method1(power_ratio: float) -> float | None:
    """soiling = 1 - power_ratio, clipped 0–0.60. Requires a valid power_ratio."""
    if power_ratio is not None and 0.0 < power_ratio <= 1.5:
        return float(np.clip(1.0 - power_ratio, 0.0, 0.60))
    return None


# ── Hybrid decision engine ────────────────────────────────────────────────────

def _hybrid_engine(m1: float, m2: float) -> dict:
    gap = abs(m1 - m2)

    if gap <= 0.05:
        soiling_final = 0.40 * m1 + 0.60 * m2
        confidence = 95
        diagnostic = "Accord parfait — confiance élevée"
    elif gap <= 0.15:
        soiling_final = 0.25 * m1 + 0.75 * m2
        confidence = 80
        diagnostic = "Divergence légère — IA prioritaire"
    elif m1 > 0.35 and m2 < 0.20:
        soiling_final = m2
        confidence = 65
        diagnostic = "Anomalie matérielle suspectée — vérifier capteurs"
    else:
        soiling_final = m2
        confidence = 70
        diagnostic = "Données de production divergentes — IA seule utilisée"

    soiling_final = float(np.clip(soiling_final, 0.0, 0.60))

    if soiling_final > 0.35:
        alert_level  = "CRITIQUE"
        alert_action = "Nettoyage IMMÉDIAT requis"
    elif soiling_final > 0.20:
        alert_level  = "ALERTE"
        alert_action = "Nettoyage dans 2-3 jours"
    elif soiling_final > 0.12:
        alert_level  = "AVERTISSEMENT"
        alert_action = "Planifier un nettoyage cette semaine"
    else:
        alert_level  = "NORMAL"
        alert_action = "Panneaux propres. Surveillance normale."

    return {
        "soiling_final": round(soiling_final, 4),
        "confidence":    confidence,
        "diagnostic":    diagnostic,
        "alert_level":   alert_level,
        "alert_action":  alert_action,
    }


def _alert_to_status(alert_level: str) -> tuple[str, str]:
    if alert_level == "NORMAL":
        return "clean", "Panneaux propres. Aucune action requise."
    elif alert_level == "AVERTISSEMENT":
        return "attention", "Encrassement détecté. Planifier un nettoyage cette semaine."
    elif alert_level == "ALERTE":
        return "attention", "Encrassement modéré. Nettoyage recommandé dans 2-3 jours."
    else:  # CRITIQUE
        return "critique", "Encrassement critique. Nettoyage immédiat recommandé."


# ── Public API ────────────────────────────────────────────────────────────────

def predict_soiling(features: dict) -> dict:
    """
    Predict soiling index using the RandomForest model + hybrid engine.

    Expected keys (all optional — missing values use safe defaults):
        irradiation_kwh_m2        — daily solar irradiation kWh/m²/day (from Open-Meteo)
        temp_air_c                — air temperature
        humidity_pct              — relative humidity
        wind_speed_ms             — wind speed
        precipitation_mm          — precipitation
        days_since_last_rain      — days since rain > 0.1 mm
        days_since_last_cleaning  — days since last panel cleaning
        installed_capacity_kwp    — installed capacity (also accepts 'installed_capacity')
        power_ratio               — actual/theoretical daily production ratio
            OR provide day_power + p_theoretical to let this function compute it
            OR provide p_real + irradiation_kwh_m2 + installed_capacity_kwp
    """
    model = _load_model()

    # ── Resolve installed capacity ────────────────────────────────────────────
    cap = (
        features.get("installed_capacity_kwp")
        or features.get("installed_capacity")
        or 10.0
    )

    # ── Resolve irradiation (daily kWh/m²/day) ───────────────────────────────
    irrad = features.get("irradiation_kwh_m2") or 5.5  # Morocco daily average fallback

    # ── Compute power_ratio ───────────────────────────────────────────────────
    power_ratio = features.get("power_ratio")

    if power_ratio is None:
        # Build from day_power + theoretical
        day_power     = features.get("day_power") or features.get("p_real")
        p_theoretical = features.get("p_theoretical") or (cap * irrad if cap and irrad else None)
        if day_power is not None and p_theoretical and p_theoretical > 0:
            power_ratio = float(np.clip(day_power / p_theoretical, 0.0, 1.5))

    # Clamp to sane range; use calibrated Morocco default if still missing
    if power_ratio is None or power_ratio <= 0:
        power_ratio = 0.75  # conservative Morocco default (some soiling assumed)

    power_ratio = float(np.clip(power_ratio, 0.0, 1.5))

    # ── Build 9-feature vector ────────────────────────────────────────────────
    fv = {
        "irradiation_kwh_m2":       irrad,
        "temp_air_c":               features.get("temp_air_c")               or _DEFAULTS["temp_air_c"],
        "humidity_pct":             features.get("humidity_pct")             or _DEFAULTS["humidity_pct"],
        "wind_speed_ms":            features.get("wind_speed_ms")            or _DEFAULTS["wind_speed_ms"],
        "precipitation_mm":         features.get("precipitation_mm",         _DEFAULTS["precipitation_mm"]),
        "days_since_last_rain":     features.get("days_since_last_rain",     _DEFAULTS["days_since_last_rain"]),
        "days_since_last_cleaning": features.get("days_since_last_cleaning", _DEFAULTS["days_since_last_cleaning"]),
        "installed_capacity_kwp":   cap,
        "power_ratio":              power_ratio,
    }

    # ── Method 2: Random Forest prediction ───────────────────────────────────
    if model == "stub":
        m2 = float(np.clip(1.0 - power_ratio * 0.85, 0.10, 0.55))
        confidence  = 55
        diagnostic  = "Mode dégradé — modèle IA non disponible"
        alert_level = None
    else:
        vec = pd.DataFrame([[fv[k] for k in FEATURES_ORDER]], columns=FEATURES_ORDER)
        m2  = float(np.clip(model.predict(vec)[0], 0.0, 0.60))
        confidence  = None
        diagnostic  = None
        alert_level = None

    # ── Method 1: physics-based soiling from power_ratio ─────────────────────
    m1 = _method1(power_ratio) if power_ratio > 0 else None

    # ── Hybrid or IA-only ────────────────────────────────────────────────────
    if m1 is not None and model != "stub":
        result = _hybrid_engine(m1, m2)
    else:
        if model != "stub":
            if m2 > 0.35:
                alert_level  = "CRITIQUE"
                alert_action = "Nettoyage IMMÉDIAT requis"
            elif m2 > 0.20:
                alert_level  = "ALERTE"
                alert_action = "Nettoyage dans 2-3 jours"
            elif m2 > 0.12:
                alert_level  = "AVERTISSEMENT"
                alert_action = "Planifier un nettoyage cette semaine"
            else:
                alert_level  = "NORMAL"
                alert_action = "Panneaux propres. Surveillance normale."
            confidence = 72
            diagnostic = "Prédiction IA — ratio de production disponible"
        else:
            alert_level  = "ALERTE"
            alert_action = "Mode dégradé — modèle IA non disponible"

        result = {
            "soiling_final": round(m2, 4),
            "confidence":    confidence,
            "diagnostic":    diagnostic,
            "alert_level":   alert_level,
            "alert_action":  alert_action,
        }

    # ── Build final response ──────────────────────────────────────────────────
    soiling_index = result["soiling_final"]
    al = result.get("alert_level")
    status, recommendation = _alert_to_status(al) if al else ("attention", result.get("alert_action", ""))

    return {
        "soiling_index":       round(soiling_index, 4),
        "energy_loss_percent": round(soiling_index * 100, 2),
        "status":              status,
        "recommendation":      recommendation,
        "confidence":          result.get("confidence"),
        "alert_level":         al,
        "diagnostic":          result.get("diagnostic"),
    }
