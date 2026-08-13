import json
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from services.agent_service import generate_report
from services.auth import get_current_user
import db.database as database
from logger import get_logger

router = APIRouter()
log = get_logger("devpulse.report")


class ReportRequest(BaseModel):
    workflow: str = "standup"

@router.post("/report")
async def create_report(req: ReportRequest, user: dict = Depends(get_current_user)):
    user_id = user["id"]
    try:
        # generate_report requires the caller's id to resolve their Coral instance;
        # omitting it previously raised TypeError, so this endpoint always 503'd.
        report = await generate_report(req.workflow, user_id)
    except Exception as e:
        log.exception("Report generation failed for user %s", user_id)
        error_msg = str(e)
        friendly_msg = "Report generation failed. Please check Sentry / GitHub status or API tokens in settings."
        if "429" in error_msg or "quota" in error_msg.lower() or "limit" in error_msg.lower():
            friendly_msg = "The AI generation service is busy. Please wait a few seconds and try again."
        elif "403" in error_msg or "permission" in error_msg.lower():
            friendly_msg = "Database access denied (403). Sentry or GitHub credentials might be invalid."
        return JSONResponse(
            status_code=503,
            content={"error": friendly_msg, "detail": "Report generation failed. Check settings and API status."}
        )
    conn = database.db
    if conn is not None:
        await conn.execute(
            "INSERT INTO reports (content, raw_data, generated_at, user_id) VALUES (?, ?, ?, ?)",
            (report["report"], json.dumps(report["raw_data"]), report["generated_at"], user_id),
        )
        await conn.commit()
    return report


@router.get("/report/history")
async def get_report_history(user: dict = Depends(get_current_user)):
    conn = database.db
    if conn is None:
        return []
    # Scoped to the caller — this previously returned every user's reports.
    async with conn.execute(
        "SELECT id, generated_at, substr(content, 1, 200) as preview "
        "FROM reports WHERE user_id = ? ORDER BY generated_at DESC LIMIT 20",
        (user["id"],),
    ) as cursor:
        rows = await cursor.fetchall()
    return [dict(row) for row in rows]
