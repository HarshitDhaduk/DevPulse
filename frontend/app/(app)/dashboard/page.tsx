"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { SourceStatusBar } from "@/components/dashboard/SourceStatusBar";

type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  version: string;
  variables: any[];
  queries: any[];
};

const STARTER_TEMPLATE = {
  "id": "custom-sql-triage",
  "name": "Custom SQL Triage",
  "description": "Custom query operational telemetry center mapping linear tasks and code contributions.",
  "icon": "🚀",
  "category": "Operations",
  "version": "1.0.0",
  "variables": [
    { "name": "owner", "type": "string", "default": "wemakedev", "description": "GitHub Owner" },
    { "name": "repo", "type": "string", "default": "DevPulse", "description": "GitHub Repository" }
  ],
  "queries": [
    {
      "id": "recent_commits",
      "label": "Latest Commits",
      "sql": "SELECT sha, commit_message AS message, author_name AS author FROM github.commits LIMIT 5",
      "optional": true
    }
  ],
  "ai_persona": {
    "name": "Strategic Architect",
    "system_prompt": "You are a strategic AI delivery advisor. Analyze contribution activity and formulate recommendations.",
    "synthesis_prompt": "Review recent code commits. Report on code progression metrics.",
    "temperature": 0.3,
    "required_sections": ["Highlights", "Strategic Action Items"]
  },
  "ui_layout": {
    "type": "grid",
    "columns": 12,
    "widgets": [
      {
        "id": "summary",
        "title": "AI Strategic Briefing",
        "type": "markdown",
        "data_source": "ai_synthesis",
        "layout": { "col_span": 12, "order": 1 }
      },
      {
        "id": "commits_table",
        "title": "Recent Commits Log",
        "type": "table",
        "data_source": "recent_commits",
        "layout": { "col_span": 12, "order": 2 },
        "config": {
          "columns": [
            { "key": "sha", "header": "Commit", "type": "text" },
            { "key": "message", "header": "Message", "type": "text" },
            { "key": "author", "header": "Developer", "type": "text" }
          ]
        }
      }
    ]
  }
};

