# DevPulse
**Interactive AI-driven Workspaces on top of Coral Federated SQL**

DevPulse provides real-time engineering diagnostics, agile processes, and SRE post-mortems. It aggregates telemetry across GitHub, Linear, Slack, and Sentry in parallel using **Coral**, executing federated SQL queries, and utilizing AI to provide strategic alignment.

## System Architecture

```text
+-------------------+       +-----------------------+       +-------------------+
|                   |       |                       |       |                   |
|  DevPulse React   |<----->|  FastAPI Backend      |<----->|  Gemini AI        |
|  Frontend (Next)  |       |  (Python, Uvicorn)    |       |  (Synthesis)      |
|                   |       |                       |       |                   |
+-------------------+       +-----------+-----------+       +-------------------+
                                        | (MCP over stdio)
                                        v
                            +-----------------------+
                            |                       |
                            |  Coral MCP Binary     |
                            |  (Federated Engine)   |
                            |                       |
                            +---+-------+-------+---+
                                |       |       |
                 +--------------+       |       +---------------+
                 |                      |                       |
                 v                      v                       v
          +------------+         +------------+          +------------+
          |            |         |            |          |            |
          |   GitHub   |         |   Linear   |          |   Slack/   |
          |   (REST)   |         |  (GraphQL) |          |   Sentry   |
          +------------+         +------------+          +------------+
```

## Data Flow Diagram

```text
1. User connects integrations (OAuth/Tokens) via UI -> Saved in SQLite (encrypted).
2. User opens a Workspace (e.g. Sprint Retro).
3. Backend fetches user's tokens & injects them into Coral's environment.
4. UI reads the Workspace JSON template, executing parallel SQL queries via Coral MCP.
5. Coral queries GitHub, Linear, etc., treating APIs as a single SQL database.
6. Coral returns formatted tabular row data to the backend.
7. Backend feeds results to Gemini AI alongside the workspace's synthesis prompt.
8. Frontend renders data in Recharts/Widgets AND displays AI analysis.
```

## Getting Started

1. **Install Dependencies**
   - Frontend: `cd frontend && npm install`
   - Backend: `cd backend && pip install -r requirements.txt`

2. **Run Locally**
   - Run the frontend: `npm run dev`
   - Run the backend: `fastapi run main.py --port 8080`

3. **Deploy**
   - Cloud Run (Backend): `gcloud run deploy`
   - Frontend: Deploy to Vercel/Netlify.
