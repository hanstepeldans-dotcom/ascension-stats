"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MonthlyRevenueChart } from "@/components/charts/monthly-revenue-chart";
import type { TimeRange } from "@/components/dashboard/TimeRangeSegment";
import {
  EarningsOverview,
  type EarningsOverviewData,
  type MetricType,
} from "@/components/dashboard/EarningsOverview";
import { getBucharestTimezoneLabel } from "@/lib/time/fanvue-range";

function getPeriodLabel(range: TimeRange): string {
  switch (range) {
    case "yesterday": return "Yesterday";
    case "today":     return "Today";
    case "this_week": return "This week";
    case "this_month": return "This month";
    default:          return "This week";
  }
}

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("this_week");
  const [metricType, setMetricType] = useState<MetricType>("net");

  // Combined Fanvue + Infloww summary for the selected period
  const { data: summaryData } = useQuery({
    queryKey: ["dashboard-summary", timeRange, metricType],
    staleTime: 0,
    // Auto-poll so always-on displays (e.g. a TV) update without interaction.
    // refetchIntervalInBackground is required: a TV tab is never "focused".
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const res = await fetch(
        `/api/dashboard/summary?period=${timeRange}&metricType=${metricType}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to fetch dashboard summary");
      return res.json() as Promise<EarningsOverviewData>;
    },
  });

  const overviewData = useMemo((): EarningsOverviewData => {
    if (!summaryData) {
      return { totalEarnings: 0, subscriptions: 0, posts: 0, messages: 0, tips: 0, referrals: 0, streams: 0 };
    }
    return summaryData;
  }, [summaryData]);

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  // Revenue chart — already uses real data from both sources
  const { data: dashboardRevenue } = useQuery({
    queryKey: ["dashboard-revenue", currentYear, currentMonth, metricType],
    staleTime: 0,
    refetchInterval: 60_000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const res = await fetch(
        `/api/dashboard/revenue?year=${currentYear}&month=${currentMonth}&metricType=${metricType}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to fetch revenue");
      const json = await res.json();
      return json as { dates: string[]; fanvue: number[]; infloww: number[]; total: number[] };
    },
  });

  const chartData = useMemo(() => {
    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
    const byDate: Record<string, { fanvue: number; infloww: number; total: number }> = {};
    if (dashboardRevenue?.dates?.length) {
      dashboardRevenue.dates.forEach((date, i) => {
        byDate[date] = {
          fanvue: dashboardRevenue.fanvue[i] ?? 0,
          infloww: dashboardRevenue.infloww[i] ?? 0,
          total: dashboardRevenue.total[i] ?? 0,
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
  }, [dashboardRevenue, currentYear, currentMonth]);

  const currentMonthLabel = useMemo(() => {
    return new Date(currentYear, currentMonth - 1, 1).toLocaleDateString("en-US", {
      month: "long",
      year: "numeric",
    });
  }, [currentYear, currentMonth]);

  const periodLabel = getPeriodLabel(timeRange);
  const timezone = getBucharestTimezoneLabel();

  return (
    <div className="space-y-6">
      <EarningsOverview
        data={overviewData}
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
          <MonthlyRevenueChart data={chartData} />
        </CardContent>
      </Card>
    </div>
  );
}
