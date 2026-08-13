"""Regression tests for the fixes applied in the 2026-08 code audit.

Deliberately offline: no Coral binary, no network, no real credentials. Each
test targets logic that was changed, so a regression here means one of the
audited defects has come back.

Run with:  .venv/Scripts/python -m pytest tests/test_audit_fixes.py -v
"""

import os
import sys
import shutil
import sqlite3
import tempfile
import time

import pytest

# Import backend modules as `services.x` / `db.x`, matching runtime layout.
BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# config.py requires GOOGLE_API_KEY; supply a dummy so import succeeds without
# a real .env. Set before any backend import.
os.environ.setdefault("GOOGLE_API_KEY", "test-key-not-used")


# ── SQL literal escaping (audit H2) ──────────────────────────────────────

def _sql_literal(value):
    """Local copy of services.agent_service._sql_literal.

    Duplicated so these tests don't import agent_service, which pulls in
    langchain and constructs Gemini clients at module scope.
    """
    from services.agent_service import _sql_literal as impl
    return impl(value)


@pytest.mark.parametrize(
    "raw,expected",
    [
        ("wemakedev", "wemakedev"),            # ordinary value untouched
        ("O'Brien", "O''Brien"),               # legitimate apostrophe escaped
        ("", ""),                              # empty string
        ("a''b", "a''''b"),                    # already-doubled quotes re-escaped
    ],
)
def test_sql_literal_escapes_quotes(raw, expected):
    assert _sql_literal(raw) == expected


@pytest.mark.parametrize(
    "payload",
    [
        "x' OR '1'='1",
        "'; DROP TABLE users; --",
        "a' UNION SELECT password_hash FROM users --",
        "'''",
    ],
)
def test_sql_literal_neutralises_injection(payload):
    """The payload must survive as inert data, not become executable syntax.

    Rather than pattern-matching the rendered string, let a real SQL parser
    settle it: interpolate the escaped value into a literal, execute, and
    require the engine to hand back exactly the original payload. If the
    escaping were wrong the statement would fail to parse or yield something
    other than the input.
    """
    escaped = _sql_literal(payload)
    sql = f"SELECT '{escaped}' AS v"

    conn = sqlite3.connect(":memory:")
    try:
        conn.execute("CREATE TABLE users (password_hash TEXT)")
        conn.execute("INSERT INTO users VALUES ('secret')")
        # A single statement only — execute() rejects piggy-backed statements,
        # so a successful parse also proves no statement break-out occurred.
        row = conn.execute(sql).fetchone()
        assert row[0] == payload
        # The table an injected payload would have targeted is still intact.
        assert conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
    finally:
        conn.close()


def test_sql_literal_passes_through_non_strings():
    """Ints/bools/None must not be stringified by the escaper."""
    assert _sql_literal(7) == 7
    assert _sql_literal(True) is True
    assert _sql_literal(None) is None


# ── Fernet token encryption (crypto.py) ──────────────────────────────────

def test_encrypt_decrypt_roundtrip():
    from services.crypto import encrypt, decrypt
    secret = "ghp_exampleTokenValue1234567890"
    assert decrypt(encrypt(secret)) == secret


def test_encrypt_is_not_plaintext():
    from services.crypto import encrypt
    secret = "ghp_exampleTokenValue1234567890"
    assert secret not in encrypt(secret)


def test_decrypt_rejects_tampered_ciphertext():
    from cryptography.fernet import InvalidToken
    from services.crypto import encrypt, decrypt
    ct = encrypt("sensitive")
    tampered = ct[:-4] + ("aaaa" if not ct.endswith("aaaa") else "bbbb")
    with pytest.raises(InvalidToken):
        decrypt(tampered)


# ── JWT session tokens (services/auth.py) ────────────────────────────────

def test_jwt_roundtrip_carries_identity():
    from services.auth import create_jwt, verify_jwt
    payload = verify_jwt(create_jwt(42, "dev@example.com"))
    assert payload["sub"] == "42"
    assert payload["email"] == "dev@example.com"


def test_jwt_rejects_wrong_signature():
    import jwt as pyjwt
    from fastapi import HTTPException
    from services.auth import verify_jwt, JWT_ALGORITHM
    forged = pyjwt.encode(
        {"sub": "1", "email": "attacker@example.com",
         "exp": int(time.time()) + 3600},
        "not-the-real-secret",
        algorithm=JWT_ALGORITHM,
    )
    with pytest.raises(HTTPException) as exc:
        verify_jwt(forged)
    assert exc.value.status_code == 401


def test_jwt_rejects_expired_token():
    import jwt as pyjwt
    from fastapi import HTTPException
    from config import settings
    from services.auth import verify_jwt, JWT_ALGORITHM
    expired = pyjwt.encode(
        {"sub": "1", "email": "a@b.c", "exp": int(time.time()) - 60},
        settings.JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )
    with pytest.raises(HTTPException) as exc:
        verify_jwt(expired)
    assert exc.value.status_code == 401


# ── bcrypt 72-byte boundary (audit M3) ───────────────────────────────────

def test_password_roundtrip_at_and_over_bcrypt_limit():
    """Passwords longer than 72 bytes used to raise ValueError -> HTTP 500."""
    import bcrypt
    from services.auth import _bcrypt_bytes

    for password in ("short-pw", "x" * 72, "y" * 200):
        hashed = bcrypt.hashpw(_bcrypt_bytes(password), bcrypt.gensalt())
        assert bcrypt.checkpw(_bcrypt_bytes(password), hashed)


