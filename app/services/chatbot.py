"""
SolarAI WhatsApp Chatbot — handles incoming WhatsApp messages and returns
bot replies using the project's existing data pipeline and soiling service.
"""

import datetime
from sqlalchemy.orm import Session

from app.models import User, ClientStation, Intervention, InterventionType, InterventionStatus
from app.services.fusionsolar import client as fs
from app.services import demo as demo_svc
from app.services import soiling as soiling_svc


HELP_TEXT = (
    "*Commandes SolarAI :*\n\n"
    "- *production* — production solaire du jour\n"
    "- *soiling* — indice d'encrassement actuel\n"
    "- *status* — état de la station\n"
    "- *cleaning* — recommandation de nettoyage\n"
    "- *help* — afficher cette aide"
)

WELCOME_TEXT = (
    "Bonjour {name} !\n\n"
    "Bienvenue sur l'assistant *SolarAI*.\n"
    "Vous pouvez consulter vos données solaires directement ici.\n\n"
    + HELP_TEXT
)


def handle_message(phone_number: str, incoming_text: str, db: Session) -> str:
    """Process a WhatsApp message and return the bot reply."""
    command = (incoming_text or "").strip().lower()

    # Find the user by phone number
    user = db.query(User).filter(User.phone == phone_number).first()

    if user is None:
        return (
            "SolarAI ne reconnaît pas ce numéro.\n"
            "Veuillez d'abord enregistrer votre numéro WhatsApp "
            "dans l'application web (Réglages > Notifications)."
        )

    if command == "help":
        return HELP_TEXT

    if command in ("bonjour", "salut", "hi", "hello", "salam"):
        return WELCOME_TEXT.format(name=user.full_name)

    # Get the user's first station
    station = (
        db.query(ClientStation)
        .filter(ClientStation.client_id == user.id)
        .first()
    )
    if station is None:
        return (
            "Aucune station n'est encore liée à votre compte.\n"
            "Contactez votre installateur pour configurer votre station."
        )

    code = station.station_code
    name = station.station_name or code

    # Fetch real-time KPI
    try:
        if demo_svc.is_demo(code):
            kpi_resp = demo_svc.realtime_kpi()
        else:
            kpi_resp = fs.get_station_real_kpi([code])

        data_list = kpi_resp.get("data", [])
        kpi = data_list[0].get("dataItemMap", {}) if data_list else {}
    except Exception:
        kpi = {}

    power = kpi.get("inverter_power") or 0.0
    day_power = kpi.get("day_power") or 0.0
    radiation = kpi.get("radiation_intensity") or 0.0
    capacity = kpi.get("installed_capacity") or 1.0
    month_power = kpi.get("month_power") or 0.0
    total_power = kpi.get("total_power") or 0.0

    # --- Commands ---

    if command == "production":
        revenue = round(day_power * 1.5, 2)
        return (
            f"*Production solaire — {name}*\n\n"
            f"Puissance actuelle : *{_fmt(power)} kW*\n"
            f"Production du jour : *{_fmt(day_power)} kWh*\n"
            f"Production du mois : *{_fmt(month_power)} kWh*\n"
            f"Revenu du jour : *{_fmt(revenue)} DH*"
        )

    if command in ("soiling", "encrassement"):
        soiling_result = _get_soiling(code, kpi, radiation, power, capacity, db)
        pct = round(soiling_result["soiling_index"] * 100, 1)
        loss = soiling_result["energy_loss_percent"]
        status_emoji = {"clean": "✅", "attention": "⚠️", "critique": "🔴"}.get(soiling_result["status"], "❓")
        resp = (
            f"*Indice d'encrassement — {name}*\n\n"
            f"{status_emoji} Encrassement : *{_fmt(pct)}%*\n"
            f"Perte d'énergie estimée : *{_fmt(loss)}%*\n"
        )
        if soiling_result.get("diagnostic"):
            resp += f"Diagnostic : _{soiling_result['diagnostic']}_\n"
        if soiling_result["status"] != "clean":
            resp += f"\n⚠️ {soiling_result['recommendation']}"
        return resp

    if command in ("status", "état", "etat"):
        soiling_result = _get_soiling(code, kpi, radiation, power, capacity, db)
        level = soiling_result.get("alert_level") or _status_label(soiling_result["status"])
        health = "🟢 En ligne" if power > 0 else "🔴 Hors ligne"
        status_emoji = {"NORMAL": "✅", "AVERTISSEMENT": "⚠️", "ALERTE": "⚠️", "CRITIQUE": "🔴"}.get(level, "❓")
        resp = (
            f"*État de la station — {name}*\n\n"
            f"Connexion : {health}\n"
            f"Puissance : *{_fmt(power)} kW*\n"
            f"Encrassement : {status_emoji} *{level}*\n"
        )
        if soiling_result["status"] != "clean":
            resp += f"\n⚠️ {soiling_result['recommendation']}"
        return resp

    if command in ("cleaning", "nettoyage"):
        soiling_result = _get_soiling(code, kpi, radiation, power, capacity, db)
        if soiling_result["status"] == "clean":
            return (
                f"*Recommandation de nettoyage — {name}*\n\n"
                "✅ *NON* — Vos panneaux sont propres.\n"
                "Aucune action requise."
            )
        return (
            f"*Recommandation de nettoyage — {name}*\n\n"
            f"⚠️ *OUI* — Nettoyage recommandé.\n"
            f"{soiling_result['recommendation']}"
        )

    # Unknown command
    return (
        "Commande non reconnue.\n"
        "Tapez *help* pour voir les commandes disponibles."
    )


# ── Helpers ──────────────────────────────────────────────────────────────────

def _fmt(v):
    if v is None:
        return "--"
    return f"{float(v):,.1f}".replace(",", " ").replace(".", ",")


def _status_label(status: str) -> str:
    return {"clean": "NORMAL", "attention": "ALERTE", "critique": "CRITIQUE"}.get(status, status.upper())


def _get_soiling(code, kpi, radiation, power, capacity, db):
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
        "installed_capacity_kwp": capacity,
        "p_theoretical_kwh": capacity * (radiation / 1000.0) if radiation else None,
        "p_real": power,
        "days_since_last_cleaning": days_since_cleaning,
    }
    return soiling_svc.predict_soiling(features)
