/**
 * Mock daily stats for Infloww. Replace with real API fetch later.
 */
import type { DailyStatRow } from "../types";

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

export function getMockDailyStats(provider: "infloww"): DailyStatRow[] {
  const dates = generateMockDates(14);
  return dates.map((date, i) => ({
    date,
    revenue: 120 + Math.sin(i * 0.5) * 40 + Math.random() * 30,
    subscribers: Math.floor(800 + i * 5 + Math.random() * 20),
    tips: Math.floor(50 + Math.random() * 25),
    messages: Math.floor(30 + Math.random() * 15),
  }));
}
