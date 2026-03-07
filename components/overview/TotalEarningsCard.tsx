"use client";

import { TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

interface TotalEarningsCardProps {
  value: number;
  subtitle: string;
  periodLabel?: string;
  typeLabel?: string;
  className?: string;
}

export function TotalEarningsCard({
  value,
  subtitle,
  className,
}: TotalEarningsCardProps) {
  return (
    <Card
      className={cn(
        "border-white/10 bg-white/[0.04] backdrop-blur-sm",
        className
      )}
    >
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
          {currencyFormatter.format(value)}
        </p>
        <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
