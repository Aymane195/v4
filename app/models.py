from sqlalchemy import Column, Integer, String, Text, Enum, ForeignKey, DateTime, Date, Float, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class UserRole(str, enum.Enum):
    client = "client"
    employee = "employee"


class InstallationType(str, enum.Enum):
    residentielle = "residentielle"
    commerciale = "commerciale"
    industrielle = "industrielle"


class AlertPreference(str, enum.Enum):
    email = "email"
    whatsapp = "whatsapp"
    both = "both"


class InterventionType(str, enum.Enum):
    nettoyage = "nettoyage"
    maintenance = "maintenance"
    inspection = "inspection"
    urgence = "urgence"


class InterventionPriority(str, enum.Enum):
    critique = "critique"
    haute = "haute"
    normale = "normale"
    basse = "basse"


class InterventionStatus(str, enum.Enum):
    en_attente = "en_attente"
    acceptee = "acceptee"
    planifiee = "planifiee"
    en_cours = "en_cours"
    terminee = "terminee"
    cloturee = "cloturee"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    full_name = Column(String(255), nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    phone = Column(String(30), nullable=True)
    installation_type = Column(Enum(InstallationType), nullable=True)
    num_panels = Column(Integer, nullable=True)
    fusionsolar_username = Column(String(255), nullable=True)
    fusionsolar_password = Column(String(255), nullable=True)
    alert_preference = Column(Enum(AlertPreference), nullable=True, default=AlertPreference.email)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    stations = relationship("ClientStation", back_populates="client", cascade="all, delete-orphan")


class ClientStation(Base):
    __tablename__ = "client_stations"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    station_code = Column(String(255), nullable=False)
    station_name = Column(String(255), nullable=True)
    installed_capacity_kwp = Column(Float, nullable=True)  # kWp — authoritative source for soiling

    client = relationship("User", back_populates="stations")


class Intervention(Base):
    __tablename__ = "interventions"

    id = Column(Integer, primary_key=True, index=True)
    station_code = Column(String(255), nullable=False)
    station_name = Column(String(255), nullable=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    alarm_name = Column(String(255), nullable=False)
    alarm_severity = Column(Integer, nullable=False)
    type = Column(Enum(InterventionType), nullable=False)
    description = Column(Text, nullable=True)
    priority = Column(Enum(InterventionPriority), nullable=False, default=InterventionPriority.normale)
    status = Column(Enum(InterventionStatus), nullable=False, default=InterventionStatus.en_attente)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    scheduled_date = Column(Date, nullable=True)
    completed_date = Column(DateTime(timezone=True), nullable=True)
    employee_notes = Column(Text, nullable=True)
    resolution = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    client = relationship("User", foreign_keys=[client_id])
    assignee = relationship("User", foreign_keys=[assigned_to])


class SolarMeasurement(Base):
    """Historical solar measurements — fetched every 30 min, validated and cleaned."""
    __tablename__ = "solar_measurements"

    id = Column(Integer, primary_key=True, index=True)
    station_code = Column(String(255), nullable=False, index=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False, index=True)

    # Raw values from FusionSolar
    production_current = Column(Float, nullable=True)        # kW — inverter active power
    irradiance = Column(Float, nullable=True)                # W/m² — radiation intensity
    temperature = Column(Float, nullable=True)               # °C — panel/ambient temp
    installed_capacity = Column(Float, nullable=True)        # kWp
    day_power = Column(Float, nullable=True)                 # kWh — energy today
    performance_ratio = Column(Float, nullable=True)         # 0-1

    # Weather data from Open-Meteo (if available)
    humidity_pct = Column(Float, nullable=True)
    wind_speed_ms = Column(Float, nullable=True)
    precipitation_mm = Column(Float, nullable=True)

    # Soiling prediction result (run at collection time)
    soiling_index = Column(Float, nullable=True)
    soiling_confidence = Column(Integer, nullable=True)
    soiling_alert_level = Column(String(20), nullable=True)  # NORMAL/AVERTISSEMENT/ALERTE/CRITIQUE

    # Validation flags
    is_valid = Column(Boolean, nullable=False, default=True)
    validation_notes = Column(String(500), nullable=True)    # why it was flagged/corrected
    was_corrected = Column(Boolean, nullable=False, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
