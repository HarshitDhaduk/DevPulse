# DevPulse Backend

This is the backend service for DevPulse, an interactive workspace for engineering teams. 
It aggregates telemetry across GitHub, Linear, Slack, and Sentry using a federated SQL engine (Coral) to deliver real-time diagnostics, agile processes, and SRE post-mortems.

## Tech Stack
- **Framework:** FastAPI (Python)
- **Database:** SQLite (for app state) & Coral MCP (for federated SQL queries)
- **Authentication:** Google OAuth & JWT
- **AI Integration:** Google Gemini AI

## Getting Started

1. Set up a Python virtual environment:
   ```bash
   python -m venv .venv
   .venv\Scripts\activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the development server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
