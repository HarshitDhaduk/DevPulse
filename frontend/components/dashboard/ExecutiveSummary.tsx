"use client";

interface Props {
  report: string | null;
  loading: boolean;
}

export function ExecutiveSummary({ report, loading }: Props) {
  return (
    <div className="rounded-xl border border-border bg-bg2 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-text font-display">AI Summary</span>
        <span className="text-[10px] rounded border bg-teal/12 border-teal/25 text-teal px-2 py-0.5 font-mono">
          Gemini 2.5 Pro
        </span>
      </div>

      {loading ? (
        <div className="space-y-2 animate-pulse">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-3 bg-bg3 rounded"
              style={{ width: `${85 - i * 8}%` }}
            />
          ))}
        </div>
      ) : report ? (
        <div className="prose prose-invert prose-sm max-w-none">
          <pre className="whitespace-pre-wrap text-sm text-text2 leading-relaxed font-sans">
            {report}
          </pre>
        </div>
      ) : null}
    </div>
  );
}
