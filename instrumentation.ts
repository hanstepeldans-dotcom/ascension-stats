/**
 * Runs when the Node server boots (next dev / next start).
 * Validates required env so the app fails fast with a clear message.
 * Skips during next build so build can run without a real .env.
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { validateEnv } = await import("./lib/env");
    validateEnv();

    // Start the Infloww background sync (every INFLOWW_SYNC_INTERVAL_MS, default 5 min).
    // No-op when INFLOWW_API_KEY / INFLOWW_AGENCY_OID are not set.
    const { startInflowwScheduler } = await import("./lib/infloww/scheduler");
    startInflowwScheduler();

    // Start the Fanvue background sync (every FANVUE_SYNC_INTERVAL_MS, default 5 min).
    // No-op when no Fanvue connection is CONNECTED.
    const { startFanvueScheduler } = await import("./lib/fanvue/scheduler");
    startFanvueScheduler();
  }
}