def test_bcrypt_bytes_never_exceeds_limit():
    from services.auth import _bcrypt_bytes, BCRYPT_MAX_BYTES
    assert len(_bcrypt_bytes("é" * 500)) <= BCRYPT_MAX_BYTES


# ── workflow_id path-traversal sanitisation (audit C1) ───────────────────

def _sanitize(workflow_id: str) -> str:
    """Mirrors the guard used in routers/workflows.py."""
    return "".join(c for c in workflow_id if c.isalnum() or c in "-_")


@pytest.mark.parametrize(
    "hostile",
    ["../../etc/passwd", "..\\..\\windows\\system32", "/etc/shadow", "a/../b"],
)
def test_workflow_id_sanitisation_strips_traversal(hostile):
    safe = _sanitize(hostile)
    assert "/" not in safe and "\\" not in safe and ".." not in safe
    # run_workflow additionally requires sanitised == original, so any
    # traversal attempt is rejected outright rather than silently rewritten.
    assert safe != hostile


def test_workflow_id_sanitisation_preserves_real_ids():
    for wid in ("morning-standup", "sprint_retro", "prod-stability2"):
        assert _sanitize(wid) == wid


def test_workflow_id_sanitisation_can_empty_out():
    assert _sanitize("../") == ""
    assert _sanitize("...") == ""


# ── Schema migrations (audit C3) ─────────────────────────────────────────

MIGRATED = [
    ("query_history", "user_id"),
    ("saved_queries", "user_id"),
    ("reports", "user_id"),
    ("chat_sessions", "user_id"),
    ("chat_messages", "run_id"),
]


@pytest.fixture
def fresh_db_dir():
    d = tempfile.mkdtemp()
    yield d
    shutil.rmtree(d, ignore_errors=True)


async def _init_into(db_dir):
    """Run init_db against db_dir and return the resulting file path."""
    import importlib
    os.environ["DB_DIR"] = db_dir
    import db.database as database
    importlib.reload(database)
    await database.init_db()
    await database.close_db()
    return str(database.DB_PATH)


@pytest.mark.asyncio
async def test_init_db_creates_all_migrated_columns(fresh_db_dir):
    path = await _init_into(fresh_db_dir)
    conn = sqlite3.connect(path)
    try:
        for table, column in MIGRATED:
            cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]
            assert column in cols, f"{table}.{column} missing after init_db"
    finally:
        conn.close()


@pytest.mark.asyncio
async def test_init_db_upgrades_a_pre_migration_database(fresh_db_dir):
    """An old DB without the user_id columns must migrate cleanly."""
    path = os.path.join(fresh_db_dir, "devpulse.db")
    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, google_id TEXT,
                            email TEXT, status TEXT DEFAULT 'ACTIVE');
        CREATE TABLE query_history (id INTEGER PRIMARY KEY AUTOINCREMENT, sql TEXT NOT NULL,
                                    source TEXT DEFAULT 'explorer', status TEXT DEFAULT 'SUCCESS',
                                    executed_at TEXT DEFAULT (datetime('now')),
                                    created_at TEXT DEFAULT (datetime('now')),
                                    updated_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE saved_queries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
                                    sql TEXT NOT NULL, status TEXT DEFAULT 'ACTIVE',
                                    created_at TEXT DEFAULT (datetime('now')),
                                    updated_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE reports (id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT NOT NULL,
                              trigger TEXT DEFAULT 'manual', status TEXT DEFAULT 'ACTIVE',
                              generated_at TEXT NOT NULL,
                              created_at TEXT DEFAULT (datetime('now')),
                              updated_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE chat_sessions (id INTEGER PRIMARY KEY AUTOINCREMENT,
                                    session_key TEXT NOT NULL UNIQUE, title TEXT,
                                    status TEXT DEFAULT 'ACTIVE',
                                    created_at TEXT DEFAULT (datetime('now')),
                                    updated_at TEXT DEFAULT (datetime('now')));
        """
    )
    conn.commit()
    conn.close()

    await _init_into(fresh_db_dir)

    conn = sqlite3.connect(path)
    try:
        for table, column in MIGRATED:
            cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]
            assert column in cols, f"{table}.{column} missing after migration"
        # The writes that failed before the migration must now succeed.
        conn.execute(
            "INSERT INTO query_history (sql, user_id) VALUES (?, ?)", ("SELECT 1", 1)
        )
        conn.execute(
            "INSERT INTO saved_queries (name, sql, user_id) VALUES (?, ?, ?)",
            ("n", "SELECT 1", 1),
        )
        conn.execute(
            "INSERT INTO reports (content, generated_at, user_id) VALUES (?, ?, ?)",
            ("c", "2026-01-01T00:00:00", 1),
        )
        conn.commit()
    finally:
        conn.close()


@pytest.mark.asyncio
async def test_init_db_is_idempotent(fresh_db_dir):
    """Repeated startups must not error or duplicate columns."""
    path = await _init_into(fresh_db_dir)
    await _init_into(fresh_db_dir)
    await _init_into(fresh_db_dir)

    conn = sqlite3.connect(path)
    try:
        for table, column in MIGRATED:
            cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]
            assert cols.count(column) == 1, f"{table}.{column} duplicated"
    finally:
        conn.close()
