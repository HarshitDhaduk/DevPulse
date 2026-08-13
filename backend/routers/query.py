import time
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from services.coral_service import coral_manager
from services.auth import get_current_user
from logger import get_logger
import db.database as database

log = get_logger("devpulse.query")
router = APIRouter()


class QueryRequest(BaseModel):
    sql: str


@router.post("/query")
async def run_query(body: QueryRequest, user: dict = Depends(get_current_user)):
    try:
        coral = await coral_manager.get_service(user["id"])
        start = time.monotonic()
        result = await coral.query(body.sql)
        elapsed_ms = int((time.monotonic() - start) * 1000)
    except Exception as e:
        error_msg = str(e)
        friendly_msg = "An error occurred while executing the query. Please check your SQL syntax."
        if "403" in error_msg or "permission" in error_msg.lower():
            friendly_msg = "Integration permission error (403). Please verify your API credentials in Settings."
        elif "no column" in error_msg.lower() or "no table" in error_msg.lower() or "schema" in error_msg.lower():
            friendly_msg = f"SQL Schema mismatch: {error_msg.split('Detail:')[0].replace('Coral query error:', '').strip()}"
        raise HTTPException(status_code=400, detail=friendly_msg)

    # Audit-log the run outside the try block above: a failure to record history
    # must not be reported to the user as a SQL error on a query that succeeded.
    conn = database.db
    if conn is not None:
        try:
            await conn.execute(
                "INSERT INTO query_history (sql, rows_returned, execution_ms, user_id) VALUES (?, ?, ?, ?)",
                (body.sql, len(result) if isinstance(result, list) else 0, elapsed_ms, user["id"]),
            )
            await conn.commit()
        except Exception:
            log.exception("Failed to record query history for user %s", user["id"])

    return {"result": result, "execution_ms": elapsed_ms}


@router.get("/query/schema")
async def get_schema(user: dict = Depends(get_current_user)):
    try:
        coral = await coral_manager.get_service(user["id"])
        return await coral.get_schema()
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch Coral database schema catalog.")


@router.get("/query/history")
async def get_query_history(user: dict = Depends(get_current_user)):
    conn = database.db
    if conn is None:
        return []
    async with conn.execute(
        "SELECT * FROM query_history WHERE user_id = ? ORDER BY executed_at DESC LIMIT 50",
        (user["id"],)
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.post("/query/save")
async def save_query(body: dict, user: dict = Depends(get_current_user)):
    conn = database.db
    if conn is None:
        return {"ok": False, "error": "DB not ready"}
    # Missing keys previously raised KeyError -> HTTP 500.
    name, sql = body.get("name"), body.get("sql")
    if not name or not sql:
        raise HTTPException(status_code=400, detail="Both 'name' and 'sql' are required.")
    await conn.execute(
        "INSERT INTO saved_queries (name, sql, user_id) VALUES (?, ?, ?)",
        (name, sql, user["id"]),
    )
    await conn.commit()
    return {"ok": True}


@router.get("/query/saved")
async def get_saved_queries(user: dict = Depends(get_current_user)):
    conn = database.db
    if conn is None:
        return []
    async with conn.execute("SELECT * FROM saved_queries WHERE user_id = ? ORDER BY created_at DESC", (user["id"],)) as cursor:
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]
