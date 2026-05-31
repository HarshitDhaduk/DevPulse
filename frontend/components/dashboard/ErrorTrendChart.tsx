"use client";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface Props {
  rawData: Record<string, unknown> | null;
  loading: boolean;
}

interface ErrorRow {
  title?: string;
  error_count?: number;
  first_seen?: string;
}

// Generate placeholder sparkline data when no real data
const PLACEHOLDER = [
  { time: "Mon", errors: 12 },
  { time: "Tue", errors: 8 },
  { time: "Wed", errors: 23 },
  { time: "Thu", errors: 15 },
  { time: "Fri", errors: 31 },
  { time: "Sat", errors: 9 },
  { time: "Sun", errors: 6 },
];

export function ErrorTrendChart({ rawData, loading }: Props) {
  const errors = (rawData?.error_trends as ErrorRow[] | undefined) ?? [];

  // Build chart data from real errors or use placeholder
  const chartData =
    errors.length > 0
      ? errors.slice(0, 7).map((e, i) => ({
          time: e.first_seen ? new Date(e.first_seen).toLocaleDateString("en", { weekday: "short" }) : `T-${i}`,
          errors: e.error_count ?? 0,
        }))
      : PLACEHOLDER;

  const totalErrors = errors.reduce((sum, e) => sum + (e.error_count ?? 0), 0);
  const topError = errors[0];

  return (
    <div className="rounded-xl border border-border bg-bg2 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-text">Error Trends</h2>
        {!loading && errors.length > 0 && (
          <span className="text-xs text-red-400 font-medium">{totalErrors} total errors</span>
        )}
      </div>

      {loading ? (
        <div className="h-40 bg-bg3 rounded-lg animate-pulse" />
      ) : (
        <>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2530" />
                <XAxis
                  dataKey="time"
                  tick={{ fill: "#5a6880", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "#5a6880", fontSize: 10 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: "#0f1217",
                    border: "1px solid #1e2530",
                    borderRadius: "8px",
                    fontSize: "12px",
                    color: "#e8edf5",
                  }}
                  cursor={{ stroke: "#2a3340" }}
                />
                <Line
                  type="monotone"
                  dataKey="errors"
                  stroke="#ef4444"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, fill: "#ef4444" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {topError && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/20 p-3">
              <p className="text-xs text-red-300 font-medium font-mono">Top error</p>
              <p className="text-xs text-text2 mt-0.5 truncate">{topError.title}</p>
              <p className="text-xs text-red-400 mt-0.5">{topError.error_count} occurrences</p>
            </div>
          )}

          {errors.length === 0 && (
            <p className="text-xs text-text3 text-center font-mono">
              Showing sample data — connect Sentry to see real errors
            </p>
          )}
        </>
      )}
    </div>
  );
}
