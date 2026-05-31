"use client";

interface Props {
  rawData: Record<string, unknown> | null;
  loading: boolean;
}

interface PRRow {
  pr_title?: string;
  pr_url?: string;
  pr_status?: string;
  author?: string;
  issue_title?: string;
  created_at?: string;
}

const STATUS_STYLES: Record<string, string> = {
  open:   "bg-teal/12 text-teal border-teal/30",
  merged: "bg-devpurple/12 text-devpurple border-devpurple/30",
  closed: "bg-bg3/60 text-text3 border-border2/60",
  draft:  "bg-devyellow/12 text-devyellow border-devyellow/30",
};

export function PRStatusTable({ rawData, loading }: Props) {
  const prs = (rawData?.pr_status as PRRow[] | undefined) ?? [];

  return (
    <div className="rounded-xl border border-border bg-bg2 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Pull Requests</h2>
        <span className="text-xs text-text3 font-mono">{prs.length} open</span>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-10 bg-bg3 rounded-lg" />
          ))}
        </div>
      ) : prs.length === 0 ? (
        <p className="text-xs text-text3 py-4 text-center">No PR data available</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-text3 border-b border-border">
                <th className="text-left pb-2 font-medium font-mono tracking-wide">Title</th>
                <th className="text-left pb-2 font-medium font-mono tracking-wide">Status</th>
                <th className="text-left pb-2 font-medium font-mono tracking-wide">Author</th>
                <th className="text-left pb-2 font-medium font-mono tracking-wide">Linked Issue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {prs.slice(0, 8).map((pr, i) => (
                <tr key={i} className="hover:bg-bg3/40 transition-colors">
                  <td className="py-2.5 pr-4">
                    {pr.pr_url ? (
                      <a
                        href={pr.pr_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-coral hover:text-coral2 truncate max-w-xs block transition-colors"
                      >
                        {pr.pr_title ?? "Untitled PR"}
                      </a>
                    ) : (
                      <span className="truncate max-w-xs block text-text">
                        {pr.pr_title ?? "Untitled PR"}
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-medium font-mono ${
                        STATUS_STYLES[pr.pr_status ?? "open"] ?? STATUS_STYLES.open
                      }`}
                    >
                      {pr.pr_status ?? "open"}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-text2 font-mono">{pr.author ?? "—"}</td>
                  <td className="py-2.5 text-text3 truncate max-w-[160px]">
                    {pr.issue_title ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
