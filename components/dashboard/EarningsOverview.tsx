"use client";

import * as React from "react";
import { ChevronDown, TrendingUp, BookmarkPlus, FileText, MessageCircle, Lightbulb, Users, Radio } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { TimeRangeSegment, type TimeRange } from "./TimeRangeSegment";
import { MetricTile } from "./MetricTile";
import { cn } from "@/lib/utils";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type MetricType = "net" | "gross";

export interface EarningsOverviewData {
  totalEarnings: number;
  subscriptions: number;
  posts: number;
  messages: number;
  tips: number;
  referrals: number;
  streams: number;
}

interface EarningsOverviewProps {
  data: EarningsOverviewData;
  timeRange: TimeRange;
  onTimeRangeChange: (value: TimeRange) => void;
  metricType: MetricType;
  onMetricTypeChange: (value: MetricType) => void;
  timezone?: string;
  periodLabel?: string;
}

const METRIC_LABELS: Record<MetricType, string> = {
  net: "Net earnings",
  gross: "Gross earnings",
};

export function EarningsOverview({
  data,
  timeRange,
  onTimeRangeChange,
  metricType,
  onMetricTypeChange,
  timezone = "UTC+02:00",
  periodLabel = "This week",
}: EarningsOverviewProps) {
  const subtext = `${METRIC_LABELS[metricType]} • ${periodLabel}`;

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
            Creator earnings overview
          </h1>
          <span className="text-sm text-zinc-400">{timezone}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:text-white"
              >
                {METRIC_LABELS[metricType]}
                <ChevronDown className="ml-1 h-4 w-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="border-white/10 bg-zinc-900 text-white"
            >
              <DropdownMenuItem
                onClick={() => onMetricTypeChange("net")}
                className="focus:bg-white/10 focus:text-white"
              >
                Net earnings
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onMetricTypeChange("gross")}
                className="focus:bg-white/10 focus:text-white"
              >
                Gross earnings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <TimeRangeSegment value={timeRange} onChange={onTimeRangeChange} />
        </div>
      </div>

      {/* Main content row */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Total earnings card (left, larger) */}
        <Card className="border-white/10 bg-white/[0.04] backdrop-blur-sm lg:col-span-1">
          <CardContent className="flex flex-col items-center pt-6 pb-6 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-pink/15 text-pink">
              <TrendingUp className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-pink/90">Total earnings</p>
            <p
              className={cn(
                "mt-1 text-3xl font-bold tracking-tight sm:text-4xl",
                "bg-gradient-to-r from-pink to-pink-muted bg-clip-text text-transparent"
              )}
            >
              {currencyFormatter.format(data.totalEarnings)}
            </p>
            <p className="mt-1 text-xs text-zinc-500">{subtext}</p>
          </CardContent>
        </Card>

        {/* Metrics grid (right, 2x3) */}
        <div className="grid grid-cols-2 gap-3 border-white/10 sm:gap-4 lg:col-span-2 lg:grid-cols-3">
          <MetricTile
            label="Subscriptions"
            amount={data.subscriptions}
            icon={<BookmarkPlus className="h-4 w-4" />}
            iconBubbleClassName="bg-emerald-500/15 text-emerald-400"
          />
          <MetricTile
            label="Posts"
            amount={data.posts}
            icon={<FileText className="h-4 w-4" />}
            iconBubbleClassName="bg-emerald-500/15 text-emerald-400"
          />
          <MetricTile
            label="Messages"
            amount={data.messages}
            icon={<MessageCircle className="h-4 w-4" />}
            iconBubbleClassName="bg-violet-500/15 text-violet-400"
          />
          <MetricTile
            label="Tips"
            amount={data.tips}
            icon={<Lightbulb className="h-4 w-4" />}
            iconBubbleClassName="bg-sky-500/15 text-sky-400"
          />
          <MetricTile
            label="Referrals"
            amount={data.referrals}
            icon={<Users className="h-4 w-4" />}
            iconBubbleClassName="bg-pink/15 text-pink"
          />
          <MetricTile
            label="Streams"
            amount={data.streams}
            icon={<Radio className="h-4 w-4" />}
            iconBubbleClassName="bg-violet-500/15 text-violet-400"
          />
        </div>
      </div>
    </div>
  );
}
