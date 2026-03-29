"""
Twilio WhatsApp integration — sends messages to clients via WhatsApp.
"""

import logging
from app import config

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is None:
        if config.TWILIO_ACCOUNT_SID and config.TWILIO_AUTH_TOKEN:
            from twilio.rest import Client
            _client = Client(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN)
            logger.info("[whatsapp] Twilio client initialized")
        else:
            logger.warning("[whatsapp] Twilio credentials not configured — messages will be skipped")
    return _client


def send_whatsapp_message(to_number: str, body: str) -> bool:
    """
    Send a WhatsApp message via Twilio.
    to_number should be like "+212600000001" (with country code).
    Returns True on success, False on failure or if not configured.
    """
    client = _get_client()
    if client is None or not config.TWILIO_WHATSAPP_FROM:
        logger.warning("[whatsapp] Skipping message — Twilio not configured")
        return False

    try:
        # Ensure the number has the whatsapp: prefix
        to_wa = f"whatsapp:{to_number}" if not to_number.startswith("whatsapp:") else to_number
        from_wa = config.TWILIO_WHATSAPP_FROM if config.TWILIO_WHATSAPP_FROM.startswith("whatsapp:") else f"whatsapp:{config.TWILIO_WHATSAPP_FROM}"

        message = client.messages.create(
            body=body,
            from_=from_wa,
            to=to_wa,
        )
        logger.info("[whatsapp] Message sent to %s — SID: %s", to_number, message.sid)
        return True
    except Exception as e:
        logger.error("[whatsapp] Failed to send to %s: %s", to_number, e)
        return False


def send_welcome_message(to_number: str, user_name: str) -> bool:
    """Send the welcome message when a client registers their WhatsApp number."""
    body = (
        f"Bonjour {user_name} !\n\n"
        "Bienvenue sur l'assistant SolarAI.\n"
        "Vous pouvez maintenant consulter vos données solaires directement ici.\n\n"
        "Tapez *help* pour voir les commandes disponibles :\n"
        "- *production* — production solaire du jour\n"
        "- *soiling* — indice d'encrassement\n"
        "- *status* — état de la station\n"
        "- *cleaning* — recommandation de nettoyage\n"
        "- *help* — afficher cette aide"
    )
    return send_whatsapp_message(to_number, body)
