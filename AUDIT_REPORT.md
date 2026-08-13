# DevPulse — Code Audit Report

**Scope:** `backend/` (FastAPI + Coral MCP + SQLite) and `frontend/` (Next.js 16 / React 19)
**Commit audited:** `0246136`
**Dimensions:** Code Quality · Security · Efficiency · Testing · Accessibility
**Constraint:** no breaking changes — public API paths, request/response shapes, env var names and config keys are unchanged. Fixes that would require a breaking change are listed in [Recommendations](#recommendations-not-applied--would-be-breaking) instead.

---

## Baseline (before any change)

| Check | Result |
|---|---|
| `npx next build` | ✅ passes — 15 routes generated |
| `npx eslint .` | ⚠️ 40 errors, 4 warnings (all pre-existing) |
| Backend import + route table | ✅ imports cleanly, 32 routes registered |
| Backend test suite | ❌ none — `backend/tests/*.py` are manual scripts that import a symbol (`coral`) that no longer exists |

---

## Severity summary

| ID | Severity | Area | Finding |
|---|---|---|---|
| [C1](#c1) | 🔴 Critical | Security | `POST /api/workflows` is unauthenticated — anyone can plant SQL that runs against every user's connected accounts |
| [C2](#c2) | 🔴 Critical | Security | `GET /api/workflows/history/{run_id}/chat` is not user-scoped (IDOR) — any user can read any user's chat |
| [C3](#c3) | 🔴 Critical | Correctness | Schema drift: Query Explorer, saved queries and report persistence are all broken at runtime |
| [C4](#c4) | 🔴 Critical | Correctness | `POST /api/report` always fails (missing argument); `GET /api/report/history` leaks every user's reports |
| [C5](#c5) | 🔴 Critical | Security | `.env` and the SQLite DB are not excluded from the Cloud Run / Docker build context |
| [H1](#h1) | 🟠 High | Security | `JWT_SECRET` / `ENCRYPTION_KEY` silently regenerate on container restart |
| [H2](#h2) | 🟠 High | Security | SQL injection through workflow template variables |
| [H3](#h3) | 🟠 High | Security | Chat memory and chat sessions are keyed only by a client-supplied id — cross-user leak |
| [H4](#h4) | 🟠 High | Security | `init_schema()` mutates a module-global prompt with one user's schema |
| [H5](#h5) | 🟠 High | Security | Frontend sends the JWT as a URL query parameter on every session restore |
| [H6](#h6) | 🟠 High | Security | OAuth flows carry no `state` parameter (CSRF on account linking) |
| [H7](#h7) | 🟠 High | Correctness | `coral_sources` is global, so one user's integration status overwrites everyone's |
| [H8](#h8) | 🟠 High | Security | Raw exception text returned to clients |
| [M1](#m1) | 🟡 Medium | Correctness | OAuth `redirect_uri` defaults to `localhost:3000` in production |
| [M2](#m2) | 🟡 Medium | Security | Full server environment (incl. all secrets) is passed to the Coral subprocess |
| [M3](#m3) | 🟡 Medium | Correctness | Passwords over 72 bytes raise an unhandled `ValueError` |
| [M4](#m4) | 🟡 Medium | Correctness | `/tmp` is hard-coded as the Coral config root |
| [M5](#m5) | 🟡 Medium | Correctness | Failed workflow runs are recorded as `SUCCESS` |
| [M6](#m6) | 🟡 Medium | Efficiency | Redundant repeated work per request; pending-future leak |
| [M7](#m7) | 🟡 Medium | Correctness | `PRAGMA journal_mode=MEMORY` risks corruption on crash |
| [M8](#m8) | 🟡 Medium | Accessibility | No ARIA anywhere; modal is not accessible; errors are not announced |
| [L1](#l1) | 🟢 Low | Quality | Dead code, duplicate imports, deprecated APIs, broken tests |

---

## Critical

### C1
**Unauthenticated workflow template creation → stored SQL executed against every user's data**
`backend/routers/workflows.py:15-34`

```python
@router.post("/workflows")
def create_workflow(template: Dict[str, Any] = Body(...)):
```

There is no `Depends(get_current_user)`. Every other write endpoint has one. An unauthenticated attacker can `POST /api/workflows` with an `id` matching an existing template (`morning-standup`, `sprint-retro`, …) and overwrite its `queries[].sql`. Templates are a **global, shared store** — the next time *any* user opens that workspace and clicks Run Analysis, the attacker's SQL executes inside that user's Coral instance, against that user's GitHub, Slack, Sentry and Linear credentials, and the rows are returned to the attacker's chosen widgets and persisted in `workflow_runs`.

The path-traversal guard on line 24 is correct and was not the weak point; the missing auth is.

**Fix applied:** added `user: dict = Depends(get_current_user)`. The frontend already attaches `Authorization` to every request via `authHeaders()` (`frontend/lib/api.ts:8`), so no client change was needed. Same treatment for `GET /api/workflows`, which is only ever called from authenticated pages.

---

### C2
**IDOR — any authenticated user can read any other user's chat history**
`backend/routers/workflows.py:287-299`

```python
rows = await db.execute_fetchall(
    """SELECT id, role, content, created_at FROM chat_messages
       WHERE run_id = ? AND status = 'ACTIVE' ORDER BY created_at ASC""",
    (run_id,),
)
```

The sibling endpoints `/workflows/history` and `/workflows/history/{run_id}` both filter on `user_id`. This one does not. `run_id` is a sequential integer, so enumerating `1..N` dumps every user's conversation with the AI — which contains their production error text, PR titles, and Slack messages.

**Fix applied:** joined `workflow_runs` and constrained to the caller's `user_id`. Response shape is byte-identical for legitimate callers.

---

### C3
**Schema drift — the live database is missing columns the code writes to**
`backend/db/schema.sql` vs `backend/routers/query.py:25,55,68,80`

The code was updated for multi-tenancy but `schema.sql` and the migration block in `db/database.py:26-30` were not. `init_db` only ever adds `chat_messages.run_id`. Verified against the checked-in `backend/db/devpulse.db`:

```
INSERT INTO query_history (…, user_id) → table query_history has no column named user_id
INSERT INTO saved_queries (…, user_id) → table saved_queries has no column named user_id
SELECT * FROM query_history WHERE user_id=? → no such column: user_id
INSERT INTO reports (…, user_id)       → table reports has no column named user_id
```

Runtime impact:

- `POST /api/query` — Coral runs the query fine, then the audit-log `INSERT` throws. The bare `except Exception` on line 30 converts it into `HTTP 400 "An error occurred while executing the query. Please check your SQL syntax."` **The Query Explorer never works, and the error blames the user's SQL.**
- `POST /api/query/save`, `GET /api/query/history`, `GET /api/query/saved` — uncaught `OperationalError` → HTTP 500.
- `jobs/scheduler.py:28` — the daily report insert fails for every user, every day, swallowed into a log line.

**Fix applied:** additive `ALTER TABLE … ADD COLUMN` migrations in `init_db()` (idempotent, guarded by `PRAGMA table_info`), plus the columns added to `schema.sql` for fresh databases. Purely additive — no column is renamed, retyped or dropped.

---

### C4
**`POST /api/report` is unconditionally broken, and report history leaks across users**
`backend/routers/report.py:16-52`

```python
report = await generate_report(workflow=req.workflow)     # line 19
```

`generate_report(workflow: str, user_id: int)` (`services/agent_service.py:227`) requires `user_id`. The call omits it → `TypeError` on every request → caught on line 20 → the endpoint always returns `503` with "Report generation failed. Please check Sentry / GitHub status or API tokens" — an error message that misdirects to integration credentials for what is a signature mismatch.

Separately, neither `POST /api/report` nor `GET /api/report/history` requires authentication, and the history query has no `user_id` filter — it returns the 20 most recent reports across **all** users.

**Fix applied:** both endpoints now take `Depends(get_current_user)`; `user_id` is threaded into `generate_report` and the `reports` insert; history is filtered by `user_id`. Neither endpoint is referenced by any page (`hooks/useReport.ts` is defined but never imported), so there is no client impact.

---

### C5
**Secrets and the user database are shipped into the deployment artifact**
`backend/.gcloudignore`, `backend/Dockerfile:23`

```
# backend/.gcloudignore — complete contents
.git
.venv
__pycache__
```

`.env` is absent from this list. `gcloud run deploy --source .` uploads the entire directory, and `Dockerfile:23` is `COPY . .`, so a real `backend/.env` — `GOOGLE_API_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY`, and the GitHub/Slack/Linear/Sentry client secrets — is **baked into every image layer**, readable by anyone who can pull the image. `db/devpulse.db` (all user records and their encrypted integration tokens) ships the same way. Note that `.env` *is* correctly git-ignored; this is a deploy-path gap, not a git-history leak — the git history is clean.

**Fix applied:** `.env*`, `db/*.db*`, `scratch/`, `tests/` and caches added to `.gcloudignore`, and a matching `backend/.dockerignore` created so local `docker build` is covered too.

---

## High

### H1
**Session and encryption keys silently regenerate on every container start**
`backend/config.py:41-51`

```python
if not settings.ENCRYPTION_KEY:
    settings.ENCRYPTION_KEY = Fernet.generate_key().decode()
    env_updates.append(f"\nENCRYPTION_KEY={settings.ENCRYPTION_KEY}")
...
if env_updates and os.path.exists(env_path):     # ← only persists if .env exists
```

In a container there is no `.env`, so the generated keys are never persisted. Every restart, every new Cloud Run instance, and every scale-out event gets **different keys**. Consequences:

1. All issued JWTs become invalid → every user is signed out.
2. Every integration token in `user_settings` was encrypted with the previous `ENCRYPTION_KEY` and is now **permanently undecryptable**. `_get_user_setting` catches the failure and returns `None` (`routers/settings.py:52-54`), so it surfaces as "integration silently disconnected" rather than an error.
3. With more than one instance running, the same user gets a different key per instance — behaviour becomes nondeterministic.

**Fix applied (non-breaking):** the auto-generation fallback is preserved exactly, but it now emits a prominent `CRITICAL` log when the value could not be persisted, naming the consequence. `ENCRYPTION_KEY` and `JWT_SECRET` were also added to `.env.example`, which previously documented only two of the eleven settings. Making these keys *required* would be a breaking config change — see [Recommendations](#recommendations-not-applied--would-be-breaking).

---

### H2
**SQL injection through workflow variables**
`backend/services/agent_service.py:496`

```python
sql = sql_template.format(**resolved_vars)
```

`resolved_vars` comes from the client (`payload["variables"]`, `routers/workflows.py:135`) and templates interpolate it directly inside SQL string literals:

```sql
FROM linear.issues WHERE team_key = '{team_name}'
```

A value of `x' OR '1'='1` breaks out of the literal. The allow-list validation in steps A–C partially covers `owner`, `repo`, `slack_channel`, `team_name` and `team_key` — but only when the relevant source reports `CONNECTED`, and each validation block ends in `except Exception: log.warning(...)`, which lets a failed lookup fall through to execution. Any other template variable (for example `sentry_org`, or variables in user-created templates) is never validated at all.

**Fix applied:** string values are escaped (`'` → `''`) immediately before `.format()`. Every legitimate value passes through unchanged, so behaviour is identical for valid input; only quote-bearing payloads are neutralised. Parameterised queries would be the stronger fix but Coral's MCP `sql` tool takes a single SQL string with no bind-parameter channel.

---

### H3
**Chat memory and chat sessions are shared across users**
`backend/services/agent_service.py:75,261-266` · `backend/routers/chat.py:13-26` · `frontend/.../workspace/[id]/page.tsx:131`

```python
_memories: dict[str, ConversationBufferWindowMemory] = {}   # keyed by session_id only
```

`session_id` is supplied by the client and defaults to the literal `"default"` (`routers/chat.py:76`). Two users on that default share one conversation buffer, so user A's questions and the answers built from A's private data are replayed into B's prompt context. `chat_sessions.session_key` is `UNIQUE` with no `user_id`, so the same collision persists to the database and `_ensure_session` will happily attach one user's messages to another's session row.

The frontend generates `session-${Date.now()}` — millisecond-granular and therefore genuinely collidable across concurrent users, not merely theoretically.

**Fix applied:** the memory dict is keyed by `(user_id, session_id)`; `chat_sessions` gained a `user_id` column (additive migration) and `_ensure_session` looks up and creates rows scoped to the caller. The frontend now uses `crypto.randomUUID()`. All response shapes unchanged.

---

### H4
**Per-user schema leaks into a module-global prompt**
`backend/services/agent_service.py:172-208`

```python
global sql_plan_chain
...
sql_plan_chain = new_prompt | llm_json | JsonOutputParser()
```

`init_schema(user_id)` rebuilds the *process-wide* SQL-planner prompt from one user's Coral catalogue. Whoever calls it last wins: every other user's chat is then planned against a prompt listing that user's schemas, table names and column names — an information leak, and a correctness bug when the schemas differ.

**Fix applied:** replaced the global with a per-user chain cache, falling back to the default chain. `stream_chat_response` selects the caller's chain.

---

### H5
**JWT transmitted in the URL query string**
`frontend/lib/auth.tsx:60-61`

```ts
api.get("/api/auth/me", { Authorization: `Bearer ${savedToken}` })
```

The second parameter of `api.get` is `params`, not headers (`lib/api.ts:30-34`) — it is serialised with `URLSearchParams` into the query string. Every session restore therefore issues `GET /api/auth/me?Authorization=Bearer%20eyJ...`, putting a 7-day session token into server access logs, browser history, and any intermediary. It "works" only because `authHeaders()` independently reads the token from `localStorage`.

**Fix applied:** the token is passed as the third argument, which routes it into the `Authorization` header. One-line change, no behavioural difference beyond the token leaving the URL.

Related, not applied: `/api/chat/stream` accepts the JWT as a `_token` query parameter (`services/auth.py:157`). That is a deliberate workaround for `EventSource` not supporting custom headers; removing it would break chat. See [Recommendations](#recommendations-not-applied--would-be-breaking).

---

### H6
**OAuth authorization requests carry no `state` — CSRF on account linking**
`frontend/app/(app)/settings/page.tsx:499,519,544,569` and the four callback pages

None of the four provider links include a `state` parameter, and no callback verifies one. An attacker who gets a victim to load `…/settings/github/callback?code=<attacker_code>` links the **attacker's** GitHub/Slack/Linear/Sentry account into the victim's DevPulse account. Subsequent workflow runs then pull the attacker's data into the victim's workspace — or, where the OAuth app grants write scope, give the victim's actions the attacker's context.

**Fix applied, frontend-only:** a random `state` is generated with `crypto.randomUUID()`, stored in `sessionStorage`, appended to the authorize URL, and verified in the callback before the `code` is exchanged. The backend is untouched and the request body sent to `/api/settings/*/oauth` is unchanged, so this is non-breaking; a stricter server-side binding is noted in the recommendations.

---

### H7
**Global source-status table makes one user's integrations govern everyone's**
`backend/routers/sources.py:20-32,95` · `backend/services/agent_service.py:293-307`

`coral_sources` has one row per source for the whole deployment (`schema.sql:171-189`). `POST /api/sources/check` writes the *calling user's* connection state into it. `get_source_status()` then reads that global row to gate workflow execution:

```python
if github_status != "CONNECTED":
    raise ValueError("GitHub integration is currently inactive …")
```

So when a user without a GitHub token opens the dashboard, the row flips to `DISCONNECTED`, and **every other user's** GitHub workflows start failing with a message telling them to reconnect a token that is already connected. It also runs the other way: a status of `CONNECTED` set by another user lets a token-less user past the gate.

`GET /api/sources` additionally has no authentication and returns this global state to anonymous callers.

**Fix applied:** `get_source_status()` now derives status from the calling user's own decrypted tokens instead of the shared table, which fixes the cross-user interference without changing any route, request or response shape. `GET /api/sources` now requires authentication (it is not referenced by any page). The `coral_sources` table is left in place, still written by `/sources/check`, purely as display state.

---

### H8
**Internal exception text returned to clients**
`backend/routers/settings.py:166,231,289,348,477` · `backend/services/auth.py:61` · `backend/routers/workflows.py:132`

```python
raise HTTPException(status_code=500, detail=str(e))
```

Five OAuth handlers return the raw exception string. `services/auth.py:61` returns `f"Invalid Google credential: {e}"`. `get_friendly_error_message`'s fallback appends `Details: {error_msg}`. These surface stack-adjacent internals — file paths, Coral binary paths, provider response bodies — to the browser, and in the Coral case can echo fragments of the SQL and connection detail.

**Fix applied:** generic client-facing messages; the full exception is logged server-side with `log.exception`. Status codes are unchanged, and the response still carries a `detail` string, so clients that display `err.detail` keep working.

---

## Medium

### M1
**OAuth `redirect_uri` falls back to `localhost:3000` in production**
`backend/routers/settings.py:251,311,369`

```python
"redirect_uri": req.redirect_uri or "http://localhost:3000/settings/slack/callback",
```

`FRONTEND_URL` exists in config (`config.py:25`) and is unused here. Whenever the client omits `redirect_uri`, the production token exchange is sent with a localhost callback and the provider rejects it.

**Fix applied:** the fallback now derives from `settings.FRONTEND_URL`. Client-supplied values still take precedence, so behaviour is unchanged wherever the frontend sends the field.

Related: `main.py:52-55` hard-codes the two allowed CORS origins. `FRONTEND_URL` is now *added* to that list rather than replacing it, so existing origins keep working.

### M2
**The entire server environment is handed to the Coral subprocess**
`backend/services/coral_service.py:32,45-46`

`self._env = os.environ.copy()` gives the third-party `coral` binary `GOOGLE_API_KEY`, `JWT_SECRET`, `ENCRYPTION_KEY` and all four OAuth client secrets, none of which it needs. It only needs the per-source tokens and a basic execution environment.

**Fix applied:** DevPulse's own secrets are stripped from the child environment; `PATH`, `HOME`, the isolation variables and the user's integration tokens are preserved, so Coral's behaviour is unchanged.

### M3
**Passwords longer than 72 bytes crash registration and login**
`backend/services/auth.py:114-115,145`

`bcrypt` ≥ 4.0 raises `ValueError: password cannot be longer than 72 bytes`. `register_user_email` lets it propagate → HTTP 500. **Fix applied:** the password is truncated to 72 bytes consistently in both `hashpw` and `checkpw` — bcrypt's own documented limit, applied symmetrically so existing hashes still verify.

### M4
**`/tmp` hard-coded as the Coral config root**
`backend/services/coral_service.py:37` — `base_dir = "/tmp"`. On Windows (the documented dev platform, per the `Makefile`) this resolves to `C:\tmp`, outside any temp convention. **Fix applied:** `tempfile.gettempdir()`, which still returns `/tmp` on Linux/Cloud Run, so the deployed path — and the GCS-Fuse rationale in the comment — is preserved exactly.

### M5
**Failed workflow runs are persisted as `SUCCESS`**
`backend/routers/workflows.py:161-167`. The `except ValueError` branch raises HTTP 400 without setting `status = "ERROR"`, so validation failures are recorded as successful runs and appear as successes in history. **Fix applied.**

### M6
**Redundant per-request work and a pending-future leak**
- `routers/workflows.py:56,69` and `:138,157` — `ensure_coral_tokens_loaded` is called twice per request in both handlers, each call decrypting every stored token. Duplicates removed.
- `services/coral_service.py:117-120,151-158` — on timeout the entry in `self._pending` is never popped, unlike `query()` which does pop (line 269). Slow leak across restarts. Fixed.
- `main.py:7,29` — `init_db` imported twice; `routers/workflows.py:1,50,54,68,136,156` — imports scattered mid-function. Tidied.

### M7
**`PRAGMA journal_mode=MEMORY`**
`backend/db/database.py:18`. The rollback journal is held in RAM, so a crash mid-transaction can corrupt the database rather than rolling back. Flagged, **not changed** — the choice appears deliberate for GCS-Fuse (mirroring the comment at `coral_service.py:35-36`) and switching it is a durability/behaviour tradeoff the maintainer should make. `WAL` is the usual answer on a normal filesystem.

### M8
**Accessibility — no ARIA anywhere in the application**
A grep for `role=` / `aria-` across `app/`, `components/` and `hooks/` returns exactly one hit (`aria-hidden` on a decorative GitHub logo). Specific defects:

| Location | Issue |
|---|---|
| `workspace/[id]/page.tsx:556-596` | Query-approval modal has no `role="dialog"`, no `aria-modal`, no focus trap, no Escape-to-close, and does not restore focus |
| `workspace/[id]/page.tsx:545-553`, `settings/page.tsx:267,455`, `LoginPage.tsx:194` | Error banners are not announced — no `role="alert"` |
| `workspace/[id]/page.tsx:599-617`, `settings/page.tsx:226`, `layout.tsx:9-20` | Loading states have no `aria-live`/`aria-busy` and no text alternative for the spinner |
| `workspace/[id]/page.tsx:535`, `settings/page.tsx:371,417,430` | `<label>` without `htmlFor`, inputs without `id` — labels are not programmatically associated |
| `workspace/[id]/page.tsx:724-730` | Chat input has placeholder text but no accessible name |
| `workspace/[id]/page.tsx:564`, `settings/page.tsx:306` | Icon-only buttons (`×`, `?`) have no `aria-label` |
| `settings/page.tsx:378,430` | `className="block … flex"` — conflicting display utilities, the later wins silently |
| `globals.css` | `animate-spin`, `animate-pulse`, `animate-bounce` used throughout with no `prefers-reduced-motion` guard |

**Fix applied:** all of the above except the `prefers-reduced-motion` guard, which is applied globally in `globals.css` as a single `@media` block. All changes are additive attributes — no DOM restructuring, no class renames, no visual change.

---

## Low

### L1
**Code quality**
- `routers/settings.py:19-27` — `VALID_KEYS` and `SECRET_KEYS` are defined and never read. They are also stale: `SLACK_REFRESH_TOKEN`, `LINEAR_EXPIRES_AT` etc. are written on lines 274-279/332-338 but absent from `VALID_KEYS`. Removed, with the live key list documented in a comment.
- `routers/settings.py:91-93` — `inject_user_tokens()` is an empty deprecated stub with no callers. Removed.
- `requirements.txt:11-12` — `httpx` listed twice, once unpinned then pinned to `0.27.0`. De-duplicated.
- `agent_service.py:256,587` — `datetime.utcnow()` is deprecated in Python 3.12+ (the venv here is 3.13). Replaced with `datetime.now(timezone.utc)`; the emitted ISO string keeps the same shape.
- `agent_service.py:513-518` — iterates `row.values()` assuming every Coral result is a list of dicts, but `_parse_result` can return a bare string (`coral_service.py:311`). Guarded with an `isinstance` check.
- `backend/tests/test_coral.py:6`, `test_sentry.py` — `from services.coral_service import coral` refers to a symbol removed when `CoralManager` was introduced. These files cannot run.
- `backend/scratch/` — five ad-hoc debugging scripts committed to the repo.
- `.env.example` documents 2 of the 11 settings in `config.py`.

**Fix applied:** dead code and the duplicate dependency removed; deprecated calls replaced; `.env.example` completed. The broken `tests/` scripts were left in place but a real test suite was added alongside them (below).

---

## Testing

There was no test framework, no test runner configured, and no CI. `backend/tests/` contained two manual scripts that require live Coral credentials and no longer import.

**Added:** `pytest` + `pytest-asyncio` to `requirements.txt`, a `pytest.ini`, and `backend/tests/test_audit_fixes.py` — **26 tests**, all offline (no network, no Coral binary, no credentials):

- Fernet encrypt/decrypt round-trip, ciphertext ≠ plaintext, tamper rejection
- JWT create/verify, expiry rejection, wrong-signature rejection
- SQL-literal escaping: quote handling, non-string passthrough, and four injection payloads
- `workflow_id` path-traversal sanitisation (`../`, `..\`, absolute paths, empty result)
- Schema migration: fresh DB, upgrade of a pre-migration DB, and idempotency across three `init_db()` runs
- bcrypt round-trip at and beyond the 72-byte boundary

The injection tests don't pattern-match the rendered string — they execute it through SQLite and require the engine to hand back exactly the original payload, with the target table left intact. Verified as a real guard by negative control: with the escaping removed, `SELECT 'x' OR '1'='1' AS v` parses as an expression yielding `1` instead of the string, and the test fails.

`pytest.ini` excludes the two pre-existing manual scripts (`test_coral.py`, `test_sentry.py`), which need live credentials and a running Coral binary. `pytest` is additive; nothing about the app's runtime depends on it.

---

## Efficiency notes (observed, no change required)

- One global `aiosqlite` connection serialises all DB access (`db/database.py:11`). Fine at current scale; a pool is the answer if write volume grows.
- `CoralService` spawns one long-lived subprocess **per user**, each with its own config dir under the temp root, and they are never evicted (`coral_service.py:369`). On a multi-instance Cloud Run deployment with many users this is the first resource ceiling you will hit. An LRU eviction policy is worth adding before scale.
- `get_user_tokens()` decrypts every stored setting on each call and is invoked on `/auth/me`, `/settings`, `/sources/check`, `/workflows/discover` and `/workflows/{id}/run`. Removing the duplicate calls (M6) roughly halves it; a short-lived per-request cache would remove the rest.

---

## Recommendations (not applied — would be breaking)

These are real issues whose fixes change a public contract, so they are documented rather than applied.

1. **Require `JWT_SECRET` and `ENCRYPTION_KEY` instead of auto-generating them** (H1). The correct fix is to fail startup when they are unset, so a misconfigured deploy cannot silently destroy stored tokens. This breaks any environment relying on the auto-generation fallback, and would need a documented key-provisioning step (Secret Manager) first.

2. **Stop accepting the JWT as the `_token` query parameter** (`services/auth.py:157`). Query-string tokens land in access logs. Removing it breaks chat, because `EventSource` cannot send an `Authorization` header. The migration is a short-lived, single-use stream ticket issued by a `POST` and exchanged on connect — a new endpoint plus a frontend change.

3. **Bind OAuth `state` server-side** (H6). The applied fix verifies `state` in the browser, which stops the cross-site linking attack but still trusts the client. A server-issued, single-use, user-bound `state` requires a new endpoint and a changed request body for `/api/settings/*/oauth`.

4. **Validate `email` with `EmailStr` and enforce a password policy** (`routers/auth.py:25-31`). `email` is a bare `str` with no format check, and passwords have no minimum length. Both make previously-accepted registrations fail, which is a behaviour change on a public endpoint.

5. **Scope workflow templates per user.** Templates are a shared filesystem store (`routers/workflows.py:13`), so any authenticated user can still overwrite another's template by reusing an `id` — C1 closed the anonymous hole, not the tenancy one. The fix is to move templates into the database keyed by `user_id`, which changes the storage format and the `GET /api/workflows` semantics.

6. **Re-key stored integration tokens.** If this deployment has ever restarted without a persisted `ENCRYPTION_KEY` (H1), existing `user_settings` rows are already undecryptable. Affected users must reconnect their integrations; there is no recovery path.

7. **Reconsider `PRAGMA journal_mode=MEMORY`** (M7) — durability tradeoff, maintainer's call.

8. **Rotate any credential that has been in a built image** (C5). Excluding `.env` going forward does not invalidate secrets already baked into existing image layers.

---

## Verification

| Check | Before | After |
|---|---|---|
| `npx next build` | ✅ 15 routes | ✅ 15 routes |
| `npx eslint .` | 40 errors, 4 warnings | **39 errors, 4 warnings** — no new findings; one pre-existing `react-hooks/purity` error fixed as a side effect |
| Backend import + route table | ✅ 32 routes | ✅ 32 routes, identical paths and methods |
| `pytest tests/test_audit_fixes.py` | n/a (no framework) | ✅ 26 passed |
| Migration against a copy of the live `devpulse.db` | 4 writes failing | ✅ all succeed, idempotent across repeated `init_db()` |

A per-route audit confirms the only endpoints still reachable without a session are `/health`, `/api/auth/google`, `/api/auth/register` and `/api/auth/login` — the sign-in surface itself.

Route paths, HTTP methods, request bodies, response shapes, env var names and config keys are unchanged.

### One behaviour change worth calling out

`GET /api/sources`, `GET /api/workflows` and `POST /api/workflows` now require the `Authorization` header. This is not a breaking change for this repo — `frontend/lib/api.ts:8` attaches the header to every request, and all three are only ever called from pages behind the authenticated app layout. It *would* break any undocumented external consumer calling them anonymously, which is precisely the access C1 exists to close.
