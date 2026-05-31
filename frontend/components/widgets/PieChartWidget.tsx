"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from "recharts";

type PieChartWidgetProps = {
  data: any[];
  config: {
    name_key: string;
    value_key: string;
    colors?: string[];
  };
};

export default function PieChartWidget({ data = [], config }: PieChartWidgetProps) {
  const name_key = config?.name_key;
  const value_key = config?.value_key;
  const colors = config?.colors || ["#00F2FE", "#4FACFE", "#00C6FF", "#0072FF"];

  if (!Array.isArray(data) || data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-xl border border-border bg-bg2 text-text3 text-xs font-mono">
        No slice data to plot
      </div>
    );
  }

  // Aggregate values by name_key to ensure no duplicates in chart
  const aggregates: Record<string, number> = {};
  data.forEach((row) => {
    const name = String(row[name_key] || "Unassigned");
    const val = Number(row[value_key] || 0);
    aggregates[name] = (aggregates[name] || 0) + val;
  });

  const chartData = Object.keys(aggregates).map((name) => ({
    name,
    value: aggregates[name],
  }));

  return (
    <div className="h-64 w-full border border-border bg-bg2 rounded-xl p-4 flex flex-col justify-end">
      <div className="flex-1 min-h-0 min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={70}
              paddingAngle={3}
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "#1E222A",
                border: "1px solid #2D3139",
                borderRadius: "8px",
                fontSize: "12px",
                color: "#F1F5F9",
              }}
            />
            <Legend
              verticalAlign="bottom"
              height={36}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "11px", color: "#8F9CAE" }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
