from datetime import datetime, timezone
from fastapi import APIRouter, Depends
import db.database as database
from services.coral_service import coral
from services.auth import get_current_user
from logger import get_logger

router = APIRouter()
log = get_logger("devpulse.sources")

# Maps source names to the token keys required for that source
SOURCE_TOKEN_MAP = {
    "github": ["GITHUB_TOKEN"],
    "linear": ["LINEAR_API_KEY"],
    "sentry": ["SENTRY_TOKEN"],
    "slack": ["SLACK_TOKEN"],
}


async def _sync_source_status(name: str, status: str, error: str | None = None):
    """Persist source health check result to coral_sources table."""
    conn = database.db
    if conn is None:
        log.warning("DB not ready, skipping source status sync for %s", name)
        return
    await conn.execute(
        """UPDATE coral_sources
           SET status = ?, last_checked = ?, error_message = ?
           WHERE source_name = ?""",
        (status, datetime.now(timezone.utc).isoformat(), error, name),
    )
    await conn.commit()


@router.get("/sources")
async def get_sources():
    """Return current source status from DB (fast, no live probe)."""
    conn = database.db
    if conn is None:
        return []
    async with conn.execute(
        "SELECT source_name, display_name, status, last_checked, error_message, table_count "
        "FROM coral_sources ORDER BY source_name"
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]


@router.post("/sources/check")
async def check_sources(user: dict = Depends(get_current_user)):
    """
    User-specific source check. Determines connection status based on
    whether the current user has tokens stored in the DB for each source,
    then optionally probes Coral for sources they have tokens for.
    """
    from routers.settings import get_user_tokens

    conn = database.db
    if conn is None:
        return {"error": "Database not initialised"}

    user_id = user["id"]
    tokens = await get_user_tokens(user_id)

    # For each source, determine status based on user tokens
    results = []
    for source_name, required_keys in SOURCE_TOKEN_MAP.items():
        has_token = any(bool(tokens.get(k)) for k in required_keys)

        if has_token:
            status = "CONNECTED"
        else:
            status = "DISCONNECTED"

        # Fetch display_name from DB
        display_name = source_name.capitalize()
        if conn:
            async with conn.execute(
                "SELECT display_name FROM coral_sources WHERE source_name = ?",
                (source_name,),
            ) as cursor:
                row = await cursor.fetchone()
                if row:
                    display_name = row["display_name"]

        results.append({
            "source_name": source_name,
            "display_name": display_name,
            "status": status,
            "last_checked": datetime.now(timezone.utc).isoformat(),
            "table_count": 0,
            "error_message": None,
        })

        await _sync_source_status(source_name, status)

    return results

