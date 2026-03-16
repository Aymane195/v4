from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime, date
from app.models import UserRole, InterventionType, InterventionPriority, InterventionStatus


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
