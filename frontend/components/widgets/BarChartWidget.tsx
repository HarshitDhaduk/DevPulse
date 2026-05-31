"use client";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

type BarSeries = {
  key: string;
  name: string;
  color?: string;
};

type BarChartWidgetProps = {
  data: any[];
  config: {
    x_axis: string;
    series: BarSeries[];
  };
};

export default function BarChartWidget({ data = [], config }: BarChartWidgetProps) {
  const x_axis = config?.x_axis;
  const series = config?.series || [];

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-bg2 text-text3 text-xs font-mono">
        No metric data to plot
      </div>
    );
  }

  // Pre-process data if keys are nested or need custom trimming
  const formattedData = data.slice(0, 10).map((row) => {
    const formatted: any = { ...row };
    // Shorten long labels on X axis
    if (typeof row[x_axis] === "string" && row[x_axis].length > 15) {
      formatted[x_axis] = row[x_axis].substring(0, 15) + "...";
    }
    return formatted;
  });

  return (
    <div className="h-64 w-full border border-border bg-bg2 rounded-xl p-4 flex flex-col justify-end">
      <div className="flex-1 min-h-0 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={formattedData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2D3139" opacity={0.3} />
            <XAxis
              dataKey={x_axis}
              stroke="#8F9CAE"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#8F9CAE"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1E222A",
                border: "1px solid #2D3139",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#F1F5F9",
              }}
              cursor={{ fill: "rgba(255,255,255,0.03)" }}
            />
            {series.map((s, i) => (
              <Bar
                key={i}
                dataKey={s.key}
                name={s.name}
                fill={s.color || "#00F2FE"}
                radius={[4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
