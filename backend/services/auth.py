"""Google OAuth authentication and JWT session management."""

import jwt
import time
from fastapi import Depends, HTTPException, Request
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests

from config import settings
from logger import get_logger
import db.database as database

log = get_logger("devpulse.auth")

# JWT config
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_SECONDS = 7 * 24 * 3600  # 7 days


def create_jwt(user_id: int, email: str) -> str:
    """Create a JWT session token for a verified user."""
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_EXPIRY_SECONDS,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=JWT_ALGORITHM)


def verify_jwt(token: str) -> dict:
    """Verify and decode a JWT. Raises on invalid/expired."""
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session token.")


async def verify_google_token(credential: str) -> dict:
    """Verify a Google ID token and return user info."""
    try:
        log.info("Verifying Google token (length=%d, prefix=%s...)", len(credential), credential[:20])
        log.info("Using GOOGLE_CLIENT_ID: %s", settings.GOOGLE_CLIENT_ID[:20] + "...")
        idinfo = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=10,
        )
        log.info("Google token verified OK for: %s", idinfo.get("email"))
        return {
            "google_id": idinfo["sub"],
            "email": idinfo["email"],
            "name": idinfo.get("name", ""),
            "picture": idinfo.get("picture", ""),
        }
    except Exception as e:
        log.error("Google token verification failed: %s: %s", type(e).__name__, e)
        raise HTTPException(status_code=401, detail=f"Invalid Google credential: {e}")


import bcrypt

async def get_or_create_google_user(google_id: str, email: str, name: str, picture: str) -> dict:
    """Find or create a user in the database via Google OAuth. Returns user dict with id."""
    conn = database.db
    if conn is None:
        raise HTTPException(status_code=500, detail="Database not ready")

    async with conn.execute(
        "SELECT id, google_id, email, display_name, avatar_url FROM users WHERE google_id = ?",
        (google_id,),
    ) as cursor:
        row = await cursor.fetchone()

    if row:
        user = dict(row)
        # Update profile if changed
        if row["email"] != email or row["display_name"] != name or row["avatar_url"] != picture:
            await conn.execute(
                "UPDATE users SET email = ?, display_name = ?, avatar_url = ? WHERE id = ?",
                (email, name, picture, user["id"]),
            )
            await conn.commit()
        return user

    # Create new user
    cursor = await conn.execute(
        "INSERT INTO users (google_id, email, display_name, avatar_url) VALUES (?, ?, ?, ?)",
        (google_id, email, name, picture),
    )
    await conn.commit()
    return {
        "id": cursor.lastrowid,
        "google_id": google_id,
        "email": email,
        "display_name": name,
        "avatar_url": picture,
    }

async def register_user_email(email: str, password: str, name: str) -> dict:
    """Register a new user with email and password."""
    conn = database.db
    if conn is None:
        raise HTTPException(status_code=500, detail="Database not ready")

    # Check if email exists
    async with conn.execute("SELECT id FROM users WHERE email = ?", (email,)) as cursor:
        if await cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email already registered")

    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode(), salt).decode()
    dummy_google_id = f"email:{email}"

    cursor = await conn.execute(
        "INSERT INTO users (google_id, email, password_hash, display_name) VALUES (?, ?, ?, ?)",
        (dummy_google_id, email, hashed, name),
    )
    await conn.commit()
    return {
        "id": cursor.lastrowid,
        "email": email,
        "display_name": name,
        "avatar_url": "",
    }

async def login_user_email(email: str, password: str) -> dict:
    """Login a user with email and password."""
    conn = database.db
    if conn is None:
        raise HTTPException(status_code=500, detail="Database not ready")

    async with conn.execute(
        "SELECT id, email, password_hash, display_name, avatar_url FROM users WHERE email = ?",
        (email,)
    ) as cursor:
        row = await cursor.fetchone()

    if not row or not row["password_hash"]:
        raise HTTPException(status_code=401, detail="Invalid email or password")

    if not bcrypt.checkpw(password.encode(), row["password_hash"].encode()):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return dict(row)


async def get_current_user(request: Request) -> dict:
    """FastAPI dependency: extract and verify JWT from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated. Please sign in.")

    token = auth_header[7:]
    payload = verify_jwt(token)
    user_id = int(payload["sub"])

    conn = database.db
    if conn is None:
        raise HTTPException(status_code=500, detail="Database not ready")

    async with conn.execute(
        "SELECT id, google_id, email, display_name, avatar_url FROM users WHERE id = ?",
        (user_id,),
    ) as cursor:
        row = await cursor.fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="User not found. Please sign in again.")

    return dict(row)


async def get_optional_user(request: Request) -> dict | None:
    """FastAPI dependency: returns user if authenticated, None otherwise."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return None
    try:
        return await get_current_user(request)
    except HTTPException:
        return None
