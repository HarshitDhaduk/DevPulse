import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from services.coral_service import coral
from db.database import init_db
from jobs.scheduler import start_scheduler
from routers import report, query, chat, sources, settings, workflows, auth
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
    from db.database import init_db, close_db
    log.info("Calling init_db...")
    await init_db()
    log.info("init_db complete. Calling coral.start()...")
    await coral.start()
    log.info("coral.start() complete. Calling init_schema()...")
    from services.agent_service import init_schema
    await init_schema()
    log.info("init_schema complete. Calling check_sources()...")
    # Probe all sources on startup and persist status to DB
    try:
        from routers.sources import check_sources
        await check_sources()
        log.info("check_sources complete.")
    except Exception as e:
        log.warning("Startup source check failed (non-fatal): %s", e)
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
        await coral.stop()
        scheduler.shutdown()
        await close_db()


app = FastAPI(title="DevPulse API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://devpulse-frontend-408340417365.asia-south1.run.app"
    ],
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
