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

export interface MonthlyRevenueDay {
  date: string;
  inflowwCents: number;
  fanvueCents: number;
  agencyCents: number;
}

const CURRENCY_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatXDate(dateStr: string): string {
  const [, , d] = dateStr.split("-");
  return String(parseInt(d ?? "1", 10));
}

function centsToDollars(cents: number): number {
  return cents / 100;
}

interface MonthlyRevenueChartProps {
  data: MonthlyRevenueDay[];
  className?: string;
}

export function MonthlyRevenueChart({ data, className }: MonthlyRevenueChartProps) {
  const chartData = data.map((d) => ({
    ...d,
    agency: centsToDollars(d.agencyCents),
    infloww: centsToDollars(d.inflowwCents),
    fanvue: centsToDollars(d.fanvueCents),
  }));

  const yDomain: [number, number] = [0, 20000];

  return (
    <div className={className ?? "h-[300px] w-full"}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
        >
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(255,255,255,0.06)"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            interval={0}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
            tickFormatter={formatXDate}
            axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
          />
          <YAxis
            domain={yDomain}
            tickCount={6}
            tick={{ fontSize: 11, fill: "rgba(255,255,255,0.5)" }}
            tickFormatter={(v: number) => CURRENCY_FORMAT.format(Number(v))}
            axisLine={false}
            tickLine={{ stroke: "rgba(255,255,255,0.1)" }}
            width={70}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: "8px",
              border: "1px solid rgba(255,255,255,0.1)",
              backgroundColor: "rgba(10,10,12,0.95)",
              padding: "8px 12px",
            }}
            labelFormatter={(label: string) => formatXDate(label)}
            formatter={(value: number, name: string) => {
              const labels: Record<string, string> = {
                agency: "Agency total",
                infloww: "Infloww",
                fanvue: "Fanvue",
              };
              return [CURRENCY_FORMAT.format(value), labels[name] ?? name];
            }}
            labelStyle={{ color: "rgba(255,255,255,0.8)" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value) => (
              <span className="text-zinc-300">
                {value === "agency" && "Agency total"}
                {value === "infloww" && "Infloww"}
                {value === "fanvue" && "Fanvue"}
              </span>
            )}
          />
          <Line
            type="monotone"
            dataKey="agency"
            name="agency"
            stroke="hsl(330 81% 60%)"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(330 81% 60%)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="infloww"
            name="infloww"
            stroke="hsl(217 91% 60%)"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(217 91% 60%)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
          <Line
            type="monotone"
            dataKey="fanvue"
            name="fanvue"
            stroke="hsl(142 76% 45%)"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(142 76% 45%)", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
