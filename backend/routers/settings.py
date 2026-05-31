"""Per-user encrypted settings storage."""

import os
import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from services.auth import get_current_user
from services.crypto import encrypt, decrypt
from services.coral_service import coral
from config import settings
from logger import get_logger
import db.database as database

log = get_logger("devpulse.settings")
router = APIRouter()

# All setting keys that can be stored per-user
VALID_KEYS = {
    "GITHUB_TOKEN", "GITHUB_OWNER",
    "LINEAR_API_KEY",
    "SENTRY_TOKEN", "SENTRY_ORG",
    "SLACK_TOKEN",
}

# Keys that are secrets (should be masked in GET responses)
SECRET_KEYS = {"GITHUB_TOKEN", "LINEAR_API_KEY", "SENTRY_TOKEN", "SLACK_TOKEN"}


class SettingsUpdate(BaseModel):
    github_token: str | None = None
    github_owner: str | None = None
    linear_api_key: str | None = None
    sentry_token: str | None = None
    sentry_org: str | None = None
    slack_token: str | None = None


async def _get_user_setting(user_id: int, key: str) -> str | None:
    """Read and decrypt a single user setting."""
    conn = database.db
    if conn is None:
        return None
    async with conn.execute(
        "SELECT setting_val FROM user_settings WHERE user_id = ? AND setting_key = ?",
        (user_id, key),
    ) as cursor:
        row = await cursor.fetchone()
    if row:
        try:
            return decrypt(row["setting_val"])
        except Exception:
            log.warning("Failed to decrypt setting %s for user %s", key, user_id)
            return None
    return None


async def _set_user_setting(user_id: int, key: str, value: str):
    """Encrypt and upsert a user setting."""
    conn = database.db
    if conn is None:
        raise HTTPException(status_code=500, detail="Database not ready")
    encrypted = encrypt(value)
    await conn.execute(
        "INSERT INTO user_settings (user_id, setting_key, setting_val) VALUES (?, ?, ?) "
        "ON CONFLICT(user_id, setting_key) DO UPDATE SET setting_val = excluded.setting_val",
        (user_id, key, encrypted),
    )
    await conn.commit()


async def get_user_tokens(user_id: int) -> dict[str, str]:
    """Load all decrypted tokens for a user. Returns a dict of key -> plaintext."""
    conn = database.db
    if conn is None:
        return {}
    async with conn.execute(
        "SELECT setting_key, setting_val FROM user_settings WHERE user_id = ?",
        (user_id,),
    ) as cursor:
        rows = await cursor.fetchall()
    result = {}
    for row in rows:
        try:
            result[row["setting_key"]] = decrypt(row["setting_val"])
        except Exception:
            log.warning("Failed to decrypt %s for user %s", row["setting_key"], user_id)
    return result


def inject_user_tokens(tokens: dict[str, str]):
    """Inject a user's tokens into os.environ so Coral picks them up for queries."""
    for key, val in tokens.items():
        if key in VALID_KEYS and val:
            os.environ[key] = val

async def ensure_coral_tokens_loaded(user_id: int):
    """Ensure the user's tokens are loaded into the environment and Coral is restarted if necessary."""
    tokens = await get_user_tokens(user_id)
    needs_restart = False
    changed_keys = set()
    
    for key in VALID_KEYS:
        val = tokens.get(key)
        if val and os.environ.get(key) != val:
            needs_restart = True
            changed_keys.add(key)
            
    if needs_restart:
        log.info("Loading tokens for user %s and restarting Coral (changed: %s)", user_id, changed_keys)
        inject_user_tokens(tokens)
        try:
            await coral.stop()
            # Refresh Coral sources whose credentials changed
            source_map = {
                "SENTRY_TOKEN": "sentry", "SENTRY_ORG": "sentry",
                "GITHUB_TOKEN": "github", "GITHUB_OWNER": "github",
                "LINEAR_API_KEY": "linear",
                "SLACK_TOKEN": "slack",
            }
            refreshed = set()
            for key in changed_keys:
                src = source_map.get(key)
                if src and src not in refreshed:
                    await coral.refresh_source(src)
                    refreshed.add(src)
            await coral.start()
            from services.agent_service import init_schema
            await init_schema()
        except Exception as e:
            log.error("Failed to restart Coral on token load: %s", e)


