"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";

type RunSummary = {
  id: number;
  workflow_id: string;
  workflow_name: string;
  workflow_icon: string;
  variables_summary: Record<string, string>;
  status: string;
  duration_ms: number;
  created_at: string;
};

function timeAgo(dateStr: string): string {
  const now = new Date();
  const past = new Date(dateStr + "Z");
  const diffMs = now.getTime() - past.getTime();
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    SUCCESS: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    ERROR: "bg-red-500/15 text-red-400 border-red-500/30",
    PARTIAL: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  };
  return (
    <span
      className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded-full border ${
        colors[status] || colors.SUCCESS
      }`}
    >
      {status}
    </span>
  );
}

export default function HistoryPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [availableWorkflows, setAvailableWorkflows] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const params: Record<string, string> = { limit: "100" };
        if (filter !== "all") params.workflow_id = filter;
        const data = await api.get("/api/workflows/history", params);
        const fetchedRuns = data.runs || [];
        setRuns(fetchedRuns);
        setTotal(data.total || 0);
        
        if (filter === "all") {
          const uniqueWfs = Array.from(new Set(fetchedRuns.map((r: any) => r.workflow_id))) as string[];
          setAvailableWorkflows(uniqueWfs);
        }
      } catch (err) {
        console.error("Failed to load history:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [filter]);

  return (
    <div className="flex-1 overflow-auto">
      {/* Header */}
      <div className="border-b border-border bg-bg">
        <div className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-text font-display flex items-center gap-2">
                <svg className="w-5 h-5 text-coral" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Run History
              </h1>
              <p className="text-xs text-text3 mt-1 font-mono">
                {total} total runs • Click any run to replay
              </p>
            </div>

            {/* Filter */}
            {availableWorkflows.length > 1 && (
              <select
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="bg-bg2 border border-border text-text text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-coral/50 font-mono"
              >
                <option value="all">All Workflows</option>
                {availableWorkflows.map((wf) => (
                  <option key={wf} value={wf}>
                    {wf}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-coral/30 border-t-coral rounded-full animate-spin" />
              <span className="text-sm text-text3 font-mono">Loading history...</span>
            </div>
          </div>
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-2xl bg-bg3 flex items-center justify-center text-2xl mb-4">
              📊
            </div>
            <h2 className="text-sm font-semibold text-text mb-1">No runs yet</h2>
            <p className="text-xs text-text3 text-center max-w-xs">
              Run a workspace from the{" "}
              <Link href="/dashboard" className="text-coral hover:underline">
                Dashboard
              </Link>{" "}
              and your history will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run, i) => (
              <Link
                key={run.id}
                href={`/dashboard/workspace/${run.workflow_id}?run=${run.id}`}
                className="block group"
              >
                <div
                  className="rounded-xl border border-border bg-bg2/50 hover:bg-bg2 hover:border-coral/30 transition-all duration-200 p-4 flex items-center gap-4"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-xl bg-bg3 flex items-center justify-center text-lg shrink-0 group-hover:scale-110 transition-transform">
                    {run.workflow_icon || "📊"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-semibold text-text truncate">
                        {run.workflow_name}
                      </span>
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-text3 font-mono">
                      {run.variables_summary.repo && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          {run.variables_summary.owner}/{run.variables_summary.repo}
                        </span>
                      )}
                      {run.variables_summary.team_name && (
                        <span className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
                          </svg>
                          {run.variables_summary.team_name}
                        </span>
                      )}
                      {run.duration_ms != null && (
                        <span>
                          {run.duration_ms > 1000
                            ? `${(run.duration_ms / 1000).toFixed(1)}s`
                            : `${run.duration_ms}ms`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Time */}
                  <div className="text-right shrink-0">
                    <p className="text-xs text-text3 font-mono">
                      {timeAgo(run.created_at)}
                    </p>
                    <p className="text-[10px] text-text3/60 font-mono mt-0.5">
                      {new Date(run.created_at + "Z").toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>

                  {/* Arrow */}
                  <svg
                    className="w-4 h-4 text-text3 group-hover:text-coral transition-colors shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
