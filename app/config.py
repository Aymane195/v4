from dotenv import load_dotenv
import os

load_dotenv()

# FusionSolar
USERNAME = os.getenv("FUSIONSOLAR_USERNAME")
SYSTEM_CODE = os.getenv("FUSIONSOLAR_SYSTEM_CODE")
BASE_URL = os.getenv("FUSIONSOLAR_BASE_URL", "https://intl.fusionsolar.huawei.com")

# Database
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "solar_platform")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")

# JWT
JWT_SECRET = os.getenv("JWT_SECRET", "change-me")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "1440"))

# Email / SMTP
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "Solar AI-Optimizer")
SMTP_FROM_EMAIL = os.getenv("SMTP_FROM_EMAIL", "")
EMAIL_ENABLED = os.getenv("EMAIL_ENABLED", "false").lower() == "true"

# Twilio / WhatsApp
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")
TWILIO_WHATSAPP_FROM = os.getenv("TWILIO_WHATSAPP_FROM", "")  # e.g. "whatsapp:+14155238886"