export default function DashboardHubPage() {
  const [workflows, setWorkflows] = useState<WorkflowTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [jsonInput, setJsonInput] = useState(JSON.stringify(STARTER_TEMPLATE, null, 2));
  const [modalError, setModalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadWorkflows() {
      try {
        const data = await api.get("/api/workflows");
        setWorkflows(data);
      } catch (err: any) {
        setError(err.message || "Failed to load workflows.");
      } finally {
        setLoading(false);
      }
    }
    loadWorkflows();
  }, []);

  const handleCreateWorkflow = async () => {
    setModalError(null);
    setSaving(true);
    try {
      let parsed;
      try {
        parsed = JSON.parse(jsonInput);
      } catch (e: any) {
        throw new Error(`Invalid JSON syntax: ${e.message}`);
      }

      await api.post("/api/workflows", parsed);
      
      // Reload workflows
      const data = await api.get("/api/workflows");
      setWorkflows(data);
      
      // Success! Close modal
      setShowCreateModal(false);
      setJsonInput(JSON.stringify(STARTER_TEMPLATE, null, 2));
    } catch (err: any) {
      setModalError(err.message || "Failed to create workflow.");
    } finally {
      setSaving(false);
    }
  };

  const categories = ["Operations", "Management", "Diagnostics", "Quality Assurance"];

  return (
    <div className="p-6 space-y-8 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-bg2 via-bg3 to-teal/5 border border-border p-8 md:p-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="max-w-2xl space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold font-mono tracking-wider uppercase bg-teal/10 text-teal border border-teal/20">
              DevPulse V2 Hub
            </div>
            <h1 className="text-3xl md:text-4xl font-bold font-display text-text">
              Interactive Workspaces
            </h1>
            <p className="text-text2 text-sm leading-relaxed">
              Run real-time engineering diagnostics, agile processes, and SRE post-mortems. 
              DevPulse aggregates telemetry across GitHub, Linear, Slack, and Sentry in parallel to deliver concrete data and AI-driven alignment.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="shrink-0 self-start md:self-center px-4 py-2.5 rounded-lg bg-coral hover:bg-coral2 text-white font-bold text-xs transition-colors shadow-lg shadow-coral/10 hover:shadow-coral/20 flex items-center gap-2 glow-coral"
          >
            <span>✨</span> Create Custom Workspace
          </button>
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-radial-gradient from-teal/10 to-transparent pointer-events-none" />
      </div>

      <SourceStatusBar />

      {error && (
        <div className="p-4 bg-coral/10 border border-coral/20 text-coral rounded-xl text-sm">
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-44 rounded-xl border border-border bg-bg2 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-10">
          {categories.map((category) => {
            const categoryWorkflows = workflows.filter((w) => w.category === category);
            if (categoryWorkflows.length === 0) return null;

            return (
              <div key={category} className="space-y-4">
                <div className="flex items-center gap-2 border-b border-border pb-2">
                  <h2 className="text-lg font-bold font-display text-text">{category}</h2>
                  <span className="text-xs px-2 py-0.5 rounded bg-bg3 text-text3 font-semibold font-mono">
                    {categoryWorkflows.length}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categoryWorkflows.map((wf) => (
                    <Link
                      key={wf.id}
                      href={`/dashboard/workspace/${wf.id}`}
                      className="group flex flex-col justify-between p-6 rounded-xl border border-border2 bg-bg2 hover:border-teal/50 hover:bg-teal/[0.02] shadow-sm hover:shadow-md transition-all duration-200 text-left"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-bg3 border border-border group-hover:bg-teal/10 group-hover:border-teal/30 transition-all text-2xl">
                            {wf.icon}
                          </div>
                          <span className="text-[10px] font-semibold font-mono text-text3 bg-bg3 border border-border px-2 py-0.5 rounded">
                            v{wf.version}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <h3 className="font-semibold text-text group-hover:text-teal transition-colors font-display text-base">
                            {wf.name}
                          </h3>
                          <p className="text-text2 text-xs line-clamp-2 leading-relaxed">
                            {wf.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-border/50 pt-4 mt-6 text-[11px] font-mono text-text3">
                        <span>{wf.queries.length} SQL queries</span>
                        <span className="flex items-center gap-1 text-teal group-hover:translate-x-1 transition-transform">
                          Open Workspace &rarr;
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Custom Workspace Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-4xl h-[85vh] rounded-2xl border border-border bg-bg2 flex flex-col overflow-hidden shadow-2xl animate-scaleIn">
            {/* Modal Header */}
            <div className="shrink-0 border-b border-border bg-bg3 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">✨</span>
                <div>
                  <h3 className="text-base font-bold font-display text-text">Create Custom Workspace</h3>
                  <p className="text-[10px] text-text3 font-mono mt-0.5">Deploy JSON Template Configuration</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setModalError(null);
                }}
                className="text-xs text-text3 hover:text-text font-mono"
              >
                Close &times;
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* Left Side: Instructions and Guide */}
              <div className="w-80 shrink-0 border-r border-border bg-bg3/30 p-6 space-y-4 overflow-y-auto text-xs leading-relaxed text-text2">
                <h4 className="font-bold text-text font-mono uppercase tracking-wider text-[10px] text-teal">Workspace Spec Guide</h4>
                <p>
                  DevPulse workspaces are defined using standard JSON templates. Customize variables, Coral federated SQL queries, and widget layouts.
                </p>
                <div className="space-y-3 font-mono text-[10px] text-text3 bg-bg3/60 border border-border p-3.5 rounded-lg">
                  <div className="text-text"><strong className="text-teal">id</strong>: Unique URL identifier</div>
                  <div className="text-text"><strong className="text-teal">icon</strong>: Emoji representational badge</div>
                  <div className="text-text"><strong className="text-teal">category</strong>: Section grouping</div>
                  <div className="text-text"><strong className="text-teal">queries</strong>: List of SQL statements</div>
                  <div className="text-text"><strong className="text-teal">ui_layout</strong>: Recharts & grid mapping</div>
                </div>
                <div className="p-3 bg-teal/5 border border-teal/20 text-teal rounded-lg text-[11px] leading-relaxed">
                  💡 <strong>Pro Tip</strong>: You can JOIN tables from GitHub, Linear, Slack, and Sentry in a single SQL query!
                </div>
              </div>

              {/* Right Side: Code Editor */}
              <div className="flex-1 flex flex-col p-6 space-y-4 bg-bg1 min-w-0">
                <div className="flex-1 flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold font-mono text-text3 uppercase tracking-wider">JSON Configuration Spec</label>
                  <textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    className="flex-1 rounded-xl border border-border2 bg-bg3 px-4 py-3 text-xs outline-none focus:border-teal transition-all font-mono leading-relaxed resize-none text-text"
                    spellCheck="false"
                  />
                </div>

                {modalError && (
                  <div className="p-3 bg-coral/10 border border-coral/20 text-coral rounded-lg text-xs font-mono">
                    ❌ {modalError}
                  </div>
                )}

                {/* Footer Buttons */}
                <div className="shrink-0 flex items-center justify-end gap-3 pt-2">
                  <button
                    onClick={() => {
                      setShowCreateModal(false);
                      setModalError(null);
                    }}
                    disabled={saving}
                    className="px-4 py-2 border border-border rounded-lg text-xs font-semibold hover:bg-bg3 disabled:opacity-50 transition-colors text-text2"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateWorkflow}
                    disabled={saving}
                    className="px-5 py-2 rounded-lg bg-teal hover:bg-teal2 text-white font-bold text-xs disabled:opacity-50 transition-colors"
                  >
                    {saving ? "Deploying..." : "⚡ Deploy Workspace"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
