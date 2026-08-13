import aiosqlite
from pathlib import Path
from logger import get_logger

log = get_logger("devpulse.db")

import os

DB_DIR = os.environ.get("DB_DIR", str(Path(__file__).parent))
DB_PATH = Path(DB_DIR) / "devpulse.db"
db: aiosqlite.Connection | None = None


async def _add_column_if_missing(table: str, column: str, definition: str) -> bool:
    """Add a column to an existing table if it isn't there yet. Idempotent.

    SQLite has no ``ADD COLUMN IF NOT EXISTS``, so the column list is inspected
    first. Returns True when a migration was actually applied.
    """
    cols = await db.execute_fetchall(f"PRAGMA table_info({table})")
    if any(row[1] == column for row in cols):
        return False
    await db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    log.info("Migrated %s: added %s column", table, column)
    return True


async def init_db():
    global db
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=MEMORY")
    await db.execute("PRAGMA temp_store=MEMORY")

    # 1. Execute the main schema to ensure all tables exist
    schema = Path(__file__).parent.joinpath("schema.sql").read_text()
    await db.executescript(schema)

    # 2. Lightweight migrations for existing databases.
    #    Additive only — columns are added, never renamed, retyped or dropped,
    #    so an older database keeps working and a newer one is left untouched.
    await _add_column_if_missing(
        "chat_messages", "run_id",
        "INTEGER REFERENCES workflow_runs(id)",
    )
    # These four columns are written by routers/query.py, routers/report.py and
    # jobs/scheduler.py but were missing from schema.sql, so every INSERT that
    # referenced them failed at runtime.
    await _add_column_if_missing(
        "query_history", "user_id",
        "INTEGER REFERENCES users(id) ON DELETE CASCADE",
    )
    await _add_column_if_missing(
        "saved_queries", "user_id",
        "INTEGER REFERENCES users(id) ON DELETE CASCADE",
    )
    await _add_column_if_missing(
        "reports", "user_id",
        "INTEGER REFERENCES users(id) ON DELETE SET NULL",
    )
    await _add_column_if_missing(
        "chat_sessions", "user_id",
        "INTEGER REFERENCES users(id) ON DELETE CASCADE",
    )

    # 3. Indexes on the migrated columns. These live here rather than in
    #    schema.sql because that script runs first, when an already-existing
    #    table has not yet gained the column the index refers to.
    for table, column in (
        ("query_history", "user_id"),
        ("saved_queries", "user_id"),
        ("reports", "user_id"),
        ("chat_sessions", "user_id"),
    ):
        await db.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{table}_{column} ON {table} ({column})"
        )

    await db.commit()

    log.info("Database initialised at %s", DB_PATH)

async def close_db():
    global db
    if db is not None:
        await db.close()
        log.info("Database connection closed")
        db = None
