"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface Source {
  source_name: string;
  display_name: string;
  status: string;
  last_checked?: string;
  table_count?: number;
  error_message?: string;
}

const STATUS_DOT: Record<string, string> = {
  CONNECTED: "bg-green-400",
  DISCONNECTED: "bg-text3",
  ERROR: "bg-coral",
  UNKNOWN: "bg-devyellow",
  CHECKING: "bg-devyellow animate-pulse",
};

const DEFAULT_SOURCES: Source[] = [
  { source_name: "github", display_name: "GitHub", status: "CHECKING" },
  { source_name: "linear", display_name: "Linear", status: "CHECKING" },
  { source_name: "sentry", display_name: "Sentry", status: "CHECKING" },
  { source_name: "slack", display_name: "Slack", status: "CHECKING" },
];

export function SourceStatusBar() {
  const [sources, setSources] = useState<Source[]>(DEFAULT_SOURCES);

  useEffect(() => {
    // Hits POST /api/sources/check to live-probe backend sources instead of just fetching cached state
    api.post("/api/sources/check").then((data) => {
      if (Array.isArray(data)) setSources(data);
    }).catch(() => {
      setSources(DEFAULT_SOURCES.map(s => ({ ...s, status: "ERROR" })));
    });
  }, []);

  return (
    <div className="flex flex-wrap gap-2">
      {sources.map((s) => (
        <div
          key={s.source_name}
          className="flex items-center gap-1.5 rounded border border-border bg-bg2 px-3 py-1 text-xs"
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s.status] ?? STATUS_DOT.UNKNOWN}`}
          />
          <span className="text-text capitalize">{s.display_name}</span>
          <span className="text-text3 font-mono">{s.status.toLowerCase()}</span>
        </div>
      ))}
    </div>
  );
}
