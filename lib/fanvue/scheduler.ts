/**
 * Fanvue background sync scheduler.
 *
 * Mirrors the Infloww scheduler: every FANVUE_SYNC_INTERVAL_MS (default 5 min)
 * it runs runFanvueSync(period="month") for each CONNECTED Fanvue provider
 * connection, so the dashboard stays current without anyone clicking "Sync".
 *
 * Notes:
 *   • Non-overlapping: a tick is skipped if the previous run is still going.
 *   • No-op when no Fanvue connection is CONNECTED.
 *   • On a Render instance that idles/spins down, the interval dies with it —
 *     use a paid instance or an external cron hitting POST /api/fanvue/sync.
 */

import { prisma } from "@/lib/db";
import { runFanvueSync, type RunFanvueSyncResult } from "./run-sync";

const PROVIDER = "FANVUE";
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const MIN_INTERVAL_MS = 60 * 1000;
// "month" covers today + this week + this month in one pull.
const SYNC_PERIOD = "month" as const;

export type FanvueSyncStatus = {
  running: boolean;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastOk: boolean | null;
  lastError: string | null;
  connectionsSynced: number;
  runCount: number;
  intervalMs: number;
};

const g = globalThis as unknown as {
  __fanvueScheduler?: {
    timer: ReturnType<typeof setInterval> | null;
    status: FanvueSyncStatus;
  };
};

function getIntervalMs(): number {
  const raw = parseInt(process.env.FANVUE_SYNC_INTERVAL_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= MIN_INTERVAL_MS) return raw;
  return DEFAULT_INTERVAL_MS;
}

function state() {
  if (!g.__fanvueScheduler) {
    g.__fanvueScheduler = {
      timer: null,
      status: {
        running: false,
        lastStartedAt: null,
        lastFinishedAt: null,
        lastOk: null,
        lastError: null,
        connectionsSynced: 0,
        runCount: 0,
        intervalMs: getIntervalMs(),
      },
    };
  }
  return g.__fanvueScheduler;
}

export function getFanvueSyncStatus(): FanvueSyncStatus {
  return { ...state().status, intervalMs: getIntervalMs() };
}

/**
 * Sync every CONNECTED Fanvue connection now. Non-overlapping: returns null if a
 * run is already in progress.
 */
export async function runFanvueSyncNow(): Promise<RunFanvueSyncResult[] | null> {
  const s = state();
  if (s.status.running) return null;

  s.status.running = true;
  s.status.lastStartedAt = new Date().toISOString();
  s.status.lastError = null;
  try {
    const connections = await prisma.providerConnection.findMany({
      where: { provider: PROVIDER, status: "CONNECTED", NOT: { accessToken: null } },
      select: { userId: true, accessToken: true },
    });

    const results: RunFanvueSyncResult[] = [];
    let synced = 0;
    for (const conn of connections) {
      if (!conn.accessToken) continue;
      try {
        results.push(await runFanvueSync(conn.userId, conn.accessToken, SYNC_PERIOD));
        synced++;
      } catch (err) {
        s.status.lastError = err instanceof Error ? err.message : String(err);
        console.error(`[fanvue-scheduler] sync failed for user ${conn.userId}:`, s.status.lastError);
      }
    }
    s.status.connectionsSynced = synced;
    s.status.lastOk = s.status.lastError === null;
    return results;
  } catch (err) {
    s.status.lastOk = false;
    s.status.lastError = err instanceof Error ? err.message : String(err);
    console.error("[fanvue-scheduler] run failed:", s.status.lastError);
    return null;
  } finally {
    s.status.running = false;
    s.status.lastFinishedAt = new Date().toISOString();
    s.status.runCount += 1;
  }
}

/** Start the recurring Fanvue sync. Idempotent — safe to call once on boot. */
export function startFanvueScheduler(): void {
  const s = state();
  if (s.timer) return;

  const intervalMs = getIntervalMs();
  console.log(`[fanvue-scheduler] starting — every ${Math.round(intervalMs / 1000)}s`);

  // First run shortly after boot (offset from the Infloww kick so they don't collide).
  setTimeout(() => {
    void runFanvueSyncNow();
  }, 20_000);

  s.timer = setInterval(() => {
    void runFanvueSyncNow();
  }, intervalMs);

  if (typeof s.timer.unref === "function") s.timer.unref();
}
