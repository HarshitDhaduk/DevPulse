import asyncio
import json
from typing import AsyncGenerator

from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import JsonOutputParser, StrOutputParser
from langchain_core.runnables import RunnableLambda
from langchain.memory import ConversationBufferWindowMemory

from services.coral_service import coral
from config import settings
from logger import get_logger

log = get_logger("devpulse.agent")

llm = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=settings.GOOGLE_API_KEY,
    temperature=0.2,
    streaming=True,
)

llm_json = ChatGoogleGenerativeAI(
    model="gemini-2.5-flash",
    google_api_key=settings.GOOGLE_API_KEY,
    temperature=0,
    generation_config={"response_mime_type": "application/json"},
)

SYSTEM_PROMPT = """You are DevPulse, an AI engineering health intelligence agent.
Analyze data from GitHub, Linear, Slack, and Sentry to give engineering leads
clear, actionable insights. Be concise, specific, and data-driven.
Format responses in clean markdown with headers."""

SQL_PLAN_SYSTEM = """You are a SQL planner for the Coral data layer.
Given a user question, output ONLY a valid JSON array of Coral SQL queries.

Available tables (verified connected):
- github.pulls (title, state, user_login, created_at, html_url, draft, merged_at)
- github.commits (sha, commit_message, author_name, committed_date)
- github.issues (title, state, user_login, created_at, labels)
- github.repos (name, full_name, description, stargazers_count)
- linear.issues (title, state, assignee_name, priority, estimate, cycle_is_active, team_name)
- linear.cycles (name, starts_at, ends_at, team_name)
- linear.teams (name, key)
- linear.users (name, email, display_name)
- sentry.issues (title, culprit, times_seen, first_seen, last_seen, level, status)
- sentry.events (event_id, title, timestamp, level)
- slack.channels (name, num_members, topic)
- slack.users (name, real_name, display_name)

Output format (JSON array only, no markdown):
[{{{{"label": "short description", "sql": "SELECT ..."}}}}]"""

sql_plan_prompt = ChatPromptTemplate.from_messages([
    ("system", SQL_PLAN_SYSTEM),
    ("human", "Question: {question}"),
])

synthesis_prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    ("human", "{input}"),
])

chat_prompt = ChatPromptTemplate.from_messages([
    ("system", SYSTEM_PROMPT),
    MessagesPlaceholder(variable_name="history"),
    ("human", "Question: {question}\n\nData from Coral:\n{coral_data}"),
])

sql_plan_chain = sql_plan_prompt | llm_json | JsonOutputParser()
synthesis_chain = synthesis_prompt | llm | StrOutputParser()

_memories: dict[str, ConversationBufferWindowMemory] = {}

def get_workflow_queries(workflow: str) -> list[dict]:
    owner = "wemakedev"
    
    standup = [
        {
            "label": "sprint_health",
            "sql": (
                "SELECT title AS issue_title, state_id AS state, assignee_name AS assignee, priority_label AS priority "
                "FROM linear.issues "
                "ORDER BY priority ASC LIMIT 20"
            ),
        },
        {
            "label": "error_trends",
            "sql": (
                "SELECT title, count AS error_count, first_seen "
                "FROM sentry.issues "
                "WHERE level IN ('error', 'fatal') "
                "ORDER BY count DESC LIMIT 10"
            ),
        },
        {
            "label": "pr_status",
            "sql": (
                f"SELECT title AS pr_title, state AS pr_status, user__login AS author, created_at, html_url AS pr_url "
                f"FROM github.pulls "
                f"WHERE owner = '{owner}' AND repo = 'DevPulse' AND state = 'open' AND draft = false "
                f"ORDER BY created_at ASC LIMIT 10"
            ),
        }
    ]

    retro = [
        {
            "label": "sprint_health",
            "sql": (
                "SELECT title AS issue_title, state_id AS state, assignee_name AS assignee, priority_label AS priority "
                "FROM linear.issues "
                "WHERE state_id = 'done' "
                "ORDER BY priority ASC LIMIT 50"
            ),
        },
        {
            "label": "pr_status",
            "sql": (
                f"SELECT title AS pr_title, state AS pr_status, user__login AS author, created_at, html_url AS pr_url "
                f"FROM github.pulls "
                f"WHERE owner = '{owner}' AND repo = 'DevPulse' AND state = 'closed' "
                f"ORDER BY created_at DESC LIMIT 30"
            ),
        },
        {
            "label": "error_trends",
            "sql": (
                "SELECT title, count AS error_count, first_seen "
                "FROM sentry.issues "
                "WHERE level IN ('error', 'fatal') "
                "ORDER BY count DESC LIMIT 20"
            ),
        }
    ]

    stability = [
        {
            "label": "error_trends",
            "sql": (
                "SELECT title, count AS error_count, first_seen "
                "FROM sentry.issues "
                "WHERE level = 'fatal' "
                "ORDER BY count DESC LIMIT 20"
            ),
        },
        {
            "label": "pr_status",
            "sql": (
                f"SELECT title AS pr_title, state AS pr_status, user__login AS author, created_at, html_url AS pr_url "
                f"FROM github.pulls "
                f"WHERE owner = '{owner}' AND repo = 'DevPulse' "
                f"ORDER BY created_at DESC LIMIT 10"
            ),
        },
        {
            "label": "slack_activity",
            "sql": (
                "SELECT name, num_members, topic "
                "FROM slack.channels "
                "ORDER BY num_members DESC LIMIT 10"
            ),
        }
    ]
    
    workflows = {"standup": standup, "retro": retro, "stability": stability}
    return workflows.get(workflow, standup)


