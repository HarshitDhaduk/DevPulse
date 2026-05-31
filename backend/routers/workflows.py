import os
import json
from fastapi import APIRouter, HTTPException, Body, Depends
from typing import Dict, Any
from services.agent_service import run_workflow_template
from services.coral_service import coral
from config import settings
from logger import get_logger

log = get_logger("devpulse.workflows")
router = APIRouter()

TEMPLATES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "templates")

@router.post("/workflows")
def create_workflow(template: Dict[str, Any] = Body(...)):
    required_fields = ["id", "name", "description", "icon", "category", "variables", "ui_layout", "queries"]
    for field in required_fields:
        if field not in template:
            raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
            
    workflow_id = template["id"]
    # sanitize workflow_id to avoid path traversal
    workflow_id = "".join(c for c in workflow_id if c.isalnum() or c in "-_")
    if not workflow_id:
        raise HTTPException(status_code=400, detail="Invalid workflow ID")
        
    template_path = os.path.join(TEMPLATES_DIR, f"{workflow_id}.json")
    try:
        with open(template_path, "w", encoding="utf-8") as f:
            json.dump(template, f, indent=2, ensure_ascii=False)
        return {"status": "success", "template": template}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save template: {str(e)}")

@router.get("/workflows")
def list_workflows():
    if not os.path.exists(TEMPLATES_DIR):
        return []
    templates = []
    for file in os.listdir(TEMPLATES_DIR):
        if file.endswith(".json"):
            try:
                with open(os.path.join(TEMPLATES_DIR, file), "r", encoding="utf-8") as f:
                    templates.append(json.load(f))
            except Exception:
                pass
    return templates

from services.auth import get_current_user

@router.get("/workflows/discover")
async def discover_workflow_parameters(user: dict = Depends(get_current_user)):
    from routers.settings import get_user_tokens
    user_id = user["id"]
    tokens = await get_user_tokens(user_id)

    # Determine which integrations the user has actually connected
    has_github = bool(tokens.get("GITHUB_TOKEN"))
    has_linear = bool(tokens.get("LINEAR_API_KEY"))
    has_slack = bool(tokens.get("SLACK_TOKEN"))
    has_sentry = bool(tokens.get("SENTRY_TOKEN"))

    connected_count = sum([has_github, has_linear, has_slack, has_sentry])

    # Only query Coral for sources the current user has tokens for
    repos = []
    if has_github:
        try:
            rows = await coral.query("SELECT name, full_name FROM github.user_repos LIMIT 50")
            if isinstance(rows, list):
                for row in rows:
                    name = row.get("name", "")
                    full_name = row.get("full_name", "")
                    owner = full_name.split("/")[0] if "/" in full_name else ""
                    repos.append({"name": name, "owner": owner, "full_name": full_name})
        except Exception as e:
            log.warning("Discovery [github.user_repos] failed: %s", e)

    channels = []
    if has_slack:
        try:
            rows = await coral.query("SELECT name FROM slack.channels LIMIT 50")
            if isinstance(rows, list):
                for row in rows:
                    channels.append({"name": row.get("name", "")})
        except Exception as e:
            log.warning("Discovery [slack.channels] failed: %s", e)

    teams = []
    if has_linear:
        try:
            rows = await coral.query("SELECT key, name FROM linear.teams LIMIT 50")
            if isinstance(rows, list):
                for row in rows:
                    teams.append({"key": row.get("key", ""), "name": row.get("name", "")})
        except Exception as e:
            log.warning("Discovery [linear.teams] failed: %s", e)

    return {
        "github_repos": repos,
        "slack_channels": channels,
        "linear_teams": teams,
        "sentry_org": tokens.get("SENTRY_ORG", ""),
        "github_owner": tokens.get("GITHUB_OWNER", ""),
        "integrations": {
            "has_github": has_github,
            "has_linear": has_linear,
            "has_slack": has_slack,
            "has_sentry": has_sentry,
            "connected_count": connected_count,
            "total": 4,
        },
    }

def get_friendly_error_message(e: Exception) -> str:
    error_msg = str(e)
    if "429" in error_msg or "quota" in error_msg.lower() or "limit" in error_msg.lower():
        return "The AI Synthesis engine is currently busy. Please wait a few seconds and click 'Run Analysis' again."
    if "403" in error_msg or "permission" in error_msg.lower() or "unauthorized" in error_msg.lower():
        return "Integration access denied (403). Please verify your Sentry Organization slug and Token in settings."
    if "no column" in error_msg.lower() or "no table" in error_msg.lower() or "schema" in error_msg.lower():
        # Strip detail to avoid raw sql leaks, keep description readable
        clean_msg = error_msg.split("Detail:")[0].replace("Coral query error:", "").strip()
        return f"Database query failed due to a schema mismatch: {clean_msg}"
    return "An unexpected error occurred while running the workspace. Please check your settings and try again."

