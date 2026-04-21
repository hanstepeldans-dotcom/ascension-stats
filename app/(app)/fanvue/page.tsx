"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  EarningsOverviewLayout,
  type EarningsOverviewMetrics,
  type PeriodValue,
  type MetricTypeValue,
} from "@/components/overview/EarningsOverviewLayout";
import { getBucharestTimezoneLabel } from "@/lib/time/fanvue-range";
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

const MANUAL_SUBS_KEY = "fanvue-manual-subs";

export default function FanvuePage() {
  const { data: session } = useSession();
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
  const isAdminDev =
    process.env.NODE_ENV !== "production" && session?.user?.role === "ADMIN";

  const { data: summaryData } = useQuery({
    queryKey: ["fanvue", "summary", period, metricType],
    queryFn: async () => {
      const res = await fetch(
        `/api/fanvue/summary?period=${period}&metricType=${metricType}`
      );
      if (!res.ok) throw new Error("Failed to fetch Fanvue summary");
      const json = await res.json();
      return json as { total: number; messages: number; tips: number; subscriptions: number };
    },
  });

  const metrics: EarningsOverviewMetrics = summaryData
    ? {
        total: summaryData.total,
        subscriptions: summaryData.subscriptions,
        posts: 0,
        messages: summaryData.messages,
        tips: summaryData.tips,
        referrals: 0,
        streams: 0,
      }
    : {
        total: 0,
        subscriptions: 0,
        posts: 0,
        messages: 0,
        tips: 0,
        referrals: 0,
        streams: 0,
      };

  const { data: modelsData } = useQuery({
    queryKey: ["fanvue", "earnings-by-model", period, metricType],
    queryFn: async () => {
      const res = await fetch(
        `/api/fanvue/earnings-by-model?period=${period}&metricType=${metricType}`
      );
      if (!res.ok) throw new Error("Failed to fetch model earnings");
      const json = await res.json();
      return json as { models: { modelId: string; modelName: string; total: number; messages: number; tips: number; subscriptions: number; totalSubscribers: number | null }[] };
    },
  });

  const modelRows = useMemo(
    () => modelsData?.models ?? [],
    [modelsData?.models]
  );

  const chattingRows = useMemo(
    () =>
      modelRows.map((r) => ({
        modelId: r.modelId,
        modelName: r.modelName,
        newSubscribers: manualSubs[r.modelId] ?? 0,
        chattingRatio: r.subscriptions > 0
          ? Math.round(((r.messages + r.tips) / r.subscriptions) * 100) / 100
          : 0,
        netSubscribers: (manualSubs[r.modelId] ?? 0) > 0
          ? Math.round(((r.messages + r.tips) / (manualSubs[r.modelId] ?? 0)) * 100) / 100
          : 0,
      })),
    [modelRows, manualSubs]
  );

  return (
    <div className="space-y-6">
      <EarningsOverviewLayout
        title="Creator earnings overview"
        timezoneLabel={getBucharestTimezoneLabel()}
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
      {isAdminDev && (
        <p className="text-xs text-zinc-500">
          <a
            href={`/api/fanvue/debug/earnings-db?period=${period}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-pink-400 hover:underline"
          >
            Debug earnings DB
          </a>
        </p>
      )}
    </div>
  );
}
