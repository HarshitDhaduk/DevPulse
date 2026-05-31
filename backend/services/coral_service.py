import asyncio
import json
import os
import shutil
import subprocess
import sys
import threading
from pathlib import Path
from typing import Any
from logger import get_logger

log = get_logger("devpulse.coral")

# Coral v0.3.0: MCP command is `mcp-stdio`, SQL command is `sql`
ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_CORAL = ROOT_DIR / "coral-bin" / ("coral.exe" if sys.platform == "win32" else "coral")
# Resolve to an absolute string path; prefer env override, then PATH, then bundled binary
_env_bin = os.environ.get("CORAL_BIN")
_which_bin = shutil.which("coral")
CORAL_BIN: str = str(Path(_env_bin).resolve()) if _env_bin else (_which_bin or str(DEFAULT_CORAL.resolve()))


class CoralService:
    def __init__(self):
        self._process: subprocess.Popen | None = None
        self._pending: dict[int, asyncio.Future] = {}
        self._request_id = 0
        self._read_thread: threading.Thread | None = None
        self._loop: asyncio.AbstractEventLoop | None = None

    async def start(self):
        """Spawn Coral MCP server via stdio transport and complete MCP handshake."""
        coral_path = Path(CORAL_BIN)
        if not coral_path.exists():
            raise RuntimeError(
                f"Coral executable not found. Set CORAL_BIN or add Coral to PATH. "
                f"Tried: {CORAL_BIN}"
            )

        self._loop = asyncio.get_running_loop()
        self._process = subprocess.Popen(
            [str(coral_path), "mcp-stdio"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        # Read stdout in a background thread to avoid blocking the event loop
        self._read_thread = threading.Thread(target=self._read_loop, daemon=True)
        self._read_thread.start()
        log.info("Coral MCP server started (pid=%s, bin=%s)", self._process.pid, CORAL_BIN)

        # MCP requires an initialize → initialized handshake before any tools/call.
        # Without this, the server silently ignores all subsequent requests.
        await self._mcp_initialize()

    async def _mcp_initialize(self):
        """Perform the MCP initialize handshake (required before any tools/call)."""
        # Step 1: send initialize request and wait for the server's response
        self._request_id += 1
        req_id = self._request_id
        future: asyncio.Future = self._loop.create_future()
        self._pending[req_id] = future

        init_request = (json.dumps({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "initialize",
            "params": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "devpulse", "version": "0.1.0"},
            },
        }) + "\n").encode()

        await asyncio.to_thread(self._process.stdin.write, init_request)
        await asyncio.to_thread(self._process.stdin.flush)

        try:
            result = await asyncio.wait_for(future, timeout=10.0)
            log.info("MCP initialize OK: %s", result)
        except asyncio.TimeoutError:
            raise RuntimeError("Coral MCP initialize timed out — is coral running correctly?")

        # Step 2: send the initialized notification (no response expected)
        notification = (json.dumps({
            "jsonrpc": "2.0",
            "method": "notifications/initialized",
            "params": {},
        }) + "\n").encode()

        await asyncio.to_thread(self._process.stdin.write, notification)
        await asyncio.to_thread(self._process.stdin.flush)
        log.info("MCP handshake complete")

        # Step 3: discover available tools so we know the correct tool name
        await self._discover_tools()

    async def _discover_tools(self):
        """Call tools/list to log available MCP tools (helps debug tool name issues)."""
        self._request_id += 1
        req_id = self._request_id
        future: asyncio.Future = self._loop.create_future()
        self._pending[req_id] = future

        list_request = (json.dumps({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "tools/list",
            "params": {},
        }) + "\n").encode()

        await asyncio.to_thread(self._process.stdin.write, list_request)
        await asyncio.to_thread(self._process.stdin.flush)

        try:
            result = await asyncio.wait_for(future, timeout=10.0)
            tools = [t["name"] for t in (result.get("tools") or [])]
            log.info("Coral MCP tools available: %s", tools)
            # Give the server a moment to fully initialize after handshake
            await asyncio.sleep(0.5)
        except asyncio.TimeoutError:
            log.warning("tools/list timed out — continuing anyway")

    async def stop(self):
        if self._process:
            self._process.terminate()
            try:
                # Use to_thread to avoid blocking the Uvicorn event loop during shutdown
                await asyncio.to_thread(self._process.wait, 5)
            except (subprocess.TimeoutExpired, TimeoutError):
                self._process.kill()
                
            # Clean up file descriptors
            for pipe in (self._process.stdin, self._process.stdout, self._process.stderr):
                if pipe:
                    try:
                        pipe.close()
                    except Exception:
                        pass
            
            self._process = None
            log.info("Coral MCP server stopped")

    async def refresh_source(self, source_name: str):
        """Remove and re-add a Coral source so it picks up updated env vars (tokens).
        
        Coral persists source credentials at `source add` time and does NOT
        re-read environment variables on MCP server restart. This method
        forces a credential refresh by removing and re-adding the source.
        """
        coral_path = str(Path(CORAL_BIN))
        try:
            # Remove the source
            result = await asyncio.to_thread(
                subprocess.run,
                [coral_path, "source", "remove", source_name],
                capture_output=True, text=True, timeout=10,
            )
            log.info("Coral source remove %s: rc=%s", source_name, result.returncode)
            
            # Re-add the source (reads token from current os.environ)
            result = await asyncio.to_thread(
                subprocess.run,
                [coral_path, "source", "add", source_name],
                capture_output=True, text=True, timeout=15,
            )
            if result.returncode == 0:
                log.info("Coral source re-added: %s", source_name)
            else:
                log.error("Coral source add %s failed: %s", source_name, result.stderr[:200])
        except Exception as e:
            log.error("Failed to refresh Coral source %s: %s", source_name, e)

    def _read_loop(self):
        """Read JSON-RPC responses from Coral stdout in a background thread."""
        assert self._process and self._loop
        while True:
            line = self._process.stdout.readline()
            if not line:
                break
            try:
                response = json.loads(line.decode().strip())
                req_id = response.get("id")
                # Notifications (no id) are informational — skip them
                if req_id is None:
                    log.debug("MCP notification: %s", response.get("method"))
                    continue
                future = self._pending.pop(req_id, None)
                if future:
                    if "error" in response:
                        self._loop.call_soon_threadsafe(
                            future.set_exception,
                            RuntimeError(response["error"]["message"])
                        )
                    else:
                        self._loop.call_soon_threadsafe(
                            future.set_result,
                            response.get("result")
                        )
            except (json.JSONDecodeError, KeyError) as e:
                log.warning("Coral read_loop parse error: %s", e)
                continue

    async def query(self, sql: str) -> Any:
        """Execute a Coral SQL query via MCP JSON-RPC and return result rows."""
        if not self._process:
            raise RuntimeError("CoralService not started")

        self._request_id += 1
        req_id = self._request_id
        future: asyncio.Future = self._loop.create_future()
        self._pending[req_id] = future

        # Coral's MCP tool is named "sql" (not "coral_query")
        request = (json.dumps({
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "tools/call",
            "params": {"name": "sql", "arguments": {"sql": sql}}
        }) + "\n").encode()

        try:
            await asyncio.to_thread(self._process.stdin.write, request)
            await asyncio.to_thread(self._process.stdin.flush)
        except Exception as e:
            self._pending.pop(req_id, None)
            log.error("Failed to write query to Coral stdin: %s", e)
            raise RuntimeError(f"Failed to write query to Coral: {e}")

        try:
            raw = await asyncio.wait_for(future, timeout=30.0)
        except asyncio.TimeoutError:
            self._pending.pop(req_id, None)
            log.error("Coral query timed out: %s", sql[:80])
            raise RuntimeError(f"Coral query timed out: {sql[:80]}")

        return self._parse_result(raw)

    @staticmethod
    def _parse_result(raw: Any) -> Any:
        """
        Coral's MCP tool returns:
          {"content": [{"type": "text", "text": "<json string>"}], "isError": false}

        Parse the text payload into a Python object (list of row dicts).
        If parsing fails or if the result is an error message, handle appropriately.
        """
        if not isinstance(raw, dict):
            return raw

        # Check if this is an error response
        if raw.get("isError"):
            content = raw.get("content", [])
            if isinstance(content, list) and content:
                error_text = content[0].get("text", "Unknown error")
                raise RuntimeError(f"Coral query error: {error_text}")

        # Unwrap content array
        content = raw.get("content")
        if isinstance(content, list) and content:
            text = content[0].get("text", "")
            # Check if the text itself is an error message
            if text.startswith("Error:"):
                raise RuntimeError(text)
            try:
                parsed = json.loads(text)
                # Coral returns {"rows": [...]} — unwrap to just the rows array
                if isinstance(parsed, dict) and "rows" in parsed:
                    return parsed["rows"]
                return parsed
            except (json.JSONDecodeError, TypeError):
                # If it's not JSON, check if it's an error message
                if "Error:" in text or "not found" in text:
                    raise RuntimeError(text)
                return text

        # Fallback: return whatever we got
        return raw

    async def get_schema(self) -> Any:
        """Return all queryable tables across all installed sources."""
        return await self.query("SELECT schema_name, table_name FROM coral.tables ORDER BY 1, 2")

    async def get_table_functions(self) -> Any:
        """Return all table functions (Slack messages, Linear issues, etc.)."""
        return await self.query(
            "SELECT schema_name, function_name FROM coral.table_functions ORDER BY 1, 2"
        )

    async def get_sources(self) -> Any:
        """Return installed source connection info from coral.sources table."""
        try:
            # Try the coral.sources table first (if it exists in newer Coral versions)
            result = await self.query("SELECT * FROM coral.sources")
            log.info("get_sources returned: %s", result)
            return result
        except RuntimeError as e:
            # Fallback: derive sources from available schemas
            log.info("coral.sources table not found (expected), deriving from schemas")
            schemas = await self.query("SELECT DISTINCT schema_name FROM coral.tables ORDER BY schema_name")
            return [{"schema_name": row["schema_name"], "status": "CONNECTED"} for row in schemas]

    async def health_check(self) -> dict[str, str]:
        """
        Probe each source by running a lightweight catalog query.
        Returns {source_name: 'CONNECTED' | 'ERROR', ...}
        """
        sources = ["github", "linear", "slack", "sentry"]
        results: dict[str, str] = {}

        async def probe(source: str):
            try:
                result = await self.query(
                    f"SELECT schema_name FROM coral.tables WHERE schema_name = '{source}' LIMIT 1"
                )
                # Check if we got any results back
                if isinstance(result, list) and len(result) > 0:
                    results[source] = "CONNECTED"
                    log.info("Coral source healthy: %s", source)
                else:
                    results[source] = "ERROR"
                    log.warning("Coral source unhealthy [%s]: no tables found", source)
            except Exception as e:
                results[source] = "ERROR"
                log.warning("Coral source unhealthy [%s]: %s", source, str(e))

        await asyncio.gather(*[probe(s) for s in sources], return_exceptions=True)
        return results


coral = CoralService()
