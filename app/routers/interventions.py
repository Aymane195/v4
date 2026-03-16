from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime
from typing import Optional

from app.database import get_db
from app.models import User, Intervention, InterventionStatus, InterventionPriority
from app.schemas import InterventionCreate, InterventionUpdate, InterventionOut
from app.auth import require_role
from app.services import demo as demo_svc

router = APIRouter(tags=["Interventions"])

_require_client = require_role("client")
_require_employee = require_role("employee")

PRIORITY_ORDER = {
    InterventionPriority.critique: 0,
    InterventionPriority.haute: 1,
    InterventionPriority.normale: 2,
    InterventionPriority.basse: 3,
}


def _to_out(iv: Intervention) -> dict:
    """Convert Intervention ORM object to response dict with client_name."""
    data = {
        "id": iv.id,
        "station_code": iv.station_code,
        "station_name": iv.station_name,
        "client_id": iv.client_id,
        "client_name": iv.client.full_name if iv.client else None,
        "alarm_name": iv.alarm_name,
        "alarm_severity": iv.alarm_severity,
        "type": iv.type,
        "description": iv.description,
        "priority": iv.priority,
        "status": iv.status,
        "assigned_to": iv.assigned_to,
        "scheduled_date": iv.scheduled_date,
        "completed_date": iv.completed_date,
        "employee_notes": iv.employee_notes,
        "resolution": iv.resolution,
        "created_at": iv.created_at,
    }
    return data


# ── Client endpoints ─────────────────────────────────────────────────────────

@router.post("/client/interventions", response_model=InterventionOut, status_code=201)
def create_intervention(
    body: InterventionCreate,
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    iv = Intervention(
        station_code=body.station_code,
        station_name=body.station_name,
        client_id=current_user.id,
        alarm_name=body.alarm_name,
        alarm_severity=body.alarm_severity,
        type=body.type,
        description=body.description,
        priority=body.priority,
        status=InterventionStatus.en_attente,
    )
    db.add(iv)
    db.commit()
    db.refresh(iv)
    return _to_out(iv)


@router.get("/client/interventions", response_model=list[InterventionOut])
def list_my_interventions(
    current_user: User = Depends(_require_client),
    db: Session = Depends(get_db),
):
    # Demo account: return fake interventions if no real ones exist
    real = db.query(Intervention).filter(Intervention.client_id == current_user.id).all()
    if not real and current_user.email == demo_svc.DEMO_CLIENT_EMAIL:
        return demo_svc.demo_interventions(current_user.id)
    rows = sorted(real, key=lambda x: x.created_at or datetime.min, reverse=True)
    return [_to_out(r) for r in rows]


# ── Employee endpoints ────────────────────────────────────────────────────────

@router.get("/employee/interventions", response_model=list[InterventionOut])
def list_all_interventions(
    status: Optional[str] = Query(None),
    station_code: Optional[str] = Query(None),
    current_user: User = Depends(_require_employee),
    db: Session = Depends(get_db),
):
    q = db.query(Intervention)
    if status:
        q = q.filter(Intervention.status == status)
    if station_code:
        q = q.filter(Intervention.station_code == station_code)
    rows = q.all()

    # Demo fallback: if no real interventions exist at all, return fake ones
    if not rows and not status and not station_code:
        total = db.query(Intervention).count()
        if total == 0:
            return demo_svc.demo_interventions(demo_svc._get_demo_client_id())

    rows.sort(key=lambda x: (PRIORITY_ORDER.get(x.priority, 9), -(x.created_at.timestamp() if x.created_at else 0)))
    return [_to_out(r) for r in rows]


@router.patch("/employee/interventions/{intervention_id}", response_model=InterventionOut)
def update_intervention(
    intervention_id: int,
    body: InterventionUpdate,
    current_user: User = Depends(_require_employee),
    db: Session = Depends(get_db),
):
    iv = db.query(Intervention).filter(Intervention.id == intervention_id).first()
    if not iv:
        raise HTTPException(status_code=404, detail="Intervention not found")

    if body.status is not None:
        iv.status = body.status
        # Auto-assign employee on accept
        if body.status in (InterventionStatus.acceptee, InterventionStatus.en_cours) and not iv.assigned_to:
            iv.assigned_to = current_user.id
        # Auto-set completed_date
        if body.status == InterventionStatus.terminee:
            iv.completed_date = datetime.utcnow()

    if body.scheduled_date is not None:
        iv.scheduled_date = body.scheduled_date
        if iv.status == InterventionStatus.acceptee:
            iv.status = InterventionStatus.planifiee
    if body.employee_notes is not None:
        iv.employee_notes = body.employee_notes
    if body.resolution is not None:
        iv.resolution = body.resolution

    db.commit()
    db.refresh(iv)
    return _to_out(iv)
