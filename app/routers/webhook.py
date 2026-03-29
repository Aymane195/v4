"""
Twilio WhatsApp webhook — receives incoming messages and replies via the chatbot.
"""

from fastapi import APIRouter, Depends, Form
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.services.chatbot import handle_message

router = APIRouter(prefix="/webhook", tags=["Webhook"])


@router.post("/whatsapp", response_class=PlainTextResponse)
def whatsapp_webhook(
    Body: str = Form(""),
    From: str = Form(""),
    db: Session = Depends(get_db),
):
    """
    Twilio sends a POST here when a WhatsApp message arrives.
    We reply with TwiML so Twilio sends the response back to the user.
    """
    # Twilio sends phone as "whatsapp:+212706376987" — strip the prefix
    phone = From.replace("whatsapp:", "").strip()

    reply = handle_message(phone_number=phone, incoming_text=Body, db=db)

    # Return TwiML response
    twiml = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        "<Response>"
        f"<Message>{_escape_xml(reply)}</Message>"
        "</Response>"
    )
    return PlainTextResponse(content=twiml, media_type="text/xml")


def _escape_xml(text: str) -> str:
    """Escape special XML characters."""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )
