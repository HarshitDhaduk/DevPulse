# ⚡ DevPulse

**DevPulse** is a dynamic, AI-powered Morning Standup Workspace. It seamlessly federates data from your favorite developer tools (GitHub, Linear, Slack, Sentry) using **Coral** and synthesizes it into actionable, intelligent reports using **Gemini AI**.

Say goodbye to manual standups and context switching. DevPulse acts as your personal AI Scrum Master, automatically analyzing your pull requests, active sprint issues, and production exceptions to give you a unified view of your entire engineering lifecycle.

---

## 🚀 Why DevPulse?

In modern software development, context is fragmented. Developers and engineering managers spend a significant portion of their mornings opening multiple tabs: checking GitHub for PRs, Linear for sprint issues, Sentry for overnight exceptions, and Slack for communications. 

**The Solution:**
DevPulse leverages the **Coral Federated SQL Engine** to query all these external APIs directly as if they were a single SQL database. We then pass this normalized context to **Gemini**, which acts as an AI Scrum Master to generate a comprehensive "Morning Standup" report. 

* **No Data Silos:** Write one SQL query, federate across GitHub, Linear, Slack, and Sentry.
* **Intelligent Synthesis:** Gemini AI summarizes the data, drafts Slack updates, and alerts you to rate limits or critical blockers.
* **Beautiful UX:** A state-of-the-art Next.js interface with dark mode, glowing accents, and real-time Kanbans.

---

## 🏗️ Architecture

DevPulse is built with a decoupled frontend and backend architecture, connected via REST APIs and the Coral MCP (Model Context Protocol) server.

```text
+-------------------------------------------------------------+
|                     User Browser (Next.js)                  |
|  +----------------+  +-----------------+  +--------------+  |
|  | Kanban Boards  |  | Review Queues   |  | AI Chatbot   |  |
|  +----------------+  +-----------------+  +--------------+  |
+-----------------------------+-------------------------------+
                              | HTTP / REST
                              v
+-----------------------------+-------------------------------+
|                      Backend (FastAPI)                      |
|  +----------------+  +-----------------+  +--------------+  |
|  |  Auth Router   |  | Settings Router |  | Agent Router |  |
|  +----------------+  +-----------------+  +--------------+  |
|                                                             |
|  +-------------------------------------------------------+  |
|  |                   Gemini AI Engine                    |  |
|  +-------------------------------------------------------+  |
+-----------------------------+-------------------------------+
                              | MCP (Model Context Protocol)
                              v
+-----------------------------+-------------------------------+
|                   Coral Federated Engine                    |
| (Translates SQL into REST/GraphQL calls for external APIs)  |
+-------+-------------+-------------+-------------+-----------+
        |             |             |             |
        v             v             v             v
   +--------+    +--------+    +--------+    +--------+
   | GitHub |    | Linear |    | Sentry |    | Slack  |
   +--------+    +--------+    +--------+    +--------+
```

---

## 🛠️ How it Works

1. **User Authentication & Tool Connection:** The user logs in and securely provides their personal access tokens (GitHub PAT, Linear API Key, Sentry Token, etc.) via the settings panel.
2. **Coral Source Initialization:** The FastAPI backend injects these tokens into the environment and initializes the Coral engine to create a federated database schema.
3. **Dynamic Dashboards:** The Next.js frontend requests dashboard data. The backend executes JSON-templated SQL queries against Coral (e.g., `SELECT * FROM github.issues UNION ALL SELECT * FROM linear.issues`), seamlessly merging data across platforms.
4. **AI Synthesis:** The raw JSON payloads are sent to Gemini. Using custom prompt engineering, Gemini acts as an "AI Scrum Master," generating daily standup reports, highlighting blockers, and identifying critical production errors.

---

## 📦 Tech Stack

- **Frontend:** Next.js, React, Tailwind CSS
- **Backend:** Python, FastAPI, Uvicorn, LangChain
- **Database / Federation Engine:** Coral SQL Engine
- **AI Model:** Google Gemini 

---

## 🏃‍♂️ Getting Started

### Prerequisites
- Node.js (v18+)
- Python (3.10+)
- Coral CLI installed
- A Gemini API Key

### 1. Clone the repository
```bash
git clone https://github.com/YourUsername/DevPulse.git
cd DevPulse
```

### 2. Setup the Backend
```bash
cd backend
python -m venv .venv
# Activate virtual environment (Windows: .venv\Scripts\activate, Mac/Linux: source .venv/bin/activate)
pip install -r requirements.txt
cp .env.example .env 
# Add your GEMINI_API_KEY to the .env file
uvicorn main:app --reload --port 8000
```

### 3. Setup the Frontend
```bash
cd ../frontend
npm install
npm run dev
```

### 4. Configure Sources
Open `http://localhost:3000`, navigate to the **Settings** panel, and connect your tools using their respective API tokens. Click **Run Analysis** on the dashboard to see your AI Scrum Master in action!
