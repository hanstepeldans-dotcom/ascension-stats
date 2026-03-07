/**
 * Combine unified stats from multiple providers (sum/union).
 * TODO: Replace with real aggregation when provider APIs are connected.
 */
import type { UnifiedDailyStat } from "@/lib/providers/types";

export interface CombinedDailyStat extends UnifiedDailyStat {
  sources: string[];
}

/**
 * Merges unified stats by date: sums metrics and unions sources.
 * Assumes both arrays may have overlapping or distinct dates.
 */
export function combineUnifiedStats(
  inflowwUnified: UnifiedDailyStat[],
  fanvueUnified: UnifiedDailyStat[]
): CombinedDailyStat[] {
  const byDate = new Map<string, CombinedDailyStat>();

  for (const row of inflowwUnified) {
    const existing = byDate.get(row.date);
    if (existing) {
      existing.revenue += row.revenue;
      existing.subscribers += row.subscribers;
      existing.tips += row.tips;
      existing.messages += row.messages;
      if (!existing.sources.includes("infloww")) existing.sources.push("infloww");
    } else {
      byDate.set(row.date, {
        ...row,
        sources: ["infloww"],
      });
    }
  }

  for (const row of fanvueUnified) {
    const existing = byDate.get(row.date);
    if (existing) {
      existing.revenue += row.revenue;
      existing.subscribers += row.subscribers;
      existing.tips += row.tips;
      existing.messages += row.messages;
      if (!existing.sources.includes("fanvue")) existing.sources.push("fanvue");
    } else {
      byDate.set(row.date, {
        ...row,
        sources: ["fanvue"],
      });
    }
  }

  return Array.from(byDate.values()).sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );
}
