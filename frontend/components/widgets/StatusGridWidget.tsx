"use client";

type StatusGridWidgetProps = {
  data: any[];
  config: {
    label_key: string;
    status_key: string;
    success_values: any[];
  };
};

export default function StatusGridWidget({ data = [], config }: StatusGridWidgetProps) {
  const label_key = config?.label_key || "schema_name";
  const status_key = config?.status_key || "table_count";
  const success_values = config?.success_values || [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

  const standardSources = [
    { key: "github", label: "GitHub Connector", desc: "PRs, issues & commit tracking" },
    { key: "linear", label: "Linear Connector", desc: "Sprint backlog & tickets sync" },
    { key: "slack", label: "Slack Connector", desc: "Engineering channels monitoring" },
    { key: "sentry", label: "Sentry Connector", desc: "Production fatal exception telemetry" },
  ];

  const isConnected = (sourceKey: string) => {
    if (!Array.isArray(data)) return false;
    const match = data.find((row) => String(row[label_key]).toLowerCase().includes(sourceKey));
    if (!match) return false;
    
    const val = match[status_key];
    return success_values.includes(val) || Number(val) > 0;
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 w-full">
      {standardSources.map((src) => {
        const connected = isConnected(src.key);
        return (
          <div
            key={src.key}
            className={`flex flex-col justify-between p-6 rounded-xl border bg-bg2 transition-all shadow-sm ${
              connected 
                ? "border-emerald-500/20 hover:border-emerald-500/40" 
                : "border-coral/20 hover:border-coral/40"
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xl font-bold font-display text-text">{src.label}</span>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold font-mono border uppercase tracking-wider ${
                    connected
                      ? "bg-emerald-500/10 text-emerald border-emerald-500/20"
                      : "bg-coral/10 text-coral border-coral/20"
                  }`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald" : "bg-coral"} animate-pulse`} />
                  {connected ? "Active" : "Offline"}
                </span>
              </div>
              <p className="text-text2 text-xs leading-relaxed">{src.desc}</p>
            </div>
            
            <div className="border-t border-border/50 pt-4 mt-6 text-[10px] font-mono text-text3">
              {connected 
                ? "✓ Fetching live SQL federation rows" 
                : "× Configure secrets in /settings"
              }
            </div>
          </div>
        );
      })}
    </div>
  );
}