@router.post("/workflows/{workflow_id}/run")
async def run_workflow(workflow_id: str, payload: Dict[str, Any] = Body(default={}), user: dict = Depends(get_current_user)):
    template_path = os.path.join(TEMPLATES_DIR, f"{workflow_id}.json")
    if not os.path.exists(template_path):
        raise HTTPException(status_code=404, detail="Workflow template not found")
    
    try:
        with open(template_path, "r", encoding="utf-8") as f:
            template = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Failed to load template specification file.")
        
    import time
    start = time.time()
    status = "SUCCESS"
    result = None
    try:
        result = await run_workflow_template(template, payload)
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        import traceback
        traceback.print_exc()
        status = "ERROR"
        raise HTTPException(status_code=500, detail=get_friendly_error_message(e))
    finally:
        duration_ms = int((time.time() - start) * 1000)
        # Persist to workflow_runs
        try:
            from db.database import db
            cursor = await db.execute(
                """INSERT INTO workflow_runs
                   (workflow_id, workflow_name, workflow_icon, user_id,
                    variables, raw_data, synthesis, ui_layout, duration_ms, status)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    workflow_id,
                    template.get("name", workflow_id),
                    template.get("icon", "📊"),
                    user.get("id"),
                    json.dumps(result.get("variables") if result else payload.get("variables")),
                    json.dumps(result.get("raw_data")) if result else None,
                    result.get("synthesis") if result else None,
                    json.dumps(result.get("ui_layout")) if result else None,
                    duration_ms,
                    status,
                ),
            )
            await db.commit()
            run_id = cursor.lastrowid
            log.info("Saved workflow run id=%s for %s (%dms)", run_id, workflow_id, duration_ms)
            if result:
                result["run_id"] = run_id
        except Exception as persist_err:
            log.error("Failed to persist workflow run: %s", persist_err)
    
    return result


# ─── History Endpoints ────────────────────────────────────────

@router.get("/workflows/history")
async def list_run_history(
    limit: int = 50,
    offset: int = 0,
    workflow_id: str | None = None,
    user: dict = Depends(get_current_user),
):
    """Return a paginated list of past workflow runs, newest first."""
    from db.database import db
    
    where = "WHERE user_id = ?"
    params: list = [user["id"]]
    if workflow_id:
        where += " AND workflow_id = ?"
        params.append(workflow_id)
    
    rows = await db.execute_fetchall(
        f"""SELECT id, workflow_id, workflow_name, workflow_icon,
                   variables, status, duration_ms, created_at
            FROM workflow_runs
            {where}
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?""",
        (*params, limit, offset),
    )
    
    total_row = await db.execute_fetchall(
        f"SELECT COUNT(*) as cnt FROM workflow_runs {where}", params
    )
    total = total_row[0]["cnt"] if total_row else 0
    
    runs = []
    for r in rows:
        variables = {}
        try:
            variables = json.loads(r["variables"]) if r["variables"] else {}
        except Exception:
            pass
        runs.append({
            "id": r["id"],
            "workflow_id": r["workflow_id"],
            "workflow_name": r["workflow_name"],
            "workflow_icon": r["workflow_icon"],
            "variables_summary": {
                k: v for k, v in variables.items()
                if k in ("owner", "repo", "team_key", "team_name", "slack_channel")
            },
            "status": r["status"],
            "duration_ms": r["duration_ms"],
            "created_at": r["created_at"],
        })
    
    return {"runs": runs, "total": total}


@router.get("/workflows/history/{run_id}")
async def get_run_detail(run_id: int, user: dict = Depends(get_current_user)):
    """Return full data for a single historical run."""
    from db.database import db
    
    rows = await db.execute_fetchall(
        "SELECT * FROM workflow_runs WHERE id = ? AND user_id = ?",
        (run_id, user["id"]),
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Run not found")
    
    r = rows[0]
    return {
        "id": r["id"],
        "workflow_id": r["workflow_id"],
        "workflow_name": r["workflow_name"],
        "workflow_icon": r["workflow_icon"],
        "variables": json.loads(r["variables"]) if r["variables"] else {},
        "raw_data": json.loads(r["raw_data"]) if r["raw_data"] else {},
        "synthesis": r["synthesis"],
        "ui_layout": json.loads(r["ui_layout"]) if r["ui_layout"] else None,
        "status": r["status"],
        "duration_ms": r["duration_ms"],
        "created_at": r["created_at"],
    }


@router.get("/workflows/history/{run_id}/chat")
async def get_run_chat(run_id: int, user: dict = Depends(get_current_user)):
    """Return all chat messages associated with a specific run."""
    from db.database import db
    
    rows = await db.execute_fetchall(
        """SELECT id, role, content, created_at
           FROM chat_messages
           WHERE run_id = ? AND status = 'ACTIVE'
           ORDER BY created_at ASC""",
        (run_id,),
    )
    return {"messages": [dict(r) for r in rows]}