@router.get("/settings")
async def get_settings(user: dict = Depends(get_current_user)):
    """Return settings for the authenticated user (secrets are masked)."""
    user_id = user["id"]
    await ensure_coral_tokens_loaded(user_id)
    tokens = await get_user_tokens(user_id)

    return {
        "github_owner": tokens.get("GITHUB_OWNER", ""),
        "sentry_org": tokens.get("SENTRY_ORG", ""),
        "has_github_token": bool(tokens.get("GITHUB_TOKEN")),
        "has_linear_key": bool(tokens.get("LINEAR_API_KEY")),
        "has_sentry_token": bool(tokens.get("SENTRY_TOKEN")),
        "has_slack_token": bool(tokens.get("SLACK_TOKEN")),
    }


@router.post("/settings/connect")
async def connect_settings(req: SettingsUpdate, user: dict = Depends(get_current_user)):
    """Save integration tokens for the authenticated user (encrypted in DB)."""
    user_id = user["id"]
    updates: dict[str, str] = {}

    if req.github_token is not None:
        await _set_user_setting(user_id, "GITHUB_TOKEN", req.github_token)
        updates["GITHUB_TOKEN"] = req.github_token
    if req.github_owner is not None:
        await _set_user_setting(user_id, "GITHUB_OWNER", req.github_owner)
        updates["GITHUB_OWNER"] = req.github_owner
    if req.linear_api_key is not None:
        await _set_user_setting(user_id, "LINEAR_API_KEY", req.linear_api_key)
        updates["LINEAR_API_KEY"] = req.linear_api_key
    if req.sentry_token is not None:
        await _set_user_setting(user_id, "SENTRY_TOKEN", req.sentry_token)
        updates["SENTRY_TOKEN"] = req.sentry_token
    if req.sentry_org is not None:
        await _set_user_setting(user_id, "SENTRY_ORG", req.sentry_org)
        updates["SENTRY_ORG"] = req.sentry_org
    if req.slack_token is not None:
        await _set_user_setting(user_id, "SLACK_TOKEN", req.slack_token)
        updates["SLACK_TOKEN"] = req.slack_token

    # Inject tokens for current Coral session
    inject_user_tokens(updates)

    # Trigger a proper Coral source refresh and restart
    try:
        # ensure_coral_tokens_loaded will diff the tokens and call refresh_source for any that changed
        await ensure_coral_tokens_loaded(user_id)
        log.info("Coral refreshed and restarted with user %s tokens", user_id)
        return {"status": "success", "message": "Settings saved and Coral restarted."}
    except Exception as e:
        log.error("Error refreshing Coral: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

class GitHubOAuthRequest(BaseModel):
    code: str

@router.post("/settings/github/oauth")
async def github_oauth(req: GitHubOAuthRequest, user: dict = Depends(get_current_user)):
    """Exchange GitHub OAuth code for an access token and save it."""
    user_id = user["id"]
    if not settings.GITHUB_CLIENT_ID or not settings.GITHUB_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="GitHub OAuth is not configured on the server.")
        
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": req.code,
            }
        )
    
    try:
        data = response.json()
    except Exception:
        raise HTTPException(status_code=500, detail="Invalid response from GitHub")
        
    if "error" in data:
        raise HTTPException(status_code=400, detail=data.get("error_description", "GitHub OAuth failed"))
        
    access_token = data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="No access token returned from GitHub")
        
    await _set_user_setting(user_id, "GITHUB_TOKEN", access_token)
    
    # Try to fetch their GitHub username and set it as GITHUB_OWNER if empty
    try:
        async with httpx.AsyncClient() as gh_client:
            user_res = await gh_client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/vnd.github.v3+json",
                }
            )
            if user_res.status_code == 200:
                gh_user = user_res.json()
                gh_login = gh_user.get("login")
                if gh_login:
                    current_owner = await _get_user_setting(user_id, "GITHUB_OWNER")
                    if not current_owner:
                        await _set_user_setting(user_id, "GITHUB_OWNER", gh_login)
    except Exception as e:
        log.warning("Failed to fetch GitHub username: %s", e)
    
    try:
        await ensure_coral_tokens_loaded(user_id)
        log.info("Coral restarted with new GitHub OAuth token for user %s", user_id)
        return {"status": "success", "message": "GitHub connected successfully!"}
    except Exception as e:
        log.error("Failed to restart Coral: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

class SlackOAuthRequest(BaseModel):
    code: str
    redirect_uri: str | None = None

@router.post("/settings/slack/oauth")
async def slack_oauth(req: SlackOAuthRequest, user: dict = Depends(get_current_user)):
    """Exchange Slack OAuth code for an access token, refresh token, and save it."""
    user_id = user["id"]
    if not settings.SLACK_CLIENT_ID or not settings.SLACK_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Slack OAuth is not configured on the server.")
        
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://slack.com/api/oauth.v2.access",
            data={
                "client_id": settings.SLACK_CLIENT_ID,
                "client_secret": settings.SLACK_CLIENT_SECRET,
                "code": req.code,
                "redirect_uri": req.redirect_uri or "http://localhost:3000/settings/slack/callback",
            }
        )
    
    try:
        data = response.json()
    except Exception:
        raise HTTPException(status_code=500, detail="Invalid response from Slack")
        
    if not data.get("ok"):
        raise HTTPException(status_code=400, detail=data.get("error", "Slack OAuth failed"))
        
    authed_user = data.get("authed_user", {})
    access_token = authed_user.get("access_token") or data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="No access token returned from Slack")
        
    await _set_user_setting(user_id, "SLACK_TOKEN", access_token)
    
    refresh_token = authed_user.get("refresh_token") or data.get("refresh_token")
    expires_in = authed_user.get("expires_in") or data.get("expires_in")
    
    if refresh_token:
        await _set_user_setting(user_id, "SLACK_REFRESH_TOKEN", refresh_token)
    
    if expires_in:
        import time
        expires_at = str(int(time.time() + expires_in))
        await _set_user_setting(user_id, "SLACK_EXPIRES_AT", expires_at)
    
    try:
        await ensure_coral_tokens_loaded(user_id)
        log.info("Coral restarted with new Slack OAuth token for user %s", user_id)
        return {"status": "success", "message": "Slack connected successfully!"}
    except Exception as e:
        log.error("Failed to restart Coral: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

class LinearOAuthRequest(BaseModel):
    code: str
    redirect_uri: str | None = None

@router.post("/settings/linear/oauth")
async def linear_oauth(req: LinearOAuthRequest, user: dict = Depends(get_current_user)):
    """Exchange Linear OAuth code for an access token, refresh token, and save it."""
    user_id = user["id"]
    if not settings.LINEAR_CLIENT_ID or not settings.LINEAR_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Linear OAuth is not configured on the server.")
        
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://api.linear.app/oauth/token",
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            data={
                "grant_type": "authorization_code",
                "client_id": settings.LINEAR_CLIENT_ID,
                "client_secret": settings.LINEAR_CLIENT_SECRET,
                "code": req.code,
                "redirect_uri": req.redirect_uri or "http://localhost:3000/settings/linear/callback",
            }
        )
    
    try:
        data = response.json()
    except Exception:
        raise HTTPException(status_code=500, detail="Invalid response from Linear")
        
    if "error" in data:
        raise HTTPException(status_code=400, detail=data.get("error_description", "Linear OAuth failed"))
        
    access_token = data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="No access token returned from Linear")
        
    await _set_user_setting(user_id, "LINEAR_API_KEY", access_token)
    
    refresh_token = data.get("refresh_token")
    expires_in = data.get("expires_in")
    
    if refresh_token:
        await _set_user_setting(user_id, "LINEAR_REFRESH_TOKEN", refresh_token)
    
    if expires_in:
        import time
        expires_at = str(int(time.time() + expires_in))
        await _set_user_setting(user_id, "LINEAR_EXPIRES_AT", expires_at)
    
    try:
        await ensure_coral_tokens_loaded(user_id)
        log.info("Coral restarted with new Linear OAuth token for user %s", user_id)
        return {"status": "success", "message": "Linear connected successfully!"}
    except Exception as e:
        log.error("Failed to restart Coral: %s", e)
        raise HTTPException(status_code=500, detail=str(e))

