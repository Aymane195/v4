from fastapi import APIRouter, Depends
from app.auth import require_role
from app.models import User
from app.services.collector import collect_all_stations, last_run

router = APIRouter(prefix="/collector", tags=["Data Collector"])

_require_employee = require_role("employee")


@router.post("/run")
def trigger_collection(current_user: User = Depends(_require_employee)):
    """Manually trigger a data collection cycle (employee only)."""
    result = collect_all_stations()
    return result


@router.get("/status")
def collection_status(current_user: User = Depends(_require_employee)):
    """Check when the last collection ran and its results."""
    if last_run["time"] is None:
        return {"message": "Aucune collecte effectuée depuis le démarrage du serveur."}
    return last_run
