"use client";
import { useState, useEffect, useRef, use, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Editor, useMonaco } from "@monaco-editor/react";
import { api } from "@/lib/api";
import { useChat } from "@/hooks/useChat";

import MetricCardsWidget from "@/components/widgets/MetricCardsWidget";
import TableWidget from "@/components/widgets/TableWidget";
import BarChartWidget from "@/components/widgets/BarChartWidget";
import PieChartWidget from "@/components/widgets/PieChartWidget";
import KanbanBoardWidget from "@/components/widgets/KanbanBoardWidget";
import StatusGridWidget from "@/components/widgets/StatusGridWidget";

type Message = { role: "user" | "agent"; content: string };

type WidgetSpec = {
  id: string;
  title: string;
  type: "markdown" | "metric_cards" | "table" | "chart_line" | "chart_bar" | "chart_pie" | "list" | "board" | "status_grid";
  data_source: string;
  layout: { col_span: number; order: number };
  config?: any;
};

type WorkflowSpec = {
  id: string;
  name: string;
  description: string;
  icon: string;
  version: string;
  variables: { name: string; type: string; default: any; description: string }[];
  queries: { id: string; label: string; sql: string; optional: boolean }[];
  ui_layout: { columns: number; widgets: WidgetSpec[] };
  ai_persona?: any;
};

function MarkdownRenderer({ text }: { text: string }) {
  if (!text) return null;

  const lines = text.split("\n");
  let inList = false;
  const renderedElements: React.ReactNode[] = [];

  const parseInline = (str: string) => {
    const parts = str.split("**");
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return <strong key={index} className="font-bold text-text">{part}</strong>;
      }
      return part;
    });
  };

  lines.forEach((line, index) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("## ")) {
      inList = false;
      renderedElements.push(
        <h2 key={index} className="text-sm font-bold text-text mt-5 mb-2 border-b border-border/30 pb-1 font-display">
          {parseInline(trimmed.substring(3))}
        </h2>
      );
    } else if (trimmed.startsWith("### ")) {
      inList = false;
      renderedElements.push(
        <h3 key={index} className="text-xs font-bold text-teal mt-4 mb-2 uppercase tracking-wider font-mono">
          {parseInline(trimmed.substring(4))}
        </h3>
      );
    } else if (trimmed.startsWith("* ") || trimmed.startsWith("- ")) {
      inList = true;
      renderedElements.push(
        <li key={index} className="ml-4 list-disc text-xs text-text2 leading-relaxed pl-1 mb-1">
          {parseInline(trimmed.substring(2))}
        </li>
      );
    } else if (trimmed === "") {
      renderedElements.push(<div key={index} className="h-2" />);
    } else {
      inList = false;
      renderedElements.push(
        <p key={index} className="text-xs text-text2 leading-relaxed mb-2">
          {parseInline(trimmed)}
        </p>
      );
    }
  });

  return <div className="space-y-1">{renderedElements}</div>;
}