async def init_schema():
    """Discover actual Coral schema and rebuild prompts."""
    global sql_plan_chain
    try:
        columns = await coral.query(
            "SELECT schema_name, table_name, column_name "
            "FROM coral.columns ORDER BY schema_name, table_name, column_name"
        )
        tables: dict[str, list[str]] = {}
        for row in columns:
            key = f"{row['schema_name']}.{row['table_name']}"
            tables.setdefault(key, []).append(row['column_name'])
        
        lines = []
        for table, cols in sorted(tables.items()):
            lines.append(f"- {table} ({', '.join(cols)})")
        coral_schema = "\n".join(lines)
        
        new_system = f"""You are a SQL planner for the Coral data layer.
Given a user question, output ONLY a valid JSON array of Coral SQL queries.

Available tables and columns:
{coral_schema}

Output format (JSON array only, no markdown):
[{{{{"label": "short description", "sql": "SELECT ..."}}}}]"""
        
        new_prompt = ChatPromptTemplate.from_messages([
            ("system", new_system),
            ("human", "Question: {question}"),
        ])
        
        sql_plan_chain = new_prompt | llm_json | JsonOutputParser()
        log.info("Schema discovery OK: %d tables", len(tables))
    except Exception as e:
        log.warning("Schema discovery failed, using defaults: %s", e)


async def _execute_coral_queries(queries: list[dict]) -> dict:
    async def run_one(q: dict):
        try:
            result = await coral.query(q["sql"])
            log.info("Coral query OK: %s", q["label"])
            return q["label"], result
        except Exception as e:
            log.error("Coral query failed [%s]: %s", q["label"], e)
            return q["label"], []

    results = await asyncio.gather(*[run_one(q) for q in queries])
    return dict(results)


async def generate_report(workflow: str = "standup") -> dict:
    queries = get_workflow_queries(workflow)
    raw_data = await _execute_coral_queries(queries)

    if workflow == "standup":
        system_instructions = "Act as a Scrum Master. Review this data and generate a quick standup agenda. Highlight who is blocked, which PRs need immediate review, and if any new production errors need to be assigned today. Produce: 1) Executive Summary 2) Blockers 3) PRs to Review 4) Urgent Errors."
    elif workflow == "retro":
        system_instructions = "Act as an Agile Coach. Analyze the completed work versus quality escapes. Point out where the team succeeded, identify any bottlenecks (e.g., slow PR reviews), and suggest one process improvement. Produce: 1) Executive Summary 2) Velocity 3) Bottlenecks 4) Quality Issues."
    else:
        system_instructions = "Act as an SRE. Correlate the recent code changes (PRs) with the fatal production errors. Summarize the current blast radius and recommend immediate rollback or investigation steps. Produce: 1) Incident Summary 2) Suspect PRs 3) Action Plan."

    prompt = f"""{system_instructions}

## Sprint Data
{json.dumps(raw_data.get('sprint_health'), indent=2)}

## Error Data
{json.dumps(raw_data.get('error_trends'), indent=2)}

## PR Data
{json.dumps(raw_data.get('pr_status'), indent=2)}

## Slack Data
{json.dumps(raw_data.get('slack_activity'), indent=2)}"""

    report_text = await synthesis_chain.ainvoke({"input": prompt})
    return {
        "report": report_text,
        "raw_data": raw_data,
        "generated_at": __import__("datetime").datetime.utcnow().isoformat(),
        "workflow": workflow
    }


