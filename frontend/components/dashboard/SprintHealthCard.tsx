"use client";

interface Props {
  rawData: Record<string, unknown> | null;
  loading: boolean;
}

interface IssueRow {
  issue_title?: string;
  state?: string;
  assignee?: string;
  priority?: string;
}

const STATE_COLORS: Record<string, string> = {
  in_progress: "bg-devblue/15 text-devblue border-devblue/30",
  done:        "bg-teal/12 text-teal border-teal/25",
  blocked:     "bg-coral/12 text-coral border-coral/25",
  todo:        "bg-bg3/80 text-text2 border-border2/60",
  cancelled:   "bg-bg3/50 text-text3 border-border/50",
};

export function SprintHealthCard({ rawData, loading }: Props) {
  const issues = (rawData?.sprint_health as IssueRow[] | undefined) ?? [];

  const counts = {
    in_progress: issues.filter((i) => i.state === "in_progress").length,
    done:        issues.filter((i) => i.state === "done").length,
    blocked:     issues.filter((i) => i.state === "blocked").length,
    todo:        issues.filter((i) => i.state === "todo").length,
  };
  const total = issues.length || 1;

  return (
    <div className="rounded-xl border border-border bg-bg2 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Sprint Health</h2>
        <span className="text-xs text-text3 font-mono">{issues.length} issues</span>
      </div>

      {loading ? (
        <SkeletonRows />
      ) : issues.length === 0 ? (
        <p className="text-xs text-text3 py-4 text-center">No sprint data available</p>
      ) : (
        <>
          {/* Progress bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden gap-px">
            <div
              className="bg-teal transition-all"
              style={{ width: `${(counts.done / total) * 100}%` }}
            />
            <div
              className="bg-devblue transition-all"
              style={{ width: `${(counts.in_progress / total) * 100}%` }}
            />
            <div
              className="bg-coral transition-all"
              style={{ width: `${(counts.blocked / total) * 100}%` }}
            />
            <div
              className="bg-bg3 transition-all"
              style={{ width: `${(counts.todo / total) * 100}%` }}
            />
          </div>

          {/* Counts */}
          <div className="grid grid-cols-4 gap-2">
            {(["done", "in_progress", "blocked", "todo"] as const).map((state) => (
              <div key={state} className="text-center">
                <p className="text-lg font-bold font-display">{counts[state]}</p>
                <p className="text-[10px] text-text3 capitalize font-mono">{state.replace("_", " ")}</p>
              </div>
            ))}
          </div>

          {/* Issue list */}
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {issues.slice(0, 8).map((issue, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                <span
                  className={`shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-medium font-mono ${
                    STATE_COLORS[issue.state ?? "todo"] ?? STATE_COLORS.todo
                  }`}
                >
                  {issue.state?.replace("_", " ") ?? "todo"}
                </span>
                <span className="truncate text-text">{issue.issue_title ?? "Untitled"}</span>
                {issue.assignee && (
                  <span className="ml-auto shrink-0 text-text3 font-mono">{issue.assignee}</span>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2 animate-pulse">
      <div className="h-1.5 bg-bg3 rounded-full" />
      <div className="grid grid-cols-4 gap-2">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 bg-bg3 rounded-lg" />
        ))}
      </div>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-5 bg-bg3 rounded" />
      ))}
    </div>
  );
}
