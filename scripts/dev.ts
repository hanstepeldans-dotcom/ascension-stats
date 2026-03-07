/**
 * Start Next.js dev server. Prefers port 3000 for OAuth (stable callback URL).
 * If 3000 is taken, exits with instructions instead of auto-switching.
 */
import { spawn } from "node:child_process";
import { isPortInUse } from "./pick-port";

const PREFERRED_PORT = 3000;

async function main(): Promise<void> {
  const inUse = await isPortInUse(PREFERRED_PORT);
  if (inUse) {
    console.error("");
    console.error("  Port 3000 is in use. OAuth requires a stable redirect URL.");
    console.error("  Stop the process using port 3000, or set APP_BASE_URL and the Fanvue redirect URL to your new port.");
    console.error("");
    process.exit(1);
  }

  const port = PREFERRED_PORT;

  console.log("");
  console.log("  App:    http://localhost:" + port);
  console.log("  Login:  http://localhost:" + port + "/login");
  console.log("  Verify: http://localhost:" + port + "/api/auth/verify-seed");
  console.log("");

  const baseUrl = "http://localhost:" + port;
  const child = spawn("npx", ["next", "dev", "-p", String(port)], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, PORT: String(port), NEXTAUTH_URL: baseUrl },
  });

  child.on("error", (err) => {
    console.error(err);
    process.exit(1);
  });
  child.on("exit", (code) => {
    process.exit(code ?? 0);
  });
}

main();
