"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface MetricCardProps {
  label: string;
  value: number;
  format?: "currency" | "number";
  icon: React.ReactNode;
  variantColor?: "pink" | "emerald" | "violet" | "sky" | "amber" | "zinc";
  className?: string;
}

const VARIANT_CLASSES: Record<NonNullable<MetricCardProps["variantColor"]>, string> = {
  pink: "bg-pink/15 text-pink",
  emerald: "bg-emerald-500/15 text-emerald-400",
  violet: "bg-violet-500/15 text-violet-400",
  sky: "bg-sky-500/15 text-sky-400",
  amber: "bg-amber-500/15 text-amber-400",
  zinc: "bg-white/10 text-zinc-300",
};

export function MetricCard({
  label,
  value,
  format = "currency",
  icon,
  variantColor = "pink",
  className,
}: MetricCardProps) {
  const display =
    format === "currency" ? currencyFormatter.format(value) : value.toLocaleString();
  const bubbleClass = VARIANT_CLASSES[variantColor];

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm",
        "transition-colors hover:border-white/15 hover:bg-white/[0.05]",
        className
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-lg font-bold text-white">{display}</div>
        <div className="mt-0.5 text-sm text-zinc-400">{label}</div>
      </div>
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          bubbleClass
        )}
      >
        {icon}
      </div>
    </div>
  );
}
