-- =============================================================
-- DevPulse SQLite Schema
-- All tables carry: created_at, updated_at, status ENUM
-- =============================================================

-- -------------------------------------------------------------
-- reports
--   Stores every generated engineering health report.
--   trigger: how it was created — 'manual' | 'scheduled' | 'chat'
--   status:  'ACTIVE' (visible) | 'ARCHIVED' | 'DELETED'
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  title         TEXT    NOT NULL DEFAULT 'Engineering Health Report',
  content       TEXT    NOT NULL,               -- Gemini-synthesised markdown
  raw_data      TEXT,                           -- JSON blob of Coral query results
  summary       TEXT,                           -- 3-bullet executive summary (extracted)
  trigger       TEXT    NOT NULL DEFAULT 'manual'
                        CHECK (trigger IN ('manual', 'scheduled', 'chat')),
  status        TEXT    NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
  generated_at  TEXT    NOT NULL,               -- ISO-8601 UTC from Gemini pipeline
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reports_status      ON reports (status);
CREATE INDEX IF NOT EXISTS idx_reports_generated   ON reports (generated_at DESC);

-- -------------------------------------------------------------
-- report_sections
--   Normalised breakdown of a report into typed sections
--   so the frontend can render each card independently.
--   section_type: 'sprint' | 'errors' | 'prs' | 'team' | 'ci'
--   status: 'ACTIVE' | 'DELETED'
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_sections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id     INTEGER NOT NULL REFERENCES reports (id) ON DELETE CASCADE,
  section_type  TEXT    NOT NULL
                        CHECK (section_type IN ('sprint', 'errors', 'prs', 'team', 'ci', 'custom')),
  heading       TEXT    NOT NULL,
  content       TEXT    NOT NULL,               -- markdown fragment
  raw_data      TEXT,                           -- JSON rows from Coral for this section
  sort_order    INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'DELETED')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_report_sections_report ON report_sections (report_id);

