/**
 * Find first free port in 3000–3010. Prints the port number to stdout.
 * Used by scripts/dev.ts and "npm run dev:port".
 */
import net from "node:net";

const MIN = 3000;
const MAX = 3010;

export function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const onDone = (inUse: boolean) => {
      socket.destroy();
      resolve(inUse);
    };
    socket.setTimeout(500);
    socket.once("error", () => onDone(false));
    socket.once("timeout", () => onDone(false));
    socket.connect(port, "127.0.0.1", () => onDone(true));
  });
}

export async function getAvailablePort(): Promise<number> {
  for (let p = MIN; p <= MAX; p++) {
    const inUse = await isPortInUse(p);
    if (!inUse) return p;
  }
  return MIN;
}

async function main(): Promise<void> {
  const port = await getAvailablePort();
  process.stdout.write(String(port));
}

main();
