"""
Email notification service.
Uses Python built-in smtplib — no third-party dependency required.
"""
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app import config

logger = logging.getLogger(__name__)


def send_email(to_email: str, subject: str, html_body: str) -> bool:
    """Send an HTML email. Returns True on success, False on failure."""
    if not config.EMAIL_ENABLED:
        logger.info("[email] EMAIL_ENABLED=false, skipping send to %s", to_email)
        return False

    if not config.SMTP_USER or not config.SMTP_PASSWORD:
        logger.warning("[email] SMTP credentials not configured, skipping")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{config.SMTP_FROM_NAME} <{config.SMTP_FROM_EMAIL or config.SMTP_USER}>"
        msg["To"] = to_email
        msg.attach(MIMEText(html_body, "html", "utf-8"))

        with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(config.SMTP_USER, config.SMTP_PASSWORD)
            server.send_message(msg)

        logger.info("[email] Sent critique soiling alert to %s", to_email)
        return True
    except Exception as e:
        logger.error("[email] Failed to send to %s: %s", to_email, e)
        return False


def send_critique_soiling_alert(
    to_email: str,
    client_name: str,
    station_name: str,
    soiling_index: float,
    energy_loss_percent: float,
    daily_loss_dh: float,
    recommendation: str,
) -> bool:
    """Send a French HTML email notifying the client of critical soiling."""
    subject = "\u26a0\ufe0f Alerte Critique \u2014 Encrassement d\u00e9tect\u00e9 sur votre installation solaire"

    html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1A202C;">
      <div style="background: linear-gradient(135deg, #DC2626, #B91C1C); padding: 24px; border-radius: 12px 12px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 22px;">Alerte Encrassement Critique</h1>
        <p style="color: #FEE2E2; margin: 8px 0 0; font-size: 14px;">Solar AI-Optimizer &mdash; Notification automatique</p>
      </div>

      <div style="background: #fff; border: 1px solid #E2E8F0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
        <p style="font-size: 15px;">Bonjour <strong>{client_name}</strong>,</p>

        <p style="font-size: 14px; line-height: 1.6;">
          Notre syst&egrave;me de surveillance a d&eacute;tect&eacute; un
          <strong style="color: #DC2626;">encrassement critique</strong>
          sur votre installation <strong>{station_name}</strong>.
        </p>

        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Soiling Index</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #DC2626;">{soiling_index * 100:.1f}%</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Perte d'&eacute;nergie estim&eacute;e</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #DC2626;">{energy_loss_percent:.1f}%</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6B7280;">Perte financi&egrave;re estim&eacute;e</td>
              <td style="padding: 6px 0; text-align: right; font-weight: 700; color: #DC2626;">~{daily_loss_dh:.1f} DH/jour</td>
            </tr>
          </table>
        </div>

        <p style="font-size: 14px; line-height: 1.6;">
          <strong>Recommandation :</strong> {recommendation}
        </p>

        <div style="background: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 16px; margin: 16px 0;">
          <p style="font-size: 14px; margin: 0; color: #92400E;">
            <strong>Action sugg&eacute;r&eacute;e :</strong> Connectez-vous &agrave; votre tableau de bord et
            cr&eacute;ez une <strong>demande d'intervention</strong> pour planifier un nettoyage rapide
            de vos panneaux solaires.
          </p>
        </div>

        <p style="font-size: 13px; color: #6B7280; margin-top: 24px;">
          Cet e-mail a &eacute;t&eacute; envoy&eacute; automatiquement par Solar AI-Optimizer.<br>
          Pour modifier vos pr&eacute;f&eacute;rences de notification, acc&eacute;dez &agrave; l'onglet R&eacute;glages de votre tableau de bord.
        </p>
      </div>
    </div>
    """

    return send_email(to_email, subject, html)