-- -------------------------------------------------------------
-- workflow_runs
--   Persists every workflow execution for history & replay.
--   status: 'SUCCESS' | 'ERROR' | 'PARTIAL'
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS workflow_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_id   TEXT    NOT NULL,                 -- template id e.g. 'morning-standup'
  workflow_name TEXT    NOT NULL,                 -- human-readable name
  workflow_icon TEXT    DEFAULT '📊',
  user_id       INTEGER REFERENCES users (id) ON DELETE SET NULL,
  variables     TEXT,                             -- JSON of input variables
  raw_data      TEXT,                             -- JSON of raw_data results
  synthesis     TEXT,                             -- AI markdown synthesis
  ui_layout     TEXT,                             -- JSON of ui_layout spec
  duration_ms   INTEGER,                          -- run duration in ms
  status        TEXT    NOT NULL DEFAULT 'SUCCESS'
                        CHECK (status IN ('SUCCESS', 'ERROR', 'PARTIAL')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_wid    ON workflow_runs (workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_user   ON workflow_runs (user_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_time   ON workflow_runs (created_at DESC);

-- -------------------------------------------------------------
-- chat_sessions
--   One row per browser session / conversation thread.
--   status: 'ACTIVE' | 'CLOSED' | 'DELETED'
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_sessions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_key   TEXT    NOT NULL UNIQUE,        -- UUID passed by frontend
  title         TEXT,                           -- auto-generated from first message
  status        TEXT    NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'CLOSED', 'DELETED')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_key ON chat_sessions (session_key);

-- -------------------------------------------------------------
-- chat_messages
--   Every turn in a chat session.
--   role: 'user' | 'agent'
--   status: 'ACTIVE' | 'DELETED'
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS chat_messages (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id    INTEGER NOT NULL REFERENCES chat_sessions (id) ON DELETE CASCADE,
  run_id        INTEGER REFERENCES workflow_runs (id) ON DELETE SET NULL,
  role          TEXT    NOT NULL CHECK (role IN ('user', 'agent')),
  content       TEXT    NOT NULL,               -- full message text / markdown
  coral_queries TEXT,                           -- JSON array of SQL strings used
  sources_hit   TEXT,                           -- JSON array: ['github','sentry',...]
  tokens_used   INTEGER,                        -- Gemini token count if available
  status        TEXT    NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'DELETED')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages (session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_run     ON chat_messages (run_id);

-- -------------------------------------------------------------
-- saved_queries
--   User-bookmarked Coral SQL queries from the Query Explorer.
--   status: 'ACTIVE' | 'ARCHIVED' | 'DELETED'
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS saved_queries (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  description   TEXT,
  sql           TEXT    NOT NULL,
  tags          TEXT,                           -- JSON array of tag strings
  last_run_at   TEXT,
  run_count     INTEGER NOT NULL DEFAULT 0,
  status        TEXT    NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'ARCHIVED', 'DELETED')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- -------------------------------------------------------------
-- query_history
--   Audit log of every Coral SQL execution (Explorer + agent).
--   source: where the query originated
--   status: 'SUCCESS' | 'ERROR' | 'TIMEOUT'
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS query_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sql           TEXT    NOT NULL,
  source        TEXT    NOT NULL DEFAULT 'explorer'
                        CHECK (source IN ('explorer', 'agent', 'scheduler', 'chat')),
  rows_returned INTEGER,
  execution_ms  INTEGER,
  error_message TEXT,                           -- populated on failure
  session_id    INTEGER REFERENCES chat_sessions (id) ON DELETE SET NULL,
  report_id     INTEGER REFERENCES reports (id) ON DELETE SET NULL,
  status        TEXT    NOT NULL DEFAULT 'SUCCESS'
                        CHECK (status IN ('SUCCESS', 'ERROR', 'TIMEOUT')),
  executed_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_query_history_status     ON query_history (status);
CREATE INDEX IF NOT EXISTS idx_query_history_executed   ON query_history (executed_at DESC);

-- -------------------------------------------------------------
-- coral_sources
--   Tracks the connection state of each Coral data source.
--   Refreshed on startup via GET /api/sources.
--   status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR' | 'UNKNOWN'
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coral_sources (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  source_name   TEXT    NOT NULL UNIQUE,        -- 'github' | 'linear' | 'slack' | 'sentry'
  display_name  TEXT    NOT NULL,
  last_checked  TEXT,
  error_message TEXT,
  table_count   INTEGER,
  status        TEXT    NOT NULL DEFAULT 'UNKNOWN'
                        CHECK (status IN ('CONNECTED', 'DISCONNECTED', 'ERROR', 'UNKNOWN')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- Seed known sources so the Settings page always has rows to show
INSERT OR IGNORE INTO coral_sources (source_name, display_name) VALUES
  ('github', 'GitHub'),
  ('linear', 'Linear'),
  ('slack',  'Slack'),
  ('sentry', 'Sentry');

-- -------------------------------------------------------------
-- users
--   Google OAuth user profiles.
--   status: 'ACTIVE' | 'SUSPENDED' | 'DELETED'
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id     TEXT    NOT NULL UNIQUE,        -- Google sub claim OR "email:user@domain"
  email         TEXT    NOT NULL,
  password_hash TEXT,                           -- Null for Google-only users
  display_name  TEXT,
  avatar_url    TEXT,
  status        TEXT    NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'SUSPENDED', 'DELETED')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users (email);

-- -------------------------------------------------------------
-- user_settings
--   Per-user encrypted token storage.
--   Each user stores their own integration tokens here.
--   setting_val is Fernet-encrypted.
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_settings (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  setting_key   TEXT    NOT NULL,               -- e.g. 'GITHUB_TOKEN', 'SENTRY_ORG'
  setting_val   TEXT    NOT NULL,               -- Fernet-encrypted value
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings (user_id);

-- -------------------------------------------------------------
-- scheduler_jobs
--   Audit log of every APScheduler run.
--   status: 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED'
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduler_jobs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        TEXT    NOT NULL,               -- APScheduler job id e.g. 'daily_report'
  triggered_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  completed_at  TEXT,
  report_id     INTEGER REFERENCES reports (id) ON DELETE SET NULL,
  error_message TEXT,
  status        TEXT    NOT NULL DEFAULT 'RUNNING'
                        CHECK (status IN ('RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED')),
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_job    ON scheduler_jobs (job_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_jobs_status ON scheduler_jobs (status);

-- -------------------------------------------------------------
-- Triggers: keep updated_at current on every UPDATE
-- -------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_reports_updated
  AFTER UPDATE ON reports
  BEGIN UPDATE reports SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_report_sections_updated
  AFTER UPDATE ON report_sections
  BEGIN UPDATE report_sections SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_chat_sessions_updated
  AFTER UPDATE ON chat_sessions
  BEGIN UPDATE chat_sessions SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_chat_messages_updated
  AFTER UPDATE ON chat_messages
  BEGIN UPDATE chat_messages SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_saved_queries_updated
  AFTER UPDATE ON saved_queries
  BEGIN UPDATE saved_queries SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_query_history_updated
  AFTER UPDATE ON query_history
  BEGIN UPDATE query_history SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_coral_sources_updated
  AFTER UPDATE ON coral_sources
  BEGIN UPDATE coral_sources SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_scheduler_jobs_updated
  AFTER UPDATE ON scheduler_jobs
  BEGIN UPDATE scheduler_jobs SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_users_updated
  AFTER UPDATE ON users
  BEGIN UPDATE users SET updated_at = datetime('now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_user_settings_updated
  AFTER UPDATE ON user_settings
  BEGIN UPDATE user_settings SET updated_at = datetime('now') WHERE id = NEW.id; END;
