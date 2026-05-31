from datetime import datetime, timezone
from fastapi import APIRouter
import db.database as database
from services.coral_service import coral
from logger import get_logger

router = APIRouter()
log = get_logger("devpulse.sources")


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
async def check_sources():
    """
    Live-probe all Coral sources, update DB, return fresh status.
    Called on app startup and from the Settings page refresh button.
    """
    conn = database.db
    if conn is None:
        return {"error": "Database not initialised"}

    try:
        health = await coral.health_check()
    except Exception as e:
        log.error("health_check failed: %s", e)
        return {"error": "Failed to connect to the Coral federated query engine. Please verify the backend logs."}

    for source_name, status in health.items():
        await _sync_source_status(source_name, status)

    # Also update table counts for connected sources
    try:
        rows = await coral.get_schema()
        if isinstance(rows, list):
            counts: dict[str, int] = {}
            for row in rows:
                schema = row.get("schema_name", "")
                counts[schema] = counts.get(schema, 0) + 1
            for source_name, count in counts.items():
                await conn.execute(
                    "UPDATE coral_sources SET table_count = ? WHERE source_name = ?",
                    (count, source_name),
                )
            await conn.commit()
    except Exception as e:
        log.warning("Could not update table counts: %s", e)

    async with conn.execute(
        "SELECT source_name, display_name, status, last_checked, error_message, table_count "
        "FROM coral_sources ORDER BY source_name"
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(r) for r in rows]
