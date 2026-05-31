"use client";
import dynamic from "next/dynamic";
import { useState } from "react";
import { api } from "@/lib/api";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

export default function ExplorerPage() {
  const [sql, setSql] = useState("SELECT * FROM coral.tables");
  const [result, setResult] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);

  const run = async () => {
    setLoading(true);
    try {
      const data = await api.post("/api/query", { sql });
      setResult(data.result);
      setElapsed(data.execution_ms);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold font-display">Query Explorer</h1>
        <button
          onClick={run}
          disabled={loading}
          className="rounded-lg bg-coral px-4 py-2 text-sm font-medium hover:bg-coral2 disabled:opacity-50 transition-colors text-white"
        >
          {loading ? "Running…" : "Run Query"}
        </button>
      </div>

      <div className="rounded-lg border border-border overflow-hidden">
        <MonacoEditor
          height="200px"
          language="sql"
          theme="vs-dark"
          value={sql}
          onChange={(v) => setSql(v ?? "")}
          options={{ minimap: { enabled: false }, fontSize: 13 }}
        />
      </div>

      {result !== null && (
        <div className="rounded-lg border border-border bg-bg2 p-4">
          <p className="text-xs text-text3 mb-2 font-mono">{elapsed}ms</p>
          <pre className="text-xs text-text overflow-x-auto font-mono">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
