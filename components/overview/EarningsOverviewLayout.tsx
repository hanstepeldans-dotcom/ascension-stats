"use client";

import * as React from "react";
import {
  BadgeCheck,
  Lightbulb,
  FileText,
  MessageCircle,
  UserPlus,
  Radio,
} from "lucide-react";
import { PeriodSelector } from "./PeriodSelector";
import { MetricTypeSelect } from "./MetricTypeSelect";
import type { PeriodValue } from "./PeriodSelector";
import type { MetricTypeValue } from "./MetricTypeSelect";

export type { PeriodValue, MetricTypeValue };
import { MetricCard } from "./MetricCard";
import { TotalEarningsCard } from "./TotalEarningsCard";

export interface EarningsOverviewMetrics {
  total: number;
  subscriptions: number;
  posts: number;
  messages: number;
  tips: number;
  referrals: number;
  streams: number;
}

const METRIC_TYPE_LABELS: Record<MetricTypeValue, string> = {
  net: "Net earnings",
  gross: "Gross earnings",
};

const PERIOD_LABELS: Record<PeriodValue, string> = {
  yesterday: "Yesterday",
  today: "Today",
  week: "This week",
  month: "This month",
};

interface EarningsOverviewLayoutProps {
  title?: string;
  timezoneLabel?: string;
  data: EarningsOverviewMetrics;
  metricType: MetricTypeValue;
  onMetricTypeChange: (value: MetricTypeValue) => void;
  period: PeriodValue;
  onPeriodChange: (value: PeriodValue) => void;
}

const DEFAULT_METRICS: EarningsOverviewMetrics = {
  total: 0,
  subscriptions: 0,
  posts: 0,
  messages: 0,
  tips: 0,
  referrals: 0,
  streams: 0,
};

export function EarningsOverviewLayout({
  title = "Creator earnings overview",
  timezoneLabel = "UTC+02:00",
  data = DEFAULT_METRICS,
  metricType,
  onMetricTypeChange,
  period,
  onPeriodChange,
}: EarningsOverviewLayoutProps) {
  const typeLabel = METRIC_TYPE_LABELS[metricType];
  const periodLabel = PERIOD_LABELS[period];
  const subtitle = `${typeLabel} • ${periodLabel}`;

  return (
    <div className="space-y-6">
      {/* Top bar: title + timezone + controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            {title}
          </h1>
          <span className="text-sm text-zinc-400">{timezoneLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <MetricTypeSelect value={metricType} onChange={onMetricTypeChange} />
          <PeriodSelector value={period} onChange={onPeriodChange} />
        </div>
      </div>

      {/* Main grid: big card left, 6 small cards right (2 rows x 3) — matches Dashboard */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <TotalEarningsCard value={data.total} subtitle={subtitle} />
        </div>
        <div className="grid grid-cols-2 gap-3 border-white/10 sm:gap-4 lg:col-span-2 lg:grid-cols-3">
          <MetricCard
            label="Subscriptions"
            value={data.subscriptions}
            icon={<BadgeCheck className="h-4 w-4" />}
            variantColor="emerald"
          />
          <MetricCard
            label="Posts"
            value={data.posts}
            icon={<FileText className="h-4 w-4" />}
            variantColor="emerald"
          />
          <MetricCard
            label="Messages"
            value={data.messages}
            icon={<MessageCircle className="h-4 w-4" />}
            variantColor="violet"
          />
          <MetricCard
            label="Tips"
            value={data.tips}
            icon={<Lightbulb className="h-4 w-4" />}
            variantColor="sky"
          />
          <MetricCard
            label="Referrals"
            value={data.referrals}
            icon={<UserPlus className="h-4 w-4" />}
            variantColor="pink"
          />
          <MetricCard
            label="Streams"
            value={data.streams}
            icon={<Radio className="h-4 w-4" />}
            variantColor="violet"
          />
        </div>
      </div>
    </div>
  );
}
