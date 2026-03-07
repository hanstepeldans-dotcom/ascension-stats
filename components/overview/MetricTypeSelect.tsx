"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export type MetricTypeValue = "net" | "gross";

const OPTIONS: { value: MetricTypeValue; label: string }[] = [
  { value: "net", label: "Net earnings" },
  { value: "gross", label: "Gross earnings" },
];

interface MetricTypeSelectProps {
  value: MetricTypeValue;
  onChange: (value: MetricTypeValue) => void;
  className?: string;
}

export function MetricTypeSelect({ value, onChange, className }: MetricTypeSelectProps) {
  const label = OPTIONS.find((o) => o.value === value)?.label ?? "Net earnings";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "border-white/10 bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:text-white",
            className
          )}
        >
          {label}
          <ChevronDown className="ml-1 h-4 w-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="border-white/10 bg-zinc-900 text-white"
      >
        {OPTIONS.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className="focus:bg-white/10 focus:text-white"
          >
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
