import time
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from services.coral_service import coral
import db.database as database

router = APIRouter()


class QueryRequest(BaseModel):
    sql: str


@router.post("/query")
async def run_query(body: QueryRequest):
    try:
        start = time.monotonic()
        result = await coral.query(body.sql)
        elapsed_ms = int((time.monotonic() - start) * 1000)
        conn = database.db
        if conn is not None:
            await conn.execute(
                "INSERT INTO query_history (sql, rows_returned, execution_ms) VALUES (?, ?, ?)",
                (body.sql, len(result) if isinstance(result, list) else 0, elapsed_ms),
            )
            await conn.commit()
        return {"result": result, "execution_ms": elapsed_ms}
    except Exception as e:
        error_msg = str(e)
        friendly_msg = "An error occurred while executing the query. Please check your SQL syntax."
        if "403" in error_msg or "permission" in error_msg.lower():
            friendly_msg = "Integration permission error (403). Please verify your API credentials in Settings."
        elif "no column" in error_msg.lower() or "no table" in error_msg.lower() or "schema" in error_msg.lower():
            friendly_msg = f"SQL Schema mismatch: {error_msg.split('Detail:')[0].replace('Coral query error:', '').strip()}"
        raise HTTPException(status_code=400, detail=friendly_msg)


@router.get("/query/schema")
async def get_schema():
    try:
        return await coral.get_schema()
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to fetch Coral database schema catalog.")


@router.get("/query/history")
async def get_query_history():
    conn = database.db
    if conn is None:
        return []
    async with conn.execute(
        "SELECT * FROM query_history ORDER BY executed_at DESC LIMIT 50"
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]


@router.post("/query/save")
async def save_query(body: dict):
    conn = database.db
    if conn is None:
        return {"ok": False, "error": "DB not ready"}
    await conn.execute(
        "INSERT INTO saved_queries (name, sql) VALUES (?, ?)",
        (body["name"], body["sql"]),
    )
    await conn.commit()
    return {"ok": True}


@router.get("/query/saved")
async def get_saved_queries():
    conn = database.db
    if conn is None:
        return []
    async with conn.execute("SELECT * FROM saved_queries ORDER BY created_at DESC") as cursor:
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]
