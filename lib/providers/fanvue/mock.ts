/**
 * Mock daily stats for Fanvue. Replace with real API fetch later.
 */
import type { DailyStatRow, UnifiedDailyStat } from "../types";

function generateMockDates(days: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(x.getDate() - i);
    dates.push(x.toISOString().slice(0, 10));
  }
  return dates;
}

export function getMockDailyStats(provider: "fanvue"): DailyStatRow[] {
  const dates = generateMockDates(14);
  return dates.map((date, i) => ({
    date,
    revenue: 80 + Math.cos(i * 0.3) * 25 + Math.random() * 20,
    subscribers: Math.floor(450 + i * 3 + Math.random() * 15),
    tips: Math.floor(30 + Math.random() * 20),
    messages: Math.floor(20 + Math.random() * 10),
  }));
}

export function getMockDailyStatsFanvue(): DailyStatRow[] {
  return getMockDailyStats("fanvue");
}

/** Normalize Fanvue-specific payload to unified schema. */
export function normalizeToUnifiedSchema(rows: DailyStatRow[]): UnifiedDailyStat[] {
  return rows.map((r) => ({
    date: r.date,
    revenue: r.revenue,
    subscribers: r.subscribers,
    tips: r.tips,
    messages: r.messages ?? 0,
  }));
}
