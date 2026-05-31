import aiosqlite
from pathlib import Path
from logger import get_logger

log = get_logger("devpulse.db")

DB_PATH = Path(__file__).parent / "devpulse.db"
db: aiosqlite.Connection | None = None


async def init_db():
    global db
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row

    # 1. Create chat_messages and workflow_runs tables if they don't exist so migration doesn't fail
    await db.execute("""
        CREATE TABLE IF NOT EXISTS workflow_runs (
          id INTEGER PRIMARY KEY AUTOINCREMENT
        )
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT
        )
    """)
    
    # 2. Lightweight migrations for existing databases
    cols = await db.execute_fetchall("PRAGMA table_info(chat_messages)")
    col_names = {row[1] for row in cols}
    if "run_id" not in col_names:
        await db.execute("ALTER TABLE chat_messages ADD COLUMN run_id INTEGER REFERENCES workflow_runs(id)")
        await db.commit()
        log.info("Migrated chat_messages: added run_id column")

    # 3. Execute the rest of the schema
    schema = Path(__file__).parent.joinpath("schema.sql").read_text()
    await db.executescript(schema)
    await db.commit()

    log.info("Database initialised at %s", DB_PATH)

async def close_db():
    global db
    if db is not None:
        await db.close()
        log.info("Database connection closed")
        db = None