class SentryOAuthRequest(BaseModel):
    code: str
    redirect_uri: str | None = None

@router.post("/settings/sentry/oauth")
async def sentry_oauth(req: SentryOAuthRequest, user: dict = Depends(get_current_user)):
    """Exchange Sentry OAuth code for an access token, refresh token, fetch org, and save."""
    user_id = user["id"]
    if not settings.SENTRY_CLIENT_ID or not settings.SENTRY_CLIENT_SECRET:
        raise HTTPException(status_code=500, detail="Sentry OAuth is not configured on the server.")
        
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.post(
            "https://sentry.io/oauth/token/",
            data={
                "grant_type": "authorization_code",
                "client_id": settings.SENTRY_CLIENT_ID,
                "client_secret": settings.SENTRY_CLIENT_SECRET,
                "code": req.code,
                "redirect_uri": req.redirect_uri or "http://localhost:3000/settings/sentry/callback",
            }
        )
    
    try:
        data = response.json()
    except Exception:
        raise HTTPException(status_code=500, detail="Invalid response from Sentry")
        
    if "error" in data:
        raise HTTPException(status_code=400, detail=data.get("error_description", "Sentry OAuth failed"))
        
    access_token = data.get("token") or data.get("access_token")
    scopes = data.get("scopes") or data.get("scope", "")
    log.info("Sentry OAuth token received. Scopes: %s", scopes)
    
    if not access_token:
        raise HTTPException(status_code=400, detail="No access token returned from Sentry")
    
    refresh_token = data.get("refresh_token")
    expires_in = data.get("expires_in")
    
    if refresh_token:
        await _set_user_setting(user_id, "SENTRY_REFRESH_TOKEN", refresh_token)
    
    if expires_in:
        import time
        expires_at = str(int(time.time() + expires_in))
        await _set_user_setting(user_id, "SENTRY_EXPIRES_AT", expires_at)
        
    # Extract the org slug from the token or API
    org_slug = None
    try:
        if access_token.startswith("sntrys_"):
            parts = access_token.split("_")
            if len(parts) >= 2:
                b64 = parts[1]
                b64 += "=" * ((4 - len(b64) % 4) % 4)
                import base64
                import json as _json
                payload = _json.loads(base64.urlsafe_b64decode(b64).decode())
                org_slug = payload.get("org")
        
        if not org_slug:
            # Fallback for standard OAuth tokens — use the token itself to fetch orgs
            async with httpx.AsyncClient(timeout=30.0) as sentry_client:
                org_res = await sentry_client.get(
                    "https://sentry.io/api/0/organizations/",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                if org_res.status_code == 200:
                    orgs = org_res.json()
                    if orgs and isinstance(orgs, list) and len(orgs) > 0:
                        org_slug = orgs[0].get("slug")
                else:
                    log.error("Failed to fetch organizations. Status: %s, Response: %s", org_res.status_code, org_res.text)
    except Exception as e:
        log.warning("Failed to extract org from Sentry token: %s", e)

    # Save the token and org slug
    await _set_user_setting(user_id, "SENTRY_TOKEN", access_token)
    token_to_inject = access_token

    if org_slug:
        await _set_user_setting(user_id, "SENTRY_ORG", org_slug)
    
    # Immediately validate the token can actually read issues
    test_url = f"https://sentry.io/api/0/organizations/{org_slug or 'unknown'}/issues/?limit=1"
    try:
        async with httpx.AsyncClient(timeout=15.0) as test_client:
            test_res = await test_client.get(
                test_url,
                headers={"Authorization": f"Bearer {access_token}"}
            )
        if test_res.status_code == 403:
            log.warning(
                "Sentry OAuth token lacks event:read permission (403 on issues endpoint). "
                "User needs to update the Sentry OAuth Application permissions."
            )
            # Still save the org slug and token, but warn the user
            try:
                await coral.stop()
                await coral.start()
                from services.agent_service import init_schema
                await init_schema()
            except Exception:
                pass
            return {
                "status": "partial",
                "message": (
                    "Sentry connected but the token lacks Issue & Event read permissions. "
                    "To fix: Go to sentry.io → Settings → Developer Settings → click your DevPulse app → "
                    "under Permissions, set 'Issue & Event' to Read and 'Project' to Read → Save → "
                    "then click 'Connect with Sentry' again."
                ),
                "org_slug": org_slug,
                "missing_scopes": ["event:read", "project:read"],
            }
    except Exception as e:
        log.warning("Token validation request failed: %s", e)

    try:
        await ensure_coral_tokens_loaded(user_id)
        log.info("Coral restarted with new Sentry OAuth token for user %s", user_id)
        return {"status": "success", "message": "Sentry connected successfully with full permissions!"}
    except Exception as e:
        log.error("Failed to restart Coral: %s", e)
        raise HTTPException(status_code=500, detail=str(e))
