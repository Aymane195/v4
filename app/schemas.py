from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, date
from app.models import UserRole, InstallationType, AlertPreference, InterventionType, InterventionPriority, InterventionStatus


# --- Auth ---

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str
    role: UserRole
    phone: Optional[str] = None
    installation_type: Optional[InstallationType] = None
    num_panels: Optional[int] = None
    fusionsolar_username: Optional[str] = None
    fusionsolar_password: Optional[str] = None
    alert_preference: Optional[AlertPreference] = AlertPreference.email


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# --- User ---

class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    role: UserRole
    phone: Optional[str] = None
    installation_type: Optional[InstallationType] = None
    num_panels: Optional[int] = None
    fusionsolar_username: Optional[str] = None
    fusionsolar_password: Optional[str] = None
    alert_preference: Optional[AlertPreference] = None
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
    # FusionSolar realtime fields
    radiation_intensity: Optional[float] = None
    inverter_power: Optional[float] = None
    installed_capacity: Optional[float] = None
    temperature: Optional[float] = None
    power_ratio: Optional[float] = None
    # Extended fields for full hybrid-engine accuracy
    irradiation_kwh_m2: Optional[float] = None
    temp_air_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    wind_speed_ms: Optional[float] = None
    precipitation_mm: Optional[float] = None
    days_since_last_rain: Optional[int] = None
    days_since_last_cleaning: Optional[int] = None
    installed_capacity_kwp: Optional[float] = None
    p_theoretical_kwh: Optional[float] = None
    p_real: Optional[float] = None   # actual production for Method 1


class SoilingResponse(BaseModel):
    soiling_index: float
    energy_loss_percent: float
    status: str
    recommendation: str
    # Enriched fields from hybrid engine
    confidence: Optional[int] = None
    alert_level: Optional[str] = None
    diagnostic: Optional[str] = None


# --- Interventions ---

class InterventionCreate(BaseModel):
    station_code: str
    station_name: Optional[str] = None
    alarm_name: str
    alarm_severity: int
    type: InterventionType
    description: Optional[str] = None
    priority: InterventionPriority = InterventionPriority.normale


class InterventionUpdate(BaseModel):
    status: Optional[InterventionStatus] = None
    scheduled_date: Optional[date] = None
    employee_notes: Optional[str] = None
    resolution: Optional[str] = None


class InterventionOut(BaseModel):
    id: int
    station_code: str
    station_name: Optional[str]
    client_id: int
    client_name: Optional[str] = None
    alarm_name: str
    alarm_severity: int
    type: InterventionType
    description: Optional[str]
    priority: InterventionPriority
    status: InterventionStatus
    assigned_to: Optional[int]
    scheduled_date: Optional[date]
    completed_date: Optional[datetime]
    employee_notes: Optional[str]
    resolution: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True