def _get_memory(session_id: str) -> ConversationBufferWindowMemory:
    if session_id not in _memories:
        _memories[session_id] = ConversationBufferWindowMemory(
            k=10, return_messages=True, memory_key="history"
        )
    return _memories[session_id]


async def stream_chat_response(question: str, session_id: str) -> AsyncGenerator[dict, None]:
    queries = await sql_plan_chain.ainvoke({"question": question})
    yield {"event": "queries", "data": [q["sql"] for q in queries]}

    yield {"event": "status", "data": "Executing Coral queries..."}
    coral_data = await _execute_coral_queries(queries)

    memory = _get_memory(session_id)
    history = memory.load_memory_variables({})["history"]
    chain = chat_prompt | llm | StrOutputParser()
    full_response = ""

    async for chunk in chain.astream({
        "question": question,
        "coral_data": json.dumps(coral_data, indent=2),
        "history": history,
    }):
        full_response += chunk
        yield {"event": "token", "data": chunk}

    memory.save_context({"input": question}, {"output": full_response})
    yield {"event": "done", "data": ""}


async def get_source_status(source_name: str) -> str:
    import db.database as database
    conn = database.db
    if conn is None:
        return "UNKNOWN"
    try:
        async with conn.execute(
            "SELECT status FROM coral_sources WHERE source_name = ?", (source_name,)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return row["status"]
    except Exception as e:
        log.warning("Failed to query coral_sources status: %s", e)
    return "UNKNOWN"


async def run_workflow_template(template: dict, payload: dict) -> dict:
    resolved_vars = {}
    variables = payload.get("variables", {})
    custom_queries = payload.get("custom_queries", template.get("queries", []))
    
    # Ensure template-defined queries always take precedence over frontend cache
    # (the frontend caches queries in state and may send stale SQL or optional flags)
    template_queries = {q["id"]: q for q in template.get("queries", [])}
    for q in custom_queries:
        tq = template_queries.get(q["id"])
        if tq:
            q["optional"] = tq.get("optional", q.get("optional", False))
            q["sql"] = tq.get("sql", q.get("sql", ""))
    
    # 1. Resolve variables with defaults
    for var in template.get("variables", []):
        name = var["name"]
        val = variables.get(name) or var.get("default")
        resolved_vars[name] = val

    # 2. Dynamic Source Discovery Fallbacks
    passed_owner = variables.get("owner")
    passed_repo = variables.get("repo")
    
    if not passed_owner or not passed_repo:
        if (resolved_vars.get("owner") == "wemakedev" and resolved_vars.get("repo") == "DevPulse") or not passed_owner or not passed_repo:
            # Or query Coral
            try:
                repos = await coral.query("SELECT name, full_name FROM github.user_repos LIMIT 1")
                if repos:
                    if not passed_repo:
                        resolved_vars["repo"] = repos[0]["name"]
                    if not passed_owner and "/" in repos[0]["full_name"]:
                        resolved_vars["owner"] = repos[0]["full_name"].split("/")[0]
            except Exception:
                pass # ignore and fallback to defaults

    if "slack_channel" in resolved_vars and not variables.get("slack_channel"):
        # Check if we can dynamically discover an active incident/ops channel
        try:
            discovered = await coral.query(
                "SELECT name FROM slack.channels "
                "WHERE name ILIKE '%incident%' OR name ILIKE '%ops%' OR name ILIKE '%eng%' "
                "ORDER BY num_members DESC LIMIT 1"
            )
            if discovered:
                resolved_vars["slack_channel"] = discovered[0]["name"]
        except Exception:
            pass


    # 2.5 Validation of variables based on active source health and authorized credentials
    github_status = await get_source_status("github")
    slack_status = await get_source_status("slack")
    linear_status = await get_source_status("linear")

    # A. Validate GitHub parameters if required by this template (hasowner or repo)
    owner = resolved_vars.get("owner")
    repo = resolved_vars.get("repo")
    if owner or repo:
        if github_status != "CONNECTED":
            raise ValueError(
                f"GitHub integration is currently inactive (status: {github_status}). "
                "Please go to the Settings tab, connect a valid GitHub Token, and try again."
            )
        try:
            repos = await coral.query("SELECT name, full_name FROM github.user_repos LIMIT 50")
            if repos:
                valid_repos = [r["full_name"] for r in repos]
                target = f"{owner}/{repo}" if owner and repo else (repo or "")
                
                match_found = False
                for r in repos:
                    if r["full_name"].lower() == target.lower() or r["name"].lower() == repo.lower():
                        resolved_vars["repo"] = r["name"]
                        resolved_vars["owner"] = r["full_name"].split("/")[0]
                        match_found = True
                        break
                
                if not match_found:
                    suggestions = ", ".join(valid_repos[:5])
                    if len(valid_repos) > 5:
                        suggestions += f" and {len(valid_repos) - 5} more"
                    raise ValueError(
                        f"GitHub repository '{target}' is not authorized by your current credentials. "
                        f"Please select from your accessible repositories: {suggestions}."
                    )
            else:
                raise ValueError(
                    "No GitHub repositories could be retrieved using your GITHUB_TOKEN. "
                    "Please verify your credentials in Settings."
                )
        except ValueError as ve:
            raise ve
        except Exception as e:
            log.warning("Validation of github.repos query failed: %s", e)

    # B. Validate Slack parameters
    slack_channel = resolved_vars.get("slack_channel")
    if slack_channel:
        if slack_status != "CONNECTED":
            raise ValueError(
                f"Slack integration is currently inactive (status: {slack_status}). "
                "Please go to the Settings tab, connect a valid Slack Token, and try again."
            )
        try:
            channels = await coral.query("SELECT id, name FROM slack.channels LIMIT 50")
            if channels:
                valid_channels = [c["name"] for c in channels]
                match_found = False
                for c in channels:
                    if c["name"].lower() == slack_channel.lower():
                        resolved_vars["slack_channel"] = c["name"]
                        resolved_vars["slack_channel_id"] = c["id"]
                        match_found = True
                        break
                
                if not match_found:
                    suggestions = ", ".join([f"#{ch}" for ch in valid_channels[:5]])
                    if len(valid_channels) > 5:
                        suggestions += f" and {len(valid_channels) - 5} more"
                    raise ValueError(
                        f"Slack channel '#{slack_channel}' does not exist or is not authorized. "
                        f"Please select from your active Slack channels: {suggestions}."
                    )
            else:
                raise ValueError(
                    "No Slack channels could be retrieved using your SLACK_TOKEN. "
                    "Please verify your credentials in Settings."
                )
        except ValueError as ve:
            raise ve
        except Exception as e:
            log.warning("Validation of slack.channels query failed: %s", e)

    # C. Validate Linear parameters
    team_name = resolved_vars.get("team_name")
    team_key = resolved_vars.get("team_key")
    if team_name or team_key:
        if linear_status != "CONNECTED":
            raise ValueError(
                f"Linear integration is currently inactive (status: {linear_status}). "
                "Please go to the Settings tab, connect a valid Linear API Key, and try again."
            )
        try:
            teams = await coral.query("SELECT key, name FROM linear.teams LIMIT 50")
            if teams:
                valid_teams = [f"{t['name']} ({t['key']})" for t in teams]
                match_found = False
                for t in teams:
                    if (team_name and t["name"].lower() == team_name.lower()) or \
                       (team_key and t["key"].lower() == team_key.lower()) or \
                       (team_name and t["key"].lower() == team_name.lower()):
                        resolved_vars["team_name"] = t["name"]
                        resolved_vars["team_key"] = t["key"]
                        match_found = True
                        break
                
                if not match_found:
                    suggestions = ", ".join(valid_teams[:5])
                    if len(valid_teams) > 5:
                        suggestions += f" and {len(valid_teams) - 5} more"
                    target = team_name or team_key
                    raise ValueError(
                        f"Linear team '{target}' was not found in your Linear account. "
                        f"Available teams: {suggestions}."
                    )
            else:
                raise ValueError(
                    "No Linear teams could be retrieved using your LINEAR_API_KEY. "
                    "Please verify your credentials in Settings."
                )
        except ValueError as ve:
            raise ve
        except Exception as e:
            log.warning("Validation of linear.teams query failed: %s", e)

    # 3. Concurrent SQL execution pool
    raw_data = {}
    
    async def run_one_query(q: dict):
        q_id = q["id"]
        sql_template = q["sql"]
        try:
            # Substitute resolved variables
            sql = sql_template.format(**resolved_vars)
            rows = await coral.query(sql)
            raw_data[q_id] = rows
        except Exception as e:
            log.error(f"Dynamic workflow query failed [{q_id}]: {e}")
            if q.get("optional", False):
                raw_data[q_id] = []
            else:
                raise e

    # Execute all queries concurrently
    await asyncio.gather(*[run_one_query(q) for q in custom_queries])

    # 3.5 Post-process Slack mentions in raw_data
    import re
    
    mentioned_users = set()
    for rows in raw_data.values():
        for row in rows:
            for val in row.values():
                if isinstance(val, str):
                    matches = re.findall(r'<@([A-Z0-9]+)>', val)
                    mentioned_users.update(matches)
    
    if mentioned_users:
        try:
            users = await coral.query("SELECT id, real_name, name FROM slack.users LIMIT 1000")
            user_map = {u["id"]: u["real_name"] or u["name"] for u in users if "id" in u}
        except Exception as e:
            log.warning("Failed to resolve slack mentions: %s", e)
            user_map = {}
    else:
        user_map = {}

    for rows in raw_data.values():
        for row in rows:
            for key, val in row.items():
                if isinstance(val, str):
                    def replacer(match):
                        uid = match.group(1)
                        name = user_map.get(uid, uid)
                        return f"@{name}"
                    new_val = re.sub(r'<@([A-Z0-9]+)>', replacer, val)
                    new_val = new_val.replace("<!channel>", "@channel")
                    new_val = new_val.replace("<!here>", "@here")
                    new_val = new_val.replace("<!everyone>", "@everyone")
                    row[key] = new_val

    # 4. AI Synthesis
    ai = template.get("ai_persona", {})
    if ai:
        system_instructions = ai.get("system_prompt", "")
        synthesis_instructions = ai.get("synthesis_prompt", "")
        required = ", ".join(ai.get("required_sections", []))
        
        prompt = f"""{system_instructions}
        
Instructions: {synthesis_instructions}
Your output must contain sections for: {required}.

Here is the retrieved dataset for analysis:
{json.dumps(raw_data, indent=2)}
"""
        try:
            report_text = await synthesis_chain.ainvoke({"input": prompt})
        except Exception as e:
            log.error("AI Synthesis failed: %s", e)
            error_msg = str(e)
            if "429" in error_msg or "quota" in error_msg.lower() or "limit" in error_msg.lower():
                report_text = (
                    "### ⚠️ AI Synthesis Rate Limited\n\n"
                    "The **Gemini AI service** is currently experiencing high demand or has reached its rate limits.\n\n"
                    "*   **Status**: All telemetry from GitHub, Linear, Slack, and Sentry was successfully retrieved on the left panel!\n"
                    "*   **Action**: Click the **⚡ Run Analysis** button again in a few seconds to retry generating the AI report."
                )
            else:
                report_text = (
                    "### ⚠️ AI Synthesis Temporarily Unavailable\n\n"
                    "We encountered an issue while generating the AI summary briefing.\n\n"
                    "*   **Status**: All integration telemetry was successfully retrieved on the left-side widgets.\n"
                    "*   **Resolution**: Please check your integration credentials in settings and click **Run Analysis** to try again."
                )
    else:
        report_text = "No AI persona defined for this template."

    import datetime
    return {
        "raw_data": raw_data,
        "synthesis": report_text,
        "ui_layout": template.get("ui_layout", {}),
        "variables": resolved_vars,
        "generated_at": datetime.datetime.utcnow().isoformat()
    }

