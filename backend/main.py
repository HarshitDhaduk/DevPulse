import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from services.coral_service import coral_manager
from db.database import init_db, close_db
from jobs.scheduler import start_scheduler
from routers import report, query, chat, sources, settings, workflows, auth
from config import settings as app_settings
from logger import get_logger

log = get_logger("devpulse.main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Suppress noisy CancelledError on Windows during Uvicorn reload
    import sys
    if sys.platform == "win32":
        loop = asyncio.get_running_loop()
        def custom_handler(loop, context):
            exc = context.get("exception")
            if isinstance(exc, (asyncio.CancelledError, KeyboardInterrupt)):
                return
            loop.default_exception_handler(context)
        loop.set_exception_handler(custom_handler)
        
    log.info("Starting lifespan...")
    log.info("Calling init_db...")
    await init_db()
    log.info("init_db complete.")
    log.info("Starting scheduler...")
    scheduler = start_scheduler()
    log.info("Scheduler started.")
    log.info("DevPulse API ready")
    try:
        yield
    except asyncio.CancelledError:
        pass
    finally:
        log.info("Shutting down...")
        await coral_manager.stop_all()
        scheduler.shutdown()
        await close_db()


app = FastAPI(title="DevPulse API", lifespan=lifespan)

# Existing origins are kept as-is; FRONTEND_URL is added so a deployment can
# declare its own origin through config instead of requiring a code change.
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "https://devpulse-frontend-408340417365.asia-south1.run.app",
]
if app_settings.FRONTEND_URL and app_settings.FRONTEND_URL not in ALLOWED_ORIGINS:
    ALLOWED_ORIGINS.append(app_settings.FRONTEND_URL.rstrip("/"))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.get("/health")(lambda: {"status": "ok"})

app.include_router(auth.router, prefix="/api")
app.include_router(report.router, prefix="/api")
app.include_router(query.router, prefix="/api")
app.include_router(chat.router, prefix="/api")
app.include_router(sources.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(workflows.router, prefix="/api")
