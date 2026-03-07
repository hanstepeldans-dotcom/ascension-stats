"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface MetricTileProps {
  label: string;
  amount: number;
  format?: "currency" | "number";
  icon: React.ReactNode;
  iconBubbleClassName?: string;
  className?: string;
}

export function MetricTile({
  label,
  amount,
  format = "currency",
  icon,
  iconBubbleClassName = "bg-pink/10 text-pink",
  className,
}: MetricTileProps) {
  const display =
    format === "currency" ? currencyFormatter.format(amount) : amount.toLocaleString();

  return (
    <div
      className={cn(
        "flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm",
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
          iconBubbleClassName
        )}
      >
        {icon}
      </div>
    </div>
  );
}