function WorkspacePageInner({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const replayRunId = searchParams.get("run");

  const [spec, setSpec] = useState<WorkflowSpec | null>(null);
  const [variables, setVariables] = useState<Record<string, any>>({});
  const [customQueries, setCustomQueries] = useState<{ id: string; label: string; sql: string; optional: boolean }[]>([]);
  const [showConfig, setShowConfig] = useState(true);
  const [showQueryApproval, setShowQueryApproval] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const [runResult, setRunResult] = useState<any>(null);
  const [currentRunId, setCurrentRunId] = useState<number | undefined>(undefined);
  const [isReplay, setIsReplay] = useState(false);

  // Discovery Metadata States for validated Dropdowns
  const [isDiscovering, setIsDiscovering] = useState(true);
  const [discovery, setDiscovery] = useState<{
    github_repos: { name: string; owner: string; full_name: string }[];
    slack_channels: { name: string }[];
    linear_teams: { key: string; name: string }[];
  } | null>(null);
  const [integrations, setIntegrations] = useState<{
    has_github: boolean; has_linear: boolean; has_slack: boolean; has_sentry: boolean;
    connected_count: number; total: number;
  } | null>(null);

  // Chat Panel States
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const sessionId = useRef(`session-${Date.now()}`);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const { streamMessage } = useChat();

  const monaco = useMonaco();

  useEffect(() => {
    if (monaco) {
      const provider = monaco.languages.registerCompletionItemProvider("sql", {
        // @ts-ignore
        provideCompletionItems: (model, position) => {
          const suggestions = [
            { label: "github.commits", kind: monaco.languages.CompletionItemKind.Struct, insertText: "github.commits" },
            { label: "github.pulls", kind: monaco.languages.CompletionItemKind.Struct, insertText: "github.pulls" },
            { label: "github.issues", kind: monaco.languages.CompletionItemKind.Struct, insertText: "github.issues" },
            { label: "github.repos", kind: monaco.languages.CompletionItemKind.Struct, insertText: "github.repos" },
            { label: "linear.issues", kind: monaco.languages.CompletionItemKind.Struct, insertText: "linear.issues" },
            { label: "linear.cycles", kind: monaco.languages.CompletionItemKind.Struct, insertText: "linear.cycles" },
            { label: "linear.teams", kind: monaco.languages.CompletionItemKind.Struct, insertText: "linear.teams" },
            { label: "linear.users", kind: monaco.languages.CompletionItemKind.Struct, insertText: "linear.users" },
            { label: "sentry.issues", kind: monaco.languages.CompletionItemKind.Struct, insertText: "sentry.issues" },
            { label: "sentry.events", kind: monaco.languages.CompletionItemKind.Struct, insertText: "sentry.events" },
            { label: "slack.channels", kind: monaco.languages.CompletionItemKind.Struct, insertText: "slack.channels" },
            { label: "slack.users", kind: monaco.languages.CompletionItemKind.Struct, insertText: "slack.users" },
          ];
          return { suggestions };
        },
      });
      return () => provider.dispose();
    }
  }, [monaco]);

  useEffect(() => {
    async function loadSpec() {
      try {
        const templates = await api.get("/api/workflows");
        const found = templates.find((t: any) => t.id === id);
        if (!found) {
          setError("Workflow spec not found.");
          return;
        }
        setSpec(found);
        setCustomQueries(found.queries || []);
        
        // Load default variable mappings
        const initialVars: Record<string, any> = {};
        found.variables.forEach((v: any) => {
          initialVars[v.name] = v.default;
        });
        setVariables(initialVars);
      } catch (err: any) {
        setError(err.message || "Failed to load template spec.");
      }
    }
    loadSpec();
  }, [id]);

  useEffect(() => {
    async function loadDiscovery() {
      setIsDiscovering(true);
      try {
        const data = await api.get("/api/workflows/discover");
        setDiscovery(data);
        if (data.integrations) setIntegrations(data.integrations);
        
        // Only populate variables if the user actually has integrations connected
        if (data.integrations?.connected_count > 0) {
          setVariables((prev) => {
            const next = { ...prev };
            
            if (data.github_repos?.length > 0) {
              // Always prefer the user's first repo over the hardcoded template defaults
              const firstRepo = data.github_repos[0];
              if (firstRepo) {
                next.owner = firstRepo.owner;
                next.repo = firstRepo.name;
              }
            } else if (data.github_owner) {
               next.owner = data.github_owner;
            }
            
            if (data.slack_channels?.length > 0) {
              const firstChannel = data.slack_channels[0];
              if (firstChannel) {
                next.slack_channel = firstChannel.name;
              }
            }
            
            if (data.linear_teams?.length > 0) {
              const firstTeam = data.linear_teams[0];
              if (firstTeam) {
                next.team_key = firstTeam.key;
                next.team_name = firstTeam.name;
              }
            }
            
            if (data.sentry_org) {
               next.sentry_org = data.sentry_org;
            }
            
            return next;
          });
        }
      } catch (err) {
        console.warn("Discovery load failed:", err);
      } finally {
        setIsDiscovering(false);
      }
    }
    loadDiscovery();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Replay: load historical run data if ?run= is in the URL
  useEffect(() => {
    if (!replayRunId || !spec) return;
    async function loadReplay() {
      setLoading(true);
      try {
        const data = await api.get(`/api/workflows/history/${replayRunId}`);
        setRunResult({
          raw_data: data.raw_data,
          synthesis: data.synthesis,
          ui_layout: data.ui_layout,
          variables: data.variables,
          run_id: data.id,
        });
        setCurrentRunId(data.id);
        setIsReplay(true);
        setShowConfig(false);
        if (data.variables) setVariables(data.variables);

        // Load historical chat messages
        try {
          const chatData = await api.get(`/api/workflows/history/${replayRunId}/chat`);
          if (chatData.messages?.length > 0) {
            setChatMessages(chatData.messages.map((m: any) => ({
              role: m.role as "user" | "agent",
              content: m.content,
            })));
          } else {
            setChatMessages([{
              role: "agent",
              content: `Replaying historical run from **${new Date(data.created_at + "Z").toLocaleString()}**. You can ask me questions about this data.`,
            }]);
          }
        } catch {
          setChatMessages([{
            role: "agent",
            content: `Replaying historical run. You can ask me questions about this data.`,
          }]);
        }
      } catch (err: any) {
        setError(err.message || "Failed to load historical run.");
      } finally {
        setLoading(false);
      }
    }
    loadReplay();
  }, [replayRunId, spec]);

  const handleVariableChange = (name: string, value: any) => {
    setVariables((prev) => ({ ...prev, [name]: value }));
  };

  const confirmAndExecuteWorkflow = async () => {
    if (!spec) return;
    setShowQueryApproval(false);
    setLoading(true);
    setError(null);
    setRunResult(null);

    // Multi-step loading sequence to wow the user
    const steps = [
      "Establishing connection to Coral Federated engine...",
      "Resolving dynamic variables and discovery fallbacks...",
      `Running ${customQueries.length} federated SQL queries in parallel...`,
      "Formatting Coral row results...",
      "Feeding datasets to Gemini for analysis...",
      "Compiling UI Layout components..."
    ];

    setLoadingStep(0);
    const interval = setInterval(() => {
      setLoadingStep((s) => Math.min(s + 1, steps.length - 1));
    }, 1200);

    try {
      const payload = {
        variables: variables,
        custom_queries: customQueries
      };
      const res = await api.post(`/api/workflows/${spec.id}/run`, payload);
      setRunResult(res);
      setCurrentRunId(res.run_id);
      setIsReplay(false);
      setShowConfig(false);

      // Pre-load synthesis into AI chat panel
      setChatMessages([
        {
          role: "agent",
          content: `Hi there! I am your **DevPulse AI Assistant** loaded for today's **${spec.name}** workspace. 

I've successfully fetched the SQL tables from Coral and analyzed the data. Let me know if you want me to breakdown any specific table row, draft Slack updates, or generate reports!`
        }
      ]);
    } catch (err: any) {
      setError(err.message || "Workflow execution failed.");
    } finally {
      clearInterval(interval);
      setLoading(false);
    }
  };

  const sendChatMessage = () => {
    if (!chatInput.trim() || streaming) return;
    const msg = chatInput.trim();
    setChatInput("");
    setChatMessages((m) => [...m, { role: "user", content: msg }]);
    setStreaming(true);

    let agentResponse = "";
    setChatMessages((m) => [...m, { role: "agent", content: "" }]);

    streamMessage(msg, sessionId.current, {
      onQueries: () => {},
      onToken: (t) => {
        agentResponse += t;
        setChatMessages((m) => {
          const updated = [...m];
          updated[updated.length - 1] = { role: "agent", content: agentResponse };
          return updated;
        });
      },
      onError: (err) => {
        setChatMessages((m) => {
          const updated = [...m];
          updated[updated.length - 1] = { 
            role: "agent", 
            content: updated[updated.length - 1].content + `\n\n[Error: ${err}]` 
          };
          return updated;
        });
      },
      onDone: () => setStreaming(false),
    }, currentRunId);
  };



  if (!spec) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <span className="h-6 w-6 rounded-full border-2 border-teal/30 border-t-teal animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Workspace Subheader */}
      <header className="shrink-0 flex items-center justify-between border-b border-border bg-bg2 px-6 py-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="text-text3 hover:text-text text-sm font-mono flex items-center gap-1">
            &larr; Hub
          </Link>
          <div className="h-4 w-px bg-border" />
          <span className="text-xl">{spec.icon}</span>
          <div>
            <h1 className="text-base font-bold font-display leading-none text-text flex items-center gap-2">
              {spec.name} Workspace
              {isReplay && (
                <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  ⏪ REPLAY
                </span>
              )}
            </h1>
            <p className="text-[10px] text-text3 font-mono mt-0.5">Dynamic Engine v{spec.version}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowConfig(!showConfig)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border border-border bg-bg3 text-text2 hover:bg-bg2 transition-colors font-mono"
          >
            ⚙️ Variables
          </button>
          <button
            onClick={() => setShowQueryApproval(true)}
            disabled={loading || isDiscovering || (integrations !== null && integrations.connected_count === 0)}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs rounded-lg bg-teal hover:bg-teal2 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition-colors text-white"
          >
            ⚡ Run Analysis
          </button>
        </div>
      </header>

      {/* Variables Configuration Modal */}
      {showConfig && (
        <div className="shrink-0 border-b border-border bg-bg3/50 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold font-mono text-text uppercase tracking-wider">Configure Workspace Parameters</h3>
            <button onClick={() => setShowConfig(false)} className="text-xs text-text3 hover:text-text font-mono">Collapse &times;</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {isDiscovering ? (
              Array.from({ length: spec.variables?.length || 4 }).map((_, i) => (
                <div key={i} className="flex flex-col gap-1.5">
                  <div className="h-3 w-20 bg-border/50 rounded animate-pulse"></div>
                  <div className="h-8 w-full bg-border/50 rounded animate-pulse"></div>
                </div>
              ))
            ) : (
              spec.variables.map((v) => {
                const renderField = () => {
                  if (v.name === "repo" && integrations?.has_github) {
                    const hasRepos = discovery?.github_repos && discovery.github_repos.length > 0;
                    return (
                      <select
                        value={variables["repo"] && variables["owner"] ? `${variables["owner"]}/${variables["repo"]}` : ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val) {
                            const [o, r] = val.split("/");
                            handleVariableChange("owner", o);
                            handleVariableChange("repo", r);
                          }
                        }}
                        className="rounded-lg border border-border2 bg-bg2 px-3 py-2 text-xs outline-none focus:border-teal transition-colors text-text"
                      >
                        <option value="">-- Select Repository --</option>
                        {!hasRepos && <option disabled value="">No repositories found (check token)</option>}
                        {hasRepos && discovery.github_repos.map((r) => (
                          <option key={r.full_name} value={r.full_name}>{r.full_name}</option>
                        ))}
                      </select>
                    );
                  }
                  
                  if (v.name === "owner" && integrations?.has_github) {
                    return (
                      <input
                        type="text"
                        value={variables["owner"] ?? ""}
                        readOnly
                        className="rounded-lg border border-border2 bg-bg3 px-3 py-2 text-xs font-mono text-text3 select-none"
                        placeholder="Resolved automatically"
                      />
                    );
                  }

                  if (v.name === "slack_channel" && integrations?.has_slack) {
                    const hasChannels = discovery?.slack_channels && discovery.slack_channels.length > 0;
                    return (
                      <select
                        value={variables[v.name] ?? ""}
                        onChange={(e) => handleVariableChange(v.name, e.target.value)}
                        className="rounded-lg border border-border2 bg-bg2 px-3 py-2 text-xs outline-none focus:border-teal transition-colors text-text"
                      >
                        <option value="">-- Select Channel --</option>
                        {!hasChannels && <option disabled value="">No channels found (check token)</option>}
                        {hasChannels && discovery.slack_channels.map((c) => (
                          <option key={c.name} value={c.name}>#{c.name}</option>
                        ))}
                      </select>
                    );
                  }

                  if ((v.name === "team_name" || v.name === "team_key") && integrations?.has_linear) {
                    const hasTeams = discovery?.linear_teams && discovery.linear_teams.length > 0;
                    return (
                      <select
                        value={variables[v.name] ?? ""}
                        onChange={(e) => handleVariableChange(v.name, e.target.value)}
                        className="rounded-lg border border-border2 bg-bg2 px-3 py-2 text-xs outline-none focus:border-teal transition-colors text-text"
                      >
                        <option value="">-- Select Team --</option>
                        {!hasTeams && <option disabled value="">No teams found (check token)</option>}
                        {hasTeams && discovery.linear_teams.map((t) => (
                          <option key={t.key} value={t.key}>{t.name} ({t.key})</option>
                        ))}
                      </select>
                    );
                  }

                  return (
                    <input
                      type={v.type === "integer" ? "number" : "text"}
                      value={variables[v.name] ?? ""}
                      onChange={(e) => handleVariableChange(v.name, v.type === "integer" ? Number(e.target.value) : e.target.value)}
                      placeholder={v.description}
                      disabled={v.name === "sentry_org"}
                      className={`rounded-lg border border-border2 bg-bg2 px-3 py-2 text-xs outline-none transition-colors text-text ${v.name === "sentry_org" ? "opacity-60 cursor-not-allowed" : "focus:border-teal"}`}
                    />
                  );
                };

                return (
                  <div key={v.name} className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold font-mono text-text3 uppercase tracking-wider">{v.name}</label>
                    {renderField()}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      {/* Inline Error Alert Banner */}
      {error && !loading && (
        <div className="shrink-0 border-b border-border bg-coral/5 p-4 flex items-start gap-3 text-xs text-coral">
          <span className="text-sm">⚠️</span>
          <div className="space-y-1">
            <h4 className="font-bold">Workspace Telemetry Error</h4>
            <p className="opacity-95">{error}</p>
          </div>
        </div>
      )}

      {/* Query Approval Modal */}
      {showQueryApproval && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 p-6 backdrop-blur-sm">
          <div className="w-full max-w-4xl max-h-full flex flex-col bg-bg1 border border-border rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-border p-4 bg-bg2">
              <div>
                <h3 className="text-sm font-bold text-text">Review SQL Queries</h3>
                <p className="text-xs text-text3 mt-1">Review or modify the queries DevPulse will execute against the Coral Federated Engine.</p>
              </div>
              <button onClick={() => setShowQueryApproval(false)} className="text-text3 hover:text-text font-bold text-xl">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-bg1">
              {customQueries.map((q, idx) => (
                <div key={q.id} className="space-y-2 border border-border2 rounded-lg p-3 bg-bg2">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-xs font-bold text-teal font-mono">{q.label} <span className="text-text3 ml-2">({q.id})</span></h4>
                    <span className="text-[10px] text-text3 px-2 py-0.5 border border-border2 rounded-full">{q.optional ? 'Optional' : 'Required'}</span>
                  </div>
                  <div className="h-40 rounded overflow-hidden border border-border2 bg-[#1e1e1e]">
                    <Editor
                      height="100%"
                      defaultLanguage="sql"
                      theme="vs-dark"
                      value={q.sql}
                      onChange={(val) => {
                        const newQueries = [...customQueries];
                        newQueries[idx] = { ...q, sql: val || "" };
                        setCustomQueries(newQueries);
                      }}
                      options={{ minimap: { enabled: false }, fontSize: 12, scrollBeyondLastLine: false, padding: { top: 12, bottom: 12 } }}
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-border bg-bg2 shrink-0">
              <button onClick={() => setShowQueryApproval(false)} className="px-4 py-2 text-xs text-text2 hover:text-text font-bold">Cancel</button>
              <button onClick={confirmAndExecuteWorkflow} className="px-5 py-2 text-xs font-bold rounded bg-teal text-white hover:bg-teal2 shadow-lg shadow-teal/20 transition-all">Confirm & Execute</button>
            </div>
          </div>
        </div>
      )}

      {/* Loading State Overlay */}
      {loading && (
        <div className="flex-1 flex flex-col items-center justify-center bg-bg1 space-y-6">
          <div className="relative flex items-center justify-center">
            <div className="h-16 w-16 rounded-full border-4 border-teal/10 border-t-teal animate-spin" />
            <span className="absolute text-2xl">{spec.icon}</span>
          </div>
          <div className="space-y-1 text-center">
            <h3 className="text-sm font-bold text-text font-display">Executing Dynamic Pipeline</h3>
            <p className="text-[11px] text-teal font-mono max-w-sm leading-normal animate-pulse">
              {loadingStep === 0 && "Establishing connection to Coral Federated engine..."}
              {loadingStep === 1 && "Resolving variables and dynamic discovery fallbacks..."}
              {loadingStep === 2 && `Running ${spec.queries.length} federated SQL queries in parallel...`}
              {loadingStep === 3 && "Formatting Coral row results..."}
              {loadingStep === 4 && "Feeding datasets to Gemini for analysis..."}
              {loadingStep === 5 && "Compiling UI Layout components..."}
            </p>
          </div>
        </div>
      )}

      {/* Main Workspace Panels (Split screen) */}
      {!loading && runResult && (
        <div className="flex-1 flex overflow-hidden min-h-0">
          
          {/* Left Panel: Dynamic Layout Widgets Grid */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 min-w-0 bg-bg1">
            <div className="grid grid-cols-12 gap-6">
              {spec.ui_layout.widgets
                .filter((w) => w.type !== "markdown") // AI text belongs to the synthesis/chat panel
                .sort((a, b) => (a.layout.order || 0) - (b.layout.order || 0))
                .map((widget) => {
                  const widgetData = runResult.raw_data[widget.data_source] || [];
                  const colSpan = widget.layout.col_span || 12;

                  return (
                    <div
                      key={widget.id}
                      style={{ gridColumn: `span ${colSpan} / span ${colSpan}` }}
                      className="flex flex-col gap-2 min-w-0"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold font-mono tracking-wider text-text3 uppercase">
                          {widget.title}
                        </h3>
                        <span className="text-[9px] font-mono text-text3 bg-bg3 border border-border px-1.5 py-0.5 rounded">
                          {widgetData.length} records
                        </span>
                      </div>

                      {widget.type === "metric_cards" && (
                        <MetricCardsWidget data={widgetData} config={widget.config} />
                      )}
                      {widget.type === "table" && (
                        <TableWidget data={widgetData} config={widget.config} />
                      )}
                      {widget.type === "chart_bar" && (
                        <BarChartWidget data={widgetData} config={widget.config} />
                      )}
                      {widget.type === "chart_pie" && (
                        <PieChartWidget data={widgetData} config={widget.config} />
                      )}
                      {widget.type === "board" && (
                        <KanbanBoardWidget data={widgetData} config={widget.config} />
                      )}
                      {widget.type === "status_grid" && (
                        <StatusGridWidget data={widgetData} config={widget.config} />
                      )}
                    </div>
                  );
                })}
            </div>
          </div>

          {/* Right Panel: AI Synthesis & Conversation Co-Pilot */}
          <div className="w-[420px] md:w-[480px] shrink-0 border-l border-border bg-bg2 flex flex-col overflow-hidden">
            {/* Persona Header */}
            <div className="shrink-0 border-b border-border p-4 bg-bg3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">🤖</span>
                <div>
                  <h3 className="text-xs font-bold font-mono text-text uppercase tracking-wider leading-none">
                    AI {spec.ai_persona?.name || "Assistant"}
                  </h3>
                  <p className="text-[10px] text-text3 font-mono mt-0.5">Synthesis Engine Active</p>
                </div>
              </div>
            </div>

            {/* Chat Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 bg-bg2">
              
              {/* Main AI Synthesis (Markdown widget render) */}
              <div className="p-4 rounded-xl bg-bg3/60 border border-border/80 text-sm leading-relaxed whitespace-pre-wrap text-text2">
                <div className="border-b border-border/60 pb-2 mb-3 flex items-center justify-between">
                  <span className="text-[10px] font-bold font-mono text-teal uppercase tracking-wider">⚡ AI Workspace Report</span>
                  <span className="text-[9px] font-mono text-text3">Generated now</span>
                </div>
                <div className="prose prose-invert max-w-none text-xs leading-relaxed space-y-2">
                  <MarkdownRenderer text={runResult.synthesis} />
                </div>
              </div>

              {/* Chat Thread */}
              {chatMessages.map((msg, i) => (
                <div key={i} className={`flex flex-col gap-1 ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-2.5 text-xs leading-relaxed ${
                      msg.role === "user"
                        ? "bg-coral text-white border border-coral whitespace-pre-wrap"
                        : "bg-bg3 text-text2 border border-border"
                    }`}
                  >
                    {msg.role === "agent" && msg.content ? (
                      <MarkdownRenderer text={msg.content} />
                    ) : (
                      msg.content || <span className="animate-pulse text-text3">▋</span>
                    )}
                  </div>
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>

            {/* Chat Input */}
            <div className="shrink-0 border-t border-border p-3 bg-bg3 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChatMessage()}
                placeholder={`Ask ${spec.ai_persona?.name || "AI"} about this data...`}
                className="flex-1 rounded-lg border border-border2 bg-bg2 px-3 py-2 text-xs outline-none focus:border-teal transition-colors text-text"
              />
              <button
                onClick={sendChatMessage}
                disabled={streaming || !chatInput.trim()}
                className="rounded-lg bg-coral px-4 py-2 text-xs font-semibold hover:bg-coral2 disabled:opacity-50 transition-colors text-white"
              >
                Send
              </button>
            </div>

          </div>

        </div>
      )}

      {!loading && !runResult && (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-4">
          {integrations !== null && integrations.connected_count === 0 ? (
            /* No integrations connected — prompt user to connect tools */
            <>
              <div className="text-5xl">🔗</div>
              <div className="space-y-2 max-w-md">
                <h2 className="text-lg font-bold font-display text-text">Connect Your Tools</h2>
                <p className="text-xs text-text3 leading-relaxed">
                  You haven't connected any integrations yet. DevPulse needs at least one tool (GitHub, Linear, Sentry, or Slack) to fetch data for this workspace.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                {[
                  { name: "GitHub", icon: "⬡", connected: integrations.has_github },
                  { name: "Linear", icon: "◈", connected: integrations.has_linear },
                  { name: "Sentry", icon: "◎", connected: integrations.has_sentry },
                  { name: "Slack", icon: "💬", connected: integrations.has_slack },
                ].map((tool) => (
                  <div
                    key={tool.name}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono ${
                      tool.connected
                        ? "border-green-500/30 bg-green-500/10 text-green-400"
                        : "border-border2 bg-bg3 text-text3"
                    }`}
                  >
                    <span>{tool.icon}</span>
                    <span>{tool.name}</span>
                    <span className={`h-1.5 w-1.5 rounded-full ${tool.connected ? "bg-green-400" : "bg-text3"}`} />
                  </div>
                ))}
              </div>
              <Link
                href="/settings"
                className="mt-4 px-6 py-2.5 rounded-lg bg-coral hover:bg-coral2 font-bold text-xs transition-colors text-white glow-coral flex items-center gap-2"
              >
                ⚙️ Go to Settings & Connect Tools
              </Link>
            </>
          ) : (
            /* User has at least one integration — show normal init state */
            <>
              <div className="text-5xl animate-bounce">{spec.icon}</div>
              <div className="space-y-1">
                <h2 className="text-lg font-bold font-display text-text">Initialize {spec.name} Workspace</h2>
                <p className="text-xs text-text3 max-w-sm leading-relaxed">
                  Verify your template variables in the panel above and click Run Analysis. 
                  DevPulse will fetch live SQL tables from Coral and start the AI session.
                </p>
                {integrations && integrations.connected_count < integrations.total && (
                  <p className="text-[11px] text-devyellow font-mono mt-2">
                    ⚠️ {integrations.connected_count}/{integrations.total} integrations connected.{" "}
                    <Link href="/settings" className="underline hover:text-devyellow/80">Connect more →</Link>
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowQueryApproval(true)}
                disabled={loading || isDiscovering}
                className="px-6 py-2.5 rounded-lg bg-coral hover:bg-coral2 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-xs transition-colors text-white glow-coral"
              >
                 ⚡ Run Initial Analysis
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function WorkspacePage(props: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-5 h-5 border-2 border-coral/30 border-t-coral rounded-full animate-spin" /></div>}>
      <WorkspacePageInner {...props} />
    </Suspense>
  );
}
