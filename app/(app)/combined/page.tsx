"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PlaceholderLineChart } from "@/components/charts/placeholder-line-chart";
import { getMockDailyStatsInfloww, normalizeToUnifiedSchema as normalizeInfloww } from "@/lib/providers/infloww";
import { getMockDailyStatsFanvue, normalizeToUnifiedSchema as normalizeFanvue } from "@/lib/providers/fanvue";
import { combineUnifiedStats } from "@/lib/analytics";

export default function CombinedPage() {
  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["combined", "summary", "month", "net"],
    queryFn: async () => {
      const res = await fetch("/api/combined/summary?period=month&metricType=net");
      if (!res.ok) throw new Error("Failed to fetch combined summary");
      return res.json() as Promise<{
        total: number;
        messages: number;
        tips: number;
        subscriptions: number;
        fanvue: { total: number; messages: number; tips: number; subscriptions: number } | null;
        infloww: null;
      }>;
    },
  });

  const { data: combined, isLoading: combinedLoading, error } = useQuery({
    queryKey: ["combined", "daily"],
    queryFn: () => {
      const infloww = normalizeInfloww(getMockDailyStatsInfloww());
      const fanvue = normalizeFanvue(getMockDailyStatsFanvue());
      return combineUnifiedStats(infloww, fanvue);
    },
  });

  const isLoading = combinedLoading;
  if (isLoading || !combined) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 animate-pulse rounded bg-white/10" />
        <div className="h-64 animate-pulse rounded bg-white/10" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-red-400">
        Failed to load combined data. {error instanceof Error ? error.message : "Unknown error."}
      </p>
    );
  }

  const chartData = combined.map((d) => ({
    date: d.date,
    revenue: Math.round(d.revenue * 100) / 100,
    subscribers: d.subscribers,
    tips: d.tips,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">Combined</h1>
        <p className="text-zinc-400">
          Merged metrics from Infloww + Fanvue (sum/union). Totals from Fanvue creator earnings (UTC+2).
        </p>
      </div>

      {summary && (
        <Card className="glass-panel border-white/[0.08] bg-white/[0.02]">
          <CardHeader>
            <CardTitle className="text-white">Combined total (this month)</CardTitle>
            <CardDescription className="text-zinc-400">
              Source: Fanvue creator daily earnings
              {summary.infloww === null ? " (Infloww not yet connected)" : " + Infloww"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold text-white">
              ${typeof summary.total === "number" ? summary.total.toFixed(2) : "0.00"}
            </p>
            {!summaryLoading && summary.fanvue && (
              <p className="mt-1 text-sm text-zinc-500">
                Fanvue: ${summary.fanvue.total.toFixed(2)} · Messages: ${summary.fanvue.messages.toFixed(2)} · Tips: ${summary.fanvue.tips.toFixed(2)}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="glass-panel border-white/[0.08] bg-white/[0.02]">
        <CardHeader>
          <CardTitle className="text-white">Combined daily metrics</CardTitle>
          <CardDescription className="text-zinc-400">Placeholder chart (combineUnifiedStats)</CardDescription>
        </CardHeader>
        <CardContent>
          <PlaceholderLineChart
            data={chartData}
            dataKeys={[
              { key: "revenue", color: "hsl(330 81% 60%)" },
              { key: "subscribers", color: "hsl(142, 76%, 36%)" },
              { key: "tips", color: "hsl(38, 92%, 50%)" },
            ]}
          />
        </CardContent>
      </Card>

      <Card className="glass-panel border-white/[0.08] bg-white/[0.02]">
        <CardHeader>
          <CardTitle className="text-white">Combined table</CardTitle>
          <CardDescription className="text-zinc-400">Sources column shows which providers contributed</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Sources</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Subscribers</TableHead>
                <TableHead className="text-right">Tips</TableHead>
                <TableHead className="text-right">Messages</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {combined.slice(-7).reverse().map((r) => (
                <TableRow key={r.date}>
                  <TableCell className="font-medium">{r.date}</TableCell>
                  <TableCell>{r.sources.join(", ")}</TableCell>
                  <TableCell className="text-right">${r.revenue.toFixed(2)}</TableCell>
                  <TableCell className="text-right">{r.subscribers}</TableCell>
                  <TableCell className="text-right">{r.tips}</TableCell>
                  <TableCell className="text-right">{r.messages}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
