"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyRevenueChart } from "@/components/charts/monthly-revenue-chart";
import {
  getMockDailyStatsInfloww,
  normalizeToUnifiedSchema,
} from "@/lib/providers/infloww";
import {
  getMockDailyStatsFanvue,
  normalizeToUnifiedSchema as normalizeFanvue,
} from "@/lib/providers/fanvue";
import { combineUnifiedStats } from "@/lib/analytics";
import type { TimeRange } from "@/components/dashboard/TimeRangeSegment";
import {
  EarningsOverview,
  type EarningsOverviewData,
  type MetricType,
} from "@/components/dashboard/EarningsOverview";

/** Net = 80% of gross, so gross = net / 0.8 = net * 1.25 */
const NET_TO_GROSS_MULTIPLIER = 1.25;

function useDashboardData() {
  return useQuery({
    queryKey: ["dashboard"],
    queryFn: () => {
      const infloww = normalizeToUnifiedSchema(getMockDailyStatsInfloww());
      const fanvue = normalizeFanvue(getMockDailyStatsFanvue());
      const combined = combineUnifiedStats(infloww, fanvue);
      const last = combined[combined.length - 1];
      const prev = combined[combined.length - 2];
      return {
        combined,
        kpis: {
          revenue: last?.revenue ?? 0,
          revenueChange: prev ? ((last!.revenue - prev.revenue) / prev.revenue) * 100 : 0,
          subscribers: last?.subscribers ?? 0,
          subscribersChange: prev ? ((last!.subscribers - prev.subscribers) / prev.subscribers) * 100 : 0,
          tips: last?.tips ?? 0,
          tipsChange: prev ? ((last!.tips - prev.tips) / prev.tips) * 100 : 0,
        },
      };
    },
  });
}

function getPeriodLabel(range: TimeRange): string {
  switch (range) {
    case "yesterday":
      return "Yesterday";
    case "today":
      return "Today";
    case "this_week":
      return "This week";
    case "this_month":
      return "This month";
    default:
      return "This week";
  }
}

function getDatesForRange(range: TimeRange): { start: Date; end: Date } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(today);
  let start = new Date(today);

  switch (range) {
    case "yesterday":
      start.setDate(start.getDate() - 1);
      end.setDate(end.getDate() - 1);
      break;
    case "today":
      start = new Date(today);
      break;
    case "this_week":
      start.setDate(start.getDate() - 6);
      break;
    case "this_month":
      start.setDate(start.getDate() - 29);
      break;
    default:
      start.setDate(start.getDate() - 6);
  }
  return { start, end };
}

/** Sample "today" data from Infloww + Fanvue for preview (Infloww: subs, tips, messages; Fanvue: messages only). */
const SAMPLE_TODAY_DATA: EarningsOverviewData = {
  totalEarnings: 2018.94 + 1735.09, // Infloww total + Fanvue total
  subscriptions: 204.54,   // Infloww
  posts: 0,
  messages: 1782.4 + 1735.09, // Infloww messages + Fanvue (messages only)
  tips: 32,                 // Infloww
  referrals: 0,
  streams: 0,
};

