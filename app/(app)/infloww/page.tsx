"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  EarningsOverviewLayout,
  type EarningsOverviewMetrics,
  type PeriodValue,
  type MetricTypeValue,
} from "@/components/overview/EarningsOverviewLayout";
import { ModelsEarningsTable } from "@/components/overview/ModelsEarningsTable";
import { ChattingAnalyticsTable } from "@/components/overview/ChattingAnalyticsTable";

const PERIOD_LABELS: Record<PeriodValue, string> = {
  yesterday: "Yesterday",
  today: "Today",
  week: "This week",
  month: "This month",
};

const METRIC_TYPE_LABELS: Record<MetricTypeValue, string> = {
  net: "Net earnings",
  gross: "Gross earnings",
};

const ZERO_METRICS: EarningsOverviewMetrics = {
  total: 0, subscriptions: 0, posts: 0,
  messages: 0, tips: 0, referrals: 0, streams: 0,
};

const MANUAL_SUBS_KEY = "infloww-manual-subs";

export default function InflowwPage() {
  const [period, setPeriod] = useState<PeriodValue>("week");
  const [metricType, setMetricType] = useState<MetricTypeValue>("net");

  const [manualSubs, setManualSubs] = useState<Record<string, number>>(() => {
    if (typeof window === "undefined") return {};
    try {
      return JSON.parse(localStorage.getItem(MANUAL_SUBS_KEY) ?? "{}") as Record<string, number>;
    } catch {
      return {};
    }
  });

  const handleSubsChange = (modelId: string, value: number) => {
    setManualSubs((prev) => {
      const next = { ...prev, [modelId]: value };
      localStorage.setItem(MANUAL_SUBS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const { data: summaryData } = useQuery({
    queryKey: ["infloww", "summary", period, metricType],
    // staleTime:0 ensures every period/metricType switch re-fetches immediately
    // rather than serving a 60-second-old cached result from the global QueryClient.
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(
        `/api/infloww/summary?period=${period}&metricType=${metricType}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to fetch Infloww summary");
      const json = await res.json();
      return json as {
        total: number; subscriptions: number; messages: number;
        tips: number; posts: number; referrals: number; streams: number;
      };
    },
  });

  const metrics: EarningsOverviewMetrics = summaryData ?? ZERO_METRICS;

  const { data: modelsData } = useQuery({
    queryKey: ["infloww", "earnings-by-model", period, metricType],
    staleTime: 0,
    queryFn: async () => {
      const res = await fetch(
        `/api/infloww/earnings-by-model?period=${period}&metricType=${metricType}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Failed to fetch model earnings");
      const json = await res.json();
      return json as {
        models: {
          modelId: string; modelName: string; total: number;
          messages: number; tips: number; subscriptions: number;
          totalSubscribers: number | null;
        }[];
      };
    },
  });

  const modelRows = useMemo(
    () => modelsData?.models ?? [],
    [modelsData?.models]
  );

  const chattingRows = useMemo(
    () =>
      modelRows.map((r) => {
        const subs = r.totalSubscribers ?? manualSubs[r.modelId] ?? 0;
        return {
          modelId: r.modelId,
          modelName: r.modelName,
          newSubscribers: subs,
          chattingRatio: r.subscriptions > 0
            ? Math.round(((r.messages + r.tips) / r.subscriptions) * 100) / 100
            : 0,
          netSubscribers: subs > 0
            ? Math.round(((r.messages + r.tips) / subs) * 100) / 100
            : 0,
        };
      }),
    [modelRows, manualSubs]
  );

  return (
    <div className="space-y-6">
      <EarningsOverviewLayout
        title="Creator earnings overview"
        timezoneLabel="UTC+02:00"
        data={metrics}
        metricType={metricType}
        onMetricTypeChange={setMetricType}
        period={period}
        onPeriodChange={setPeriod}
      />
      <ModelsEarningsTable
        rows={modelRows}
        periodLabel={PERIOD_LABELS[period]}
        metricTypeLabel={METRIC_TYPE_LABELS[metricType]}
      />
      <ChattingAnalyticsTable
        rows={chattingRows}
        periodLabel={PERIOD_LABELS[period]}
        onSubsChange={handleSubsChange}
      />
    </div>
  );
}
