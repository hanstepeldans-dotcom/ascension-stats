/**
 * Wait for Postgres to be reachable before running migrations.
 * Loads .env from project root, parses DATABASE_URL, polls with TCP until success or 60s.
 */
import path from "node:path";
import net from "node:net";
import { config } from "dotenv";

config({ path: path.resolve(process.cwd(), ".env") });

const DATABASE_URL = process.env.DATABASE_URL;
const MAX_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;

function parseHostPort(url: string): { host: string; port: number } {
  try {
    const parsed = new URL(url.replace(/^postgresql:\/\//i, "http://"));
    return {
      host: parsed.hostname,
      port: parsed.port ? parseInt(parsed.port, 10) : 5432,
    };
  } catch {
    return { host: "localhost", port: 5432 };
  }
}

function tryConnect(host: string, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const onError = (err: Error) => {
      socket.destroy();
      reject(err);
    };
    socket.setTimeout(5000);
    socket.once("error", onError);
    socket.once("timeout", () => {
      socket.destroy();
      reject(new Error("Connection timeout"));
    });
    socket.connect(port, host, () => {
      socket.destroy();
      resolve();
    });
  });
}

async function main(): Promise<void> {
  if (!DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is not set. Copy .env.example to .env and run again.");
    process.exit(1);
  }

  const { host, port } = parseHostPort(DATABASE_URL);
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      await tryConnect(host, port);
      console.log("Postgres is ready at %s:%s", host, port);
      process.exit(0);
    } catch {
      process.stdout.write(".");
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
  }

  console.error("\nDatabase did not become reachable after 60s.");
  console.error("Make sure Docker is running and run: npm run db:up");
  process.exit(1);
}

main();
