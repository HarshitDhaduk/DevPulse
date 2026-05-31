"use client";

type KanbanBoardWidgetProps = {
  data: any[];
  config: {
    group_by: string;
    card_title: string;
    card_subtitle: string;
  };
};

export default function KanbanBoardWidget({ data = [], config }: KanbanBoardWidgetProps) {
  const group_by = config?.group_by || "state";
  const card_title = config?.card_title || "issue_title";
  const card_subtitle = config?.card_subtitle || "assignee";

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex h-36 items-center justify-center rounded-xl border border-border bg-bg2 text-text3 text-xs font-mono">
        No board items
      </div>
    );
  }

  // Pre-define columns for a standard Kanban flow
  // (e.g. Done, In Progress, Blocked, Todo, Backlog, etc.)
  const states = Array.from(new Set(data.map((item) => String(item[group_by]))));
  
  // Sort states logically
  const logicalOrder = ["backlog", "todo", "in_progress", "blocked", "done"];
  const columns = states.sort((a, b) => {
    const idxA = logicalOrder.indexOf(a.toLowerCase());
    const idxB = logicalOrder.indexOf(b.toLowerCase());
    if (idxA === -1 && idxB === -1) return a.localeCompare(b);
    if (idxA === -1) return 1;
    if (idxB === -1) return -1;
    return idxA - idxB;
  });

  const getFriendlyColumnName = (col: string) => {
    const mappings: Record<string, string> = {
      todo: "📋 Todo",
      in_progress: "⚡ In Progress",
      blocked: "🚨 Blocked",
      done: "✅ Done",
      backlog: "📦 Backlog",
    };
    return mappings[col.toLowerCase()] || col.replace(/_/g, " ").toUpperCase();
  };

  const getPriorityColor = (priority?: string) => {
    switch (String(priority).toLowerCase()) {
      case "high":
        return "bg-coral/10 text-coral border-coral/20";
      case "medium":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      case "low":
        return "bg-teal-500/10 text-teal border-teal-500/20";
      default:
        return "bg-bg3 text-text3 border-border";
    }
  };

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 w-full min-h-[400px]">
      {columns.map((col) => {
        const colItems = data.filter((item) => String(item[group_by]) === col);
        return (
          <div
            key={col}
            className="flex-1 min-w-[280px] max-w-[320px] flex flex-col gap-3 rounded-xl border border-border/80 bg-bg2 p-4"
          >
            {/* Column Header */}
            <div className="flex items-center justify-between border-b border-border/50 pb-2">
              <span className="font-bold text-sm text-text font-display">
                {getFriendlyColumnName(col)}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-bg3 text-text3 font-mono font-semibold">
                {colItems.length}
              </span>
            </div>

            {/* Column Items */}
            <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto">
              {colItems.length === 0 ? (
                <div className="flex h-20 items-center justify-center rounded-lg border border-dashed border-border/60 text-text3 text-[11px] font-mono">
                  Empty column
                </div>
              ) : (
                colItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col gap-3 p-3.5 rounded-lg border border-border2 bg-bg1 hover:border-border transition-all duration-150 shadow-sm"
                  >
                    <div className="text-xs font-medium text-text2 leading-normal line-clamp-2">
                      {item.issue_url ? (
                        <a href={item.issue_url} target="_blank" rel="noopener noreferrer" className="text-teal hover:underline hover:text-teal2 transition-colors">
                          {item[card_title]} ↗
                        </a>
                      ) : (
                        item[card_title]
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-text3 mt-1">
                      <span className="flex items-center gap-1">
                        👤 {item[card_subtitle] || "Unassigned"}
                      </span>
                      <div className="flex gap-1.5">
                        {item.source && (
                          <span className={`px-2 py-0.5 rounded border text-[9px] uppercase tracking-wider font-bold ${
                            String(item.source).toLowerCase() === 'github' 
                              ? 'bg-text/10 text-text border-text/20' 
                              : 'bg-devpurple/10 text-devpurple border-devpurple/20'
                          }`}>
                            {item.source}
                          </span>
                        )}
                        {item.priority && (
                          <span className={`px-2 py-0.5 rounded border ${getPriorityColor(item.priority)}`}>
                            {item.priority}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
