import aiosqlite
from pathlib import Path
from logger import get_logger

log = get_logger("devpulse.db")

import os

DB_DIR = os.environ.get("DB_DIR", str(Path(__file__).parent))
DB_PATH = Path(DB_DIR) / "devpulse.db"
db: aiosqlite.Connection | None = None


async def init_db():
    global db
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=MEMORY")
    await db.execute("PRAGMA temp_store=MEMORY")

    # 1. Execute the main schema to ensure all tables exist
    schema = Path(__file__).parent.joinpath("schema.sql").read_text()
    await db.executescript(schema)
    
    # 2. Lightweight migrations for existing databases
    cols = await db.execute_fetchall("PRAGMA table_info(chat_messages)")
    col_names = {row[1] for row in cols}
    if "run_id" not in col_names:
        await db.execute("ALTER TABLE chat_messages ADD COLUMN run_id INTEGER REFERENCES workflow_runs(id)")
        log.info("Migrated chat_messages: added run_id column")

    await db.commit()

    log.info("Database initialised at %s", DB_PATH)

async def close_db():
    global db
    if db is not None:
        await db.close()
        log.info("Database connection closed")
        db = None
