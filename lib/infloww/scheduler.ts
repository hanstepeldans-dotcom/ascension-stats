/**
 * Infloww background sync scheduler.
 *
 * Runs runInflowwSync() on a fixed interval (INFLOWW_SYNC_INTERVAL_MS, default
 * 5 min) for the lifetime of the Node server. Started once from instrumentation.ts.
 *
 * Notes / limitations:
 *   • This lives in the app process. On a Render service that spins down when idle
 *     (free tier), the interval dies with it — use a paid instance or an external
 *     cron hitting POST /api/infloww/sync for guaranteed cadence.
 *   • Runs are non-overlapping: if a run is still going when the next tick fires,
 *     the tick is skipped.
 *   • Infloww data lags the source platform by ~1h (12h for "loading" rows), so a
 *     5-min cadence refreshes recent days but won't surface brand-new revenue faster
 *     than Infloww itself does.
 */

import { runInflowwSync, resolveInflowwTargetUserIds, type RunInflowwSyncResult } from "./run-sync";
import { isInflowwConfigured } from "@/lib/providers/infloww/api";

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;

export type InflowwSyncStatus = {
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastOk: boolean | null;
  lastError: string | null;
  lastResult: RunInflowwSyncResult | null;
  runCount: number;
  intervalMs: number;
  configured: boolean;
};

// Module-level singleton state (persists across requests in a long-running server).
const g = globalThis as unknown as {
  __inflowwScheduler?: {
    timer: ReturnType<typeof setInterval> | null;
    status: InflowwSyncStatus;
  };
};

function getIntervalMs(): number {
  const raw = parseInt(process.env.INFLOWW_SYNC_INTERVAL_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= MIN_INTERVAL_MS) return raw;
  return DEFAULT_INTERVAL_MS;
}

function state() {
  if (!g.__inflowwScheduler) {
    g.__inflowwScheduler = {
      timer: null,
      status: {
        running: false,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastOk: null,
        lastError: null,
        lastResult: null,
        runCount: 0,
        intervalMs: getIntervalMs(),
        configured: isInflowwConfigured(),
      },
    };
  }
  return g.__inflowwScheduler;
}

export function getInflowwSyncStatus(): InflowwSyncStatus {
  const s = state().status;
  return { ...s, intervalMs: getIntervalMs(), configured: isInflowwConfigured() };
}

/**
 * Run one sync now (used by both the scheduler tick and the manual route).
 * Non-overlapping: returns null if a run is already in progress.
 */
export async function runInflowwSyncNow(opts?: {
  userIds?: string[];
  days?: number;
}): Promise<RunInflowwSyncResult | null> {
  const s = state();
  if (s.status.running) return null;

  s.status.running = true;
  s.status.lastStartedAt = new Date().toISOString();
  s.status.lastError = null;
  try {
    const targetUserIds = opts?.userIds ?? (await resolveInflowwTargetUserIds());
    const result = await runInflowwSync(targetUserIds, { days: opts?.days });
    s.status.lastOk = true;
    s.status.lastResult = result;
    return result;
  } catch (err) {
    s.status.lastOk = false;
    s.status.lastError = err instanceof Error ? err.message : String(err);
    console.error("[infloww-scheduler] sync failed:", s.status.lastError);
    return null;
  } finally {
    s.status.running = false;
    s.status.lastFinishedAt = new Date().toISOString();
    s.status.runCount += 1;
  }
}

/** Start the recurring background sync. Idempotent — safe to call once on boot. */
export function startInflowwScheduler(): void {
  const s = state();
  if (s.timer) return; // already started

  if (!isInflowwConfigured()) {
    console.warn(
      "[infloww-scheduler] not started — INFLOWW_API_KEY / INFLOWW_AGENCY_OID not set"
    );
    return;
  }

  const intervalMs = getIntervalMs();
  console.log(`[infloww-scheduler] starting — every ${Math.round(intervalMs / 1000)}s`);

  // Kick off an initial run shortly after boot, then on the interval.
  setTimeout(() => {
    void runInflowwSyncNow();
  }, 10_000);

  s.timer = setInterval(() => {
    void runInflowwSyncNow();
  }, intervalMs);

  // Don't keep the event loop alive solely for this timer.
  if (typeof s.timer.unref === "function") s.timer.unref();
}
