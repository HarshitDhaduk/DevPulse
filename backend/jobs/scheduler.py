from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from services.agent_service import generate_report
import db.database as database
from logger import get_logger
import json
import time
import httpx
from routers.settings import _get_user_setting, _set_user_setting, inject_user_tokens
from services.coral_service import coral
from config import settings

log = get_logger("devpulse.scheduler")


async def run_daily_report():
    log.info("Generating daily engineering health report...")
    try:
        report = await generate_report()
        await database.db.execute(
            "INSERT INTO reports (content, raw_data, generated_at, trigger) VALUES (?, ?, ?, 'scheduled')",
            (report["report"], json.dumps(report["raw_data"]), report["generated_at"]),
        )
        await database.db.commit()
        log.info("Daily report saved successfully")
    except Exception as e:
        log.error("Daily report failed: %s", e)


async def auto_renew_tokens():
    """Background job to refresh OAuth tokens before they expire."""
    log.info("Checking for expiring OAuth tokens...")
    try:
        async with database.db.execute(
            "SELECT user_id, setting_key, setting_val FROM user_settings WHERE setting_key IN ('SLACK_EXPIRES_AT', 'LINEAR_EXPIRES_AT', 'SENTRY_EXPIRES_AT')"
        ) as cursor:
            rows = await cursor.fetchall()
            
        from services.crypto import decrypt
        now = time.time()
        
        for row in rows:
            try:
                user_id = row["user_id"]
                key_type = row["setting_key"]
                expires_at_str = decrypt(row["setting_val"])
                if int(expires_at_str) < now + 900: # expiring in less than 15 minutes
                    prefix = key_type.split("_")[0] # SLACK, LINEAR, or SENTRY
                    log.info("Renewing %s token for user %s", prefix, user_id)
                    refresh_token = await _get_user_setting(user_id, f"{prefix}_REFRESH_TOKEN")
                    if not refresh_token:
                        continue
                        
                    async with httpx.AsyncClient() as client:
                        if prefix == "SLACK":
                            response = await client.post(
                                "https://slack.com/api/oauth.v2.access",
                                data={
                                    "client_id": settings.SLACK_CLIENT_ID,
                                    "client_secret": settings.SLACK_CLIENT_SECRET,
                                    "grant_type": "refresh_token",
                                    "refresh_token": refresh_token,
                                }
                            )
                        elif prefix == "LINEAR":
                            response = await client.post(
                                "https://api.linear.app/oauth/token",
                                headers={"Content-Type": "application/x-www-form-urlencoded"},
                                data={
                                    "grant_type": "refresh_token",
                                    "client_id": settings.LINEAR_CLIENT_ID,
                                    "client_secret": settings.LINEAR_CLIENT_SECRET,
                                    "refresh_token": refresh_token,
                                }
                            )
                        elif prefix == "SENTRY":
                            response = await client.post(
                                "https://sentry.io/oauth/token/",
                                data={
                                    "grant_type": "refresh_token",
                                    "client_id": settings.SENTRY_CLIENT_ID,
                                    "client_secret": settings.SENTRY_CLIENT_SECRET,
                                    "refresh_token": refresh_token,
                                }
                            )
                        
                    data = response.json()
                    
                    # Slack uses "ok", others usually just return token or "error"
                    if data.get("ok") or ("error" not in data and ("access_token" in data or "token" in data)):
                        access_token = data.get("access_token") or data.get("token")
                        new_refresh = data.get("refresh_token")
                        expires_in = data.get("expires_in")
                        
                        token_key = "LINEAR_API_KEY" if prefix == "LINEAR" else f"{prefix}_TOKEN"
                        
                        await _set_user_setting(user_id, token_key, access_token)
                        if new_refresh:
                            await _set_user_setting(user_id, f"{prefix}_REFRESH_TOKEN", new_refresh)
                        if expires_in:
                            await _set_user_setting(user_id, f"{prefix}_EXPIRES_AT", str(int(now + expires_in)))
                            
                        # Inject new token to environment and restart Coral
                        inject_user_tokens({token_key: access_token})
                        await coral.stop()
                        await coral.start()
                        from services.agent_service import init_schema
                        await init_schema()
                        log.info("%s token auto-renewed for user %s and Coral restarted.", prefix, user_id)
                    else:
                        error_msg = data.get("error_description") or data.get("error")
                        log.error("Failed to renew %s token for user %s: %s", prefix, user_id, error_msg)
            except Exception as e:
                log.error("Error processing token renewal for user: %s", e)
    except Exception as e:
        log.error("Auto-renew job failed: %s", e)


def start_scheduler() -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler()
    scheduler.add_job(
        run_daily_report,
        CronTrigger(day_of_week="mon-fri", hour=9, minute=0),
        id="daily_report",
    )
    scheduler.add_job(
        auto_renew_tokens,
        IntervalTrigger(minutes=5),
        id="auto_renew_tokens",
    )
    scheduler.start()
    return scheduler
