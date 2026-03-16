from sqlalchemy import Column, Integer, String, Text, Enum, ForeignKey, DateTime, Date
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base
import enum


class UserRole(str, enum.Enum):
    client = "client"
    employee = "employee"


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
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    stations = relationship("ClientStation", back_populates="client", cascade="all, delete-orphan")


class ClientStation(Base):
    __tablename__ = "client_stations"

    id = Column(Integer, primary_key=True, index=True)
    client_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    station_code = Column(String(255), nullable=False)
    station_name = Column(String(255), nullable=True)

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
