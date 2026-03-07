"use client";

import { cn } from "@/lib/utils";

export type TimeRange = "yesterday" | "today" | "this_week" | "this_month";

const SEGMENTS: { value: TimeRange; label: string }[] = [
  { value: "yesterday", label: "Yesterday" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "this_month", label: "This month" },
];

interface TimeRangeSegmentProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  className?: string;
}

export function TimeRangeSegment({ value, onChange, className }: TimeRangeSegmentProps) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg border border-white/10 bg-white/[0.03] p-0.5",
        className
      )}
      role="tablist"
      aria-label="Date range"
    >
      {SEGMENTS.map((seg) => (
        <button
          key={seg.value}
          type="button"
          role="tab"
          aria-selected={value === seg.value}
          onClick={() => onChange(seg.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            value === seg.value
              ? "bg-pink/20 text-pink shadow-sm"
              : "text-zinc-400 hover:bg-white/5 hover:text-white"
          )}
        >
          {seg.label}
        </button>
      ))}
    </div>
  );
}
