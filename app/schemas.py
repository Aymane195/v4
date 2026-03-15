from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from app.models import UserRole


# --- Auth ---

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- User ---

class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    created_at: datetime

    class Config:
        from_attributes = True


# --- Client Stations ---

class ClientStationIn(BaseModel):
    station_code: str
    station_name: Optional[str] = None


class ClientStationOut(BaseModel):
    id: int
    client_id: int
    station_code: str
    station_name: Optional[str]

    class Config:
        from_attributes = True


# --- Soiling ---

class SoilingRequest(BaseModel):
    radiation_intensity: Optional[float] = None
    power_ratio: Optional[float] = None
    inverter_power: Optional[float] = None
    temperature: Optional[float] = None
    installed_capacity: Optional[float] = None


class SoilingResponse(BaseModel):
    soiling_index: float
    energy_loss_percent: float
    status: str          # "clean", "light_soiling", "moderate_soiling", "heavy_soiling"
    recommendation: str
