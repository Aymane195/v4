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
