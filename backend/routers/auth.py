"""Authentication endpoints for Google OAuth."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from services.auth import (
    verify_google_token,
    get_or_create_google_user,
    register_user_email,
    login_user_email,
    create_jwt,
    get_current_user,
)
from routers.settings import ensure_coral_tokens_loaded
from logger import get_logger

log = get_logger("devpulse.auth")
router = APIRouter()


class GoogleAuthRequest(BaseModel):
    credential: str  # Google ID token from frontend

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

class LoginRequest(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    token: str
    user: dict


@router.post("/auth/google")
async def google_auth(req: GoogleAuthRequest):
    """Verify Google ID token, upsert user, return JWT session."""
    google_info = await verify_google_token(req.credential)
    user = await get_or_create_google_user(
        google_id=google_info["google_id"],
        email=google_info["email"],
        name=google_info["name"],
        picture=google_info["picture"],
    )
    token = create_jwt(user["id"], user["email"])
    log.info("User authenticated via Google: %s (%s)", user["email"], user["id"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("display_name", ""),
            "picture": user.get("avatar_url", ""),
        },
    }

@router.post("/auth/register")
async def register(req: RegisterRequest):
    """Register a new user with email and password."""
    if not req.name:
        req.name = req.email.split("@")[0]
    user = await register_user_email(req.email, req.password, req.name)
    token = create_jwt(user["id"], user["email"])
    await ensure_coral_tokens_loaded(user["id"])
    log.info("User registered via email: %s (%s)", user["email"], user["id"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("display_name", ""),
            "picture": user.get("avatar_url", ""),
        },
    }

@router.post("/auth/login")
async def login(req: LoginRequest):
    """Login a user with email and password."""
    user = await login_user_email(req.email, req.password)
    token = create_jwt(user["id"], user["email"])
    await ensure_coral_tokens_loaded(user["id"])
    log.info("User authenticated via email: %s (%s)", user["email"], user["id"])
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "name": user.get("display_name", ""),
            "picture": user.get("avatar_url", ""),
        },
    }


@router.get("/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Return current authenticated user info."""
    await ensure_coral_tokens_loaded(user["id"])
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user.get("display_name", ""),
        "picture": user.get("avatar_url", ""),
    }
