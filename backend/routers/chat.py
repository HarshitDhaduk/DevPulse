import json
import asyncio
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from services.agent_service import stream_chat_response
from logger import get_logger

log = get_logger("devpulse.chat")
router = APIRouter()


async def _ensure_session(session_key: str) -> int:
    """Get or create a chat_session row and return the session id."""
    from db.database import db
    row = await db.execute_fetchall(
        "SELECT id FROM chat_sessions WHERE session_key = ?", (session_key,)
    )
    if row:
        return row[0]["id"]
    cursor = await db.execute(
        "INSERT INTO chat_sessions (session_key, title) VALUES (?, ?)",
        (session_key, "Workspace Chat"),
    )
    await db.commit()
    return cursor.lastrowid


async def _save_message(session_id: int, run_id: int | None, role: str, content: str):
    """Persist a single chat message to the database."""
    from db.database import db
    try:
        await db.execute(
            """INSERT INTO chat_messages (session_id, run_id, role, content)
               VALUES (?, ?, ?, ?)""",
            (session_id, run_id, role, content),
        )
        await db.commit()
    except Exception as e:
        log.error("Failed to save chat message: %s", e)


async def sse_generator(question: str, session_id: str, run_id: int | None):
    # Persist the user message
    db_session_id = await _ensure_session(session_id)
    await _save_message(db_session_id, run_id, "user", question)

    agent_response = ""
    try:
        async for event in stream_chat_response(question, session_id):
            # Accumulate agent response text
            if event["event"] == "token":
                agent_response += event["data"]
            yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"
            await asyncio.sleep(0)
    except Exception as e:
        error_msg = str(e)
        friendly_msg = "An unexpected error occurred in AI Chat. Please try again."
        if "429" in error_msg or "quota" in error_msg.lower() or "limit" in error_msg.lower():
            friendly_msg = "The AI engine is currently experiencing high demand. Please try again in a few seconds."
        elif "permission" in error_msg.lower() or "403" in error_msg:
            friendly_msg = "Database access denied. Please verify your integration credentials in settings."
        elif "credentials" in error_msg.lower() or "key" in error_msg.lower():
            friendly_msg = "Invalid credentials. Please verify your API tokens in settings."
        agent_response += f"\n\n[Error: {friendly_msg}]"
        yield f"event: error\ndata: {json.dumps(friendly_msg)}\n\n"
    finally:
        # Persist the full agent response
        if agent_response.strip():
            await _save_message(db_session_id, run_id, "agent", agent_response)


@router.get("/chat/stream")
async def chat_stream(
    q: str = Query(...),
    session_id: str = Query(default="default"),
    run_id: int | None = Query(default=None),
):
    return StreamingResponse(
        sse_generator(q, session_id, run_id),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
