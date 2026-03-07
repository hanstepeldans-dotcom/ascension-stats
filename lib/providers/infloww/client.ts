/**
 * Infloww provider – placeholder service.
 * TODO: Replace with real Infloww API client when integrating.
 */

import type { DailyStatRow, UnifiedDailyStat } from "../types";
import { getMockDailyStats } from "./mock";

export function getMockDailyStatsInfloww(): DailyStatRow[] {
  return getMockDailyStats("infloww");
}

/**
 * Normalize Infloww-specific payload to unified schema.
 * TODO: Map real Infloww API response shape to UnifiedDailyStat.
 */
export function normalizeToUnifiedSchema(rows: DailyStatRow[]): UnifiedDailyStat[] {
  return rows.map((r) => ({
    date: r.date,
    revenue: r.revenue,
    subscribers: r.subscribers,
    tips: r.tips,
    messages: r.messages ?? 0,
  }));
}
