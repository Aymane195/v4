import os
import logging
import joblib
import numpy as np

logger = logging.getLogger(__name__)

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "ml_models", "model_ia_soiling.pkl")

# 9 features the trained Random Forest expects — in exact training order
FEATURES_ORDER = [
    "irradiation_kwh_m2",
    "temp_air_c",
    "humidity_pct",
    "wind_speed_ms",
    "precipitation_mm",
    "days_since_last_rain",
    "days_since_last_cleaning",
    "installed_capacity_kwp",
    "p_theoretical_kwh",
]

# Safe defaults for features not available from FusionSolar
_DEFAULTS = {
    "temp_air_c":             25.0,
    "humidity_pct":           60.0,   # Morocco average
    "wind_speed_ms":           3.0,   # Morocco average
    "precipitation_mm":        0.0,   # conservative
    "days_since_last_rain":    7,
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


# ── Method 1: direct production-based calculation ────────────────────────────

def _method1(p_theoretical: float, p_real: float):
    """soiling = 1 - (p_real / p_theoretical), clipped 0–0.60"""
    if p_theoretical and p_theoretical > 0 and p_real is not None:
        return float(np.clip(1.0 - (p_real / p_theoretical), 0.0, 0.60))
    return None


# ── Hybrid decision engine (from trained model design) ───────────────────────

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
        diagnostic = "Données météo douteuses — IA seule utilisée"

    soiling_final = float(np.clip(soiling_final, 0.0, 0.60))

    if soiling_final > 0.35:
        alert_level = "CRITIQUE"
        alert_action = "Nettoyage IMMÉDIAT requis"
    elif soiling_final > 0.20:
        alert_level = "ALERTE"
        alert_action = "Nettoyage dans 2-3 jours"
    elif soiling_final > 0.12:
        alert_level = "AVERTISSEMENT"
        alert_action = "Planifier un nettoyage cette semaine"
    else:
        alert_level = "NORMAL"
        alert_action = "Panneaux propres. Surveillance normale."

    return {
        "soiling_final": round(soiling_final, 4),
        "confidence":    confidence,
        "diagnostic":    diagnostic,
        "alert_level":   alert_level,
        "alert_action":  alert_action,
        "gap":           round(gap, 4),
        "method1":       round(m1, 4),
        "method2":       round(m2, 4),
    }


def _alert_level_to_status(alert_level: str) -> tuple[str, str]:
    """Map new alert levels to legacy status + recommendation for backward compat."""
    if alert_level == "NORMAL":
        return "clean", "Panneaux propres. Aucune action requise."
    elif alert_level in ("AVERTISSEMENT", "ALERTE"):
        return "attention", "Encrassement modéré détecté. Nettoyage recommandé cette semaine."
    else:  # CRITIQUE
        return "critique", "Encrassement critique. Nettoyage immédiat recommandé."


# ── Public API ────────────────────────────────────────────────────────────────

def predict_soiling(features: dict) -> dict:
    """
    Predict soiling using the hybrid engine.

    Expected keys (all optional — missing values use safe defaults):
        irradiation_kwh_m2, temp_air_c, humidity_pct, wind_speed_ms,
        precipitation_mm, days_since_last_rain, days_since_last_cleaning,
        installed_capacity_kwp (or installed_capacity),
        p_theoretical_kwh, p_real (actual inverter power for Method 1)
    """
    model = _load_model()

    # Normalise alternate key names coming from FusionSolar
    rad   = features.get("irradiation_kwh_m2") or features.get("radiation_intensity") or 0.0
    cap   = features.get("installed_capacity_kwp") or features.get("installed_capacity") or 1.0
    temp  = features.get("temp_air_c") or features.get("temperature") or _DEFAULTS["temp_air_c"]

    p_theoretical = features.get("p_theoretical_kwh") or (cap * (rad / 1000.0)) or None
    p_real        = features.get("p_real") or features.get("inverter_power") or None

    # Build 9-feature vector with defaults for anything missing
    fv = {
        "irradiation_kwh_m2":      rad,
        "temp_air_c":              temp,
        "humidity_pct":            features.get("humidity_pct",            _DEFAULTS["humidity_pct"]),
        "wind_speed_ms":           features.get("wind_speed_ms",           _DEFAULTS["wind_speed_ms"]),
        "precipitation_mm":        features.get("precipitation_mm",        _DEFAULTS["precipitation_mm"]),
        "days_since_last_rain":    features.get("days_since_last_rain",    _DEFAULTS["days_since_last_rain"]),
        "days_since_last_cleaning": features.get("days_since_last_cleaning", _DEFAULTS["days_since_last_cleaning"]),
        "installed_capacity_kwp":  cap,
        "p_theoretical_kwh":       p_theoretical or cap,
    }

    # ── Method 2: IA Random Forest prediction ────────────────────────────────
    if model == "stub":
        power_ratio = (p_real / cap) if (p_real and cap > 0) else 0.0
        m2 = float(np.clip(max(0.0, 1.0 - power_ratio - (rad / 1000.0) * 0.05), 0.0, 0.50))
        confidence = 60
        diagnostic = "Mode dégradé — modèle IA non disponible"
        alert_level = None
    else:
        vec = np.array([[fv[k] for k in FEATURES_ORDER]])
        m2  = float(np.clip(model.predict(vec)[0], 0.0, 0.60))
        confidence = None  # set by hybrid engine
        diagnostic = None
        alert_level = None

    # ── Hybrid or IA-only ────────────────────────────────────────────────────
    m1 = _method1(p_theoretical, p_real) if p_theoretical and p_real else None

    if m1 is not None and model != "stub":
        result = _hybrid_engine(m1, m2)
    else:
        # IA-only path (no p_real available, or stub mode)
        if model != "stub":
            confidence = 70
            diagnostic = "Prédiction IA uniquement — données de production non disponibles"
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
        else:
            alert_level  = None
            alert_action = "Mode dégradé — modèle IA non disponible"

        result = {
            "soiling_final": round(m2, 4),
            "confidence":    confidence,
            "diagnostic":    diagnostic,
            "alert_level":   alert_level,
            "alert_action":  alert_action,
            "gap":           None,
            "method1":       None,
            "method2":       round(m2, 4),
        }

    # ── Build response (backward-compatible shape + new fields) ──────────────
    soiling_index       = result["soiling_final"]
    energy_loss_percent = round(soiling_index * 100, 2)
    al                  = result.get("alert_level")
    status, recommendation = _alert_level_to_status(al) if al else (
        "clean" if soiling_index < 0.15 else ("attention" if soiling_index < 0.40 else "critique"),
        alert_action if model == "stub" else "",
    )

    return {
        # Legacy fields — frontend and email code unchanged
        "soiling_index":       round(soiling_index, 4),
        "energy_loss_percent": energy_loss_percent,
        "status":              status,
        "recommendation":      recommendation,
        # New enriched fields
        "confidence":          result.get("confidence"),
        "alert_level":         al,
        "diagnostic":          result.get("diagnostic"),
    }
