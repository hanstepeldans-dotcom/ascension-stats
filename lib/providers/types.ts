/**
 * Shared types for provider stats. Used by Infloww, Fanvue, and combined analytics.
 */

export interface DailyStatRow {
  date: string; // ISO date YYYY-MM-DD
  revenue: number;
  subscribers: number;
  tips: number;
  messages?: number;
}

/** Unified schema after normalizing provider-specific data */
export interface UnifiedDailyStat {
  date: string;
  revenue: number;
  subscribers: number;
  tips: number;
  messages: number;
}
