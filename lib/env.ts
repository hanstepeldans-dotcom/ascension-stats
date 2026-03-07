/**
 * Runtime env validation. Fails fast on boot if required vars are missing.
 * Dev-friendly: logs which variable is missing.
 */
const required = [
  "DATABASE_URL",
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
] as const;

export function validateEnv(): void {
  const missing = required.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    const msg = `Missing required env: ${missing.join(", ")}. Copy .env.example to .env and fill values.`;
    console.error(msg);
    throw new Error(msg);
  }
}
