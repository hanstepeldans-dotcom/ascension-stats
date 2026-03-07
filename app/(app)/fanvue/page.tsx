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

export default function FanvuePage() {
  const { data: session } = useSession();
  const [period, setPeriod] = useState<PeriodValue>("week");
  const [metricType, setMetricType] = useState<MetricTypeValue>("net");
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
        newSubscribers: r.totalSubscribers ?? 0,
        cancelledSubscribers: 0,
        netSubscribers: 0,
      })),
    [modelRows]
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
