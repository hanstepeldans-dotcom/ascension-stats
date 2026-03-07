"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface ChartDataPoint {
  date: string;
  [key: string]: string | number;
}

interface PlaceholderLineChartProps {
  data: ChartDataPoint[];
  dataKeys: { key: string; color: string }[];
  title?: string;
}

export function PlaceholderLineChart({
  data,
  dataKeys,
  title,
}: PlaceholderLineChartProps) {
  return (
    <div className="h-[300px] w-full">
      {title && (
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">
          {title}
        </h3>
      )}
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 12 }}
            tickFormatter={(v) => {
              const d = new Date(v);
              return `${d.getMonth() + 1}/${d.getDate()}`;
            }}
          />
          <YAxis tick={{ fontSize: 12 }} />
          <Tooltip
            labelFormatter={(v) => new Date(v).toLocaleDateString()}
            contentStyle={{ borderRadius: "var(--radius)" }}
          />
          <Legend />
          {dataKeys.map(({ key, color }) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3 }}
              name={key.charAt(0).toUpperCase() + key.slice(1)}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
