export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getInflowwSyncStatus } from "@/lib/infloww/scheduler";
import { getFanvueSyncStatus } from "@/lib/fanvue/scheduler";

/**
 * Public, secret-free health/diagnostics for the background syncs. Lets us see
 * from outside whether each scheduler is configured, running, when it last
 * finished, and its last error — without needing a logged-in session.
 */
export async function GET() {
  const infloww = getInflowwSyncStatus();
  const fanvue = getFanvueSyncStatus();
  return NextResponse.json({
    now: new Date().toISOString(),
    version: "2026-09-20-health",
    infloww: {
      configured: infloww.configured,
      running: infloww.running,
      runCount: infloww.runCount,
      lastStartedAt: infloww.lastStartedAt,
      lastFinishedAt: infloww.lastFinishedAt,
      lastOk: infloww.lastOk,
      lastError: infloww.lastError,
      intervalMs: infloww.intervalMs,
      lastResult: infloww.lastResult
        ? {
            creatorsFetched: infloww.lastResult.creatorsFetched,
            creatorsProcessed: infloww.lastResult.creatorsProcessed,
            creatorsFailed: infloww.lastResult.creatorsFailed,
            dailyRowsUpserted: infloww.lastResult.dailyRowsUpserted,
            days: infloww.lastResult.days,
          }
        : null,
    },
    fanvue: {
      running: fanvue.running,
      runCount: fanvue.runCount,
      lastStartedAt: fanvue.lastStartedAt,
      lastFinishedAt: fanvue.lastFinishedAt,
      lastOk: fanvue.lastOk,
      lastError: fanvue.lastError,
      connectionsSynced: fanvue.connectionsSynced,
      intervalMs: fanvue.intervalMs,
    },
  });
}
