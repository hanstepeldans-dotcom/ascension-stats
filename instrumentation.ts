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
  }
}