function aggregateByRange(
  combined: { date: string; revenue: number; subscribers: number; tips: number; messages: number }[],
  range: TimeRange
): EarningsOverviewData {
  if (range === "today") return SAMPLE_TODAY_DATA;

  const { start, end } = getDatesForRange(range);
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);

  const filtered = combined.filter((d) => d.date >= startStr && d.date <= endStr);
  const revenue = filtered.reduce((s, d) => s + d.revenue, 0);
  const tips = filtered.reduce((s, d) => s + d.tips, 0);
  const messages = filtered.reduce((s, d) => s + d.messages, 0);

  // Placeholder breakdown: subscriptions/messages as share of revenue; posts, referrals, streams = 0 for now
  const subscriptions = revenue * 0.4;
  const posts = 0;
  const messagesAmount = revenue * 0.3;

  return {
    totalEarnings: revenue,
    subscriptions,
    posts,
    messages: messagesAmount,
    tips,
    referrals: 0,
    streams: 0,
  };
}

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("this_week");
  const [metricType, setMetricType] = useState<MetricType>("net");

  const { data, isLoading, error } = useDashboardData();

  const overviewDataRaw = useMemo((): EarningsOverviewData | null => {
    if (!data?.combined) return null;
    return aggregateByRange(
      data.combined.map((d) => ({
        date: d.date,
        revenue: d.revenue,
        subscribers: d.subscribers,
        tips: d.tips,
        messages: d.messages,
      })),
      timeRange
    );
  }, [data?.combined, timeRange]);

  const overviewData = useMemo((): EarningsOverviewData | null => {
    if (!overviewDataRaw) return null;
    if (metricType === "net") return overviewDataRaw;
    return {
      totalEarnings: overviewDataRaw.totalEarnings * NET_TO_GROSS_MULTIPLIER,
      subscriptions: overviewDataRaw.subscriptions * NET_TO_GROSS_MULTIPLIER,
      posts: overviewDataRaw.posts * NET_TO_GROSS_MULTIPLIER,
      messages: overviewDataRaw.messages * NET_TO_GROSS_MULTIPLIER,
      tips: overviewDataRaw.tips * NET_TO_GROSS_MULTIPLIER,
      referrals: overviewDataRaw.referrals * NET_TO_GROSS_MULTIPLIER,
      streams: overviewDataRaw.streams * NET_TO_GROSS_MULTIPLIER,
    };
  }, [overviewDataRaw, metricType]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const { data: dashboardRevenue } = useQuery({
    queryKey: ["dashboard-revenue", currentYear, currentMonth],
    queryFn: async () => {
      const res = await fetch(
        `/api/dashboard/revenue?year=${currentYear}&month=${currentMonth}`
      );
      if (!res.ok) throw new Error("Failed to fetch revenue");
      const json = await res.json();
      return json as { dates: string[]; fanvue: number[]; infloww: number[]; total: number[] };
    },
  });

  const chartDataFromDashboard = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const mult = metricType === "gross" ? NET_TO_GROSS_MULTIPLIER : 1;
    const rev = dashboardRevenue;
    const byDate: Record<string, { fanvue: number; infloww: number; total: number }> = {};
    if (rev?.dates?.length) {
      rev.dates.forEach((date, i) => {
        byDate[date] = {
          fanvue: (rev.fanvue[i] ?? 0) * mult,
          infloww: (rev.infloww[i] ?? 0) * mult,
          total: (rev.total[i] ?? 0) * mult,
        };
      });
    }
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = new Date(currentYear, currentMonth - 1, i + 1);
      const date =
        d.getFullYear() +
        "-" +
        String(d.getMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getDate()).padStart(2, "0");
      const row = byDate[date];
      return {
        date,
        inflowwCents: Math.round((row?.infloww ?? 0) * 100),
        fanvueCents: Math.round((row?.fanvue ?? 0) * 100),
        agencyCents: Math.round((row?.total ?? 0) * 100),
      };
    });
  }, [dashboardRevenue, metricType, currentYear, currentMonth]);

  const currentMonthLabel = useMemo(() => {
    return new Date(currentYear, currentMonth - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }, [currentYear, currentMonth]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 animate-pulse rounded bg-white/10" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="h-48 animate-pulse rounded-lg bg-white/5" />
          <div className="grid grid-cols-2 gap-3 lg:col-span-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <p className="text-red-400">
        Failed to load dashboard. {error instanceof Error ? error.message : "Unknown error."}
      </p>
    );
  }

  const periodLabel = getPeriodLabel(timeRange);
  const timezone = "UTC+02:00";

  return (
    <div className="space-y-6">
      <EarningsOverview
        data={overviewData ?? { totalEarnings: 0, subscriptions: 0, posts: 0, messages: 0, tips: 0, referrals: 0, streams: 0 }}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        metricType={metricType}
        onMetricTypeChange={setMetricType}
        timezone={timezone}
        periodLabel={periodLabel}
      />

      <Card className="border-white/10 bg-white/[0.04] backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Revenue this month</CardTitle>
          <CardDescription className="text-zinc-400">
            {currentMonthLabel}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MonthlyRevenueChart
            data={chartDataFromDashboard}
          />
        </CardContent>
      </Card>
    </div>
  );
}
