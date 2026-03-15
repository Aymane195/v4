import os
import joblib
import numpy as np

MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "ml_models", "soiling_model.pkl")

_model = None


def _load_model():
    global _model
    if _model is None:
        if os.path.exists(MODEL_PATH):
            _model = joblib.load(MODEL_PATH)
        else:
            _model = "stub"
    return _model


def _soiling_label(index: float) -> tuple[str, str]:
    if index < 0.02:
        return "clean", "Panels are clean. No action required."
    elif index < 0.05:
        return "light_soiling", "Light dust detected. Schedule cleaning within 2 weeks."
    elif index < 0.10:
        return "moderate_soiling", "Moderate soiling detected. Schedule cleaning this week."
    else:
        return "heavy_soiling", "Heavy soiling detected. Immediate cleaning recommended."


def predict_soiling(features: dict) -> dict:
    model = _load_model()

    radiation = features.get("radiation_intensity") or 0.0
    inverter_power = features.get("inverter_power") or 0.0
    installed_capacity = features.get("installed_capacity") or 1.0
    temperature = features.get("temperature") or 25.0

    if model == "stub":
        # Stub: estimate power ratio from available data
        power_ratio = inverter_power / installed_capacity if installed_capacity > 0 else 0.0
        # Simple heuristic until real model is loaded
        soiling_index = max(0.0, round(1.0 - power_ratio - (radiation / 1000.0) * 0.05, 4)) if power_ratio > 0 else 0.0
        soiling_index = min(soiling_index, 0.5)
    else:
        feature_vector = np.array([[
            radiation,
            inverter_power,
            installed_capacity,
            temperature,
            features.get("power_ratio") or (inverter_power / installed_capacity if installed_capacity > 0 else 0.0),
        ]])
        soiling_index = float(model.predict(feature_vector)[0])

    energy_loss_percent = round(soiling_index * 100, 2)
    status, recommendation = _soiling_label(soiling_index)

    return {
        "soiling_index": round(soiling_index, 4),
        "energy_loss_percent": energy_loss_percent,
        "status": status,
        "recommendation": recommendation,
    }
