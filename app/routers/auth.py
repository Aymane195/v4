from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User
from app.schemas import RegisterRequest, LoginRequest, ChangePasswordRequest, TokenResponse, UserOut
from app import auth as auth_utils

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=body.email,
        password_hash=auth_utils.hash_password(body.password),
        full_name=body.full_name,
        role=body.role,
        phone=body.phone,
        installation_type=body.installation_type,
        num_panels=body.num_panels,
        fusionsolar_username=body.fusionsolar_username,
        fusionsolar_password=body.fusionsolar_password,
        alert_preference=body.alert_preference,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email).first()
    if not user or not auth_utils.verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = auth_utils.create_jwt(user.id, user.role)
    return {"access_token": token}


@router.post("/change-password")
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    if not auth_utils.verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="Le nouveau mot de passe doit contenir au moins 6 caracteres")
    current_user.password_hash = auth_utils.hash_password(body.new_password)
    db.commit()
    return {"message": "Mot de passe modifie avec succes"}


@router.post("/whatsapp-register")
def whatsapp_register(
    body: dict,
    current_user: User = Depends(auth_utils.get_current_user),
    db: Session = Depends(get_db),
):
    """Save the client's WhatsApp number and send a welcome message."""
    import re
    from app.services.whatsapp import send_welcome_message

    phone = (body.get("phone") or "").strip()
    if not phone:
        raise HTTPException(status_code=400, detail="Numero de telephone requis")

    phone = phone.replace(" ", "")
    if not phone.startswith("+"):
        phone = "+" + phone

    if not re.match(r"^\+\d{10,15}$", phone):
        raise HTTPException(status_code=400, detail="Numero invalide. Format attendu : +212XXXXXXXXX")

    current_user.phone = phone
    db.commit()

    sent = send_welcome_message(phone, current_user.full_name)

    if sent:
        return {"message": "Numero enregistre ! Un message de bienvenue a ete envoye sur WhatsApp."}
    return {
        "message": (
            "Numero enregistre, mais le message WhatsApp n'a pas pu etre envoye. "
            "Verifiez que vous avez bien envoye \"join\" au +1 415 523 8886 sur WhatsApp avant d'activer le service."
        )
    }


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(auth_utils.get_current_user)):
    return current_user
