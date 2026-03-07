"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  EarningsOverviewLayout,
  type EarningsOverviewMetrics,
  type PeriodValue,
  type MetricTypeValue,
} from "@/components/overview/EarningsOverviewLayout";
import { ModelsEarningsTable } from "@/components/overview/ModelsEarningsTable";

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
  total: 0,
  subscriptions: 0,
  posts: 0,
  messages: 0,
  tips: 0,
  referrals: 0,
  streams: 0,
};

export default function InflowwPage() {
  const [period, setPeriod] = useState<PeriodValue>("week");
  const [metricType, setMetricType] = useState<MetricTypeValue>("net");

  const { data: modelsData } = useQuery({
    queryKey: ["infloww", "earnings-by-model", period, metricType],
    queryFn: async () => {
      const res = await fetch(
        `/api/infloww/earnings-by-model?period=${period}&metricType=${metricType}`
      );
      if (!res.ok) throw new Error("Failed to fetch model earnings");
      const json = await res.json();
      return json as { models: { modelId: string; modelName: string; total: number; messages: number; tips: number; subscriptions: number }[] };
    },
  });

  const modelRows = modelsData?.models ?? [];

  return (
    <div className="space-y-6">
      <EarningsOverviewLayout
        title="Creator earnings overview"
        timezoneLabel="UTC+02:00"
        data={ZERO_METRICS}
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
    </div>
  );
}
