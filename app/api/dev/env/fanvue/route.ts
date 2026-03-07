import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import {
  FANVUE_DEFAULT_API_BASE_URL,
  FANVUE_DEFAULT_AUTHORIZATION_URL,
  FANVUE_DEFAULT_TOKEN_URL,
} from "@/lib/providers/fanvue/config";

const bodySchema = z.object({
  clientId: z.string().min(1, "Client ID is required").transform((s) => s.trim()),
  clientSecret: z.string().min(1, "Client secret is required").transform((s) => s.trim()),
});

const FANVUE_VARS: Record<string, string> = {
  FANVUE_AUTHORIZATION_URL: FANVUE_DEFAULT_AUTHORIZATION_URL,
  FANVUE_TOKEN_URL: FANVUE_DEFAULT_TOKEN_URL,
  FANVUE_API_BASE_URL: FANVUE_DEFAULT_API_BASE_URL,
  APP_BASE_URL: "http://localhost:3000",
};

function getEnvPath(): string {
  return join(process.cwd(), ".env");
}

function parseEnvKey(line: string): string | null {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
  return match ? match[1] : null;
}

/**
 * POST /api/dev/env/fanvue – write Fanvue credentials + defaults to .env (development only, ADMIN only).
 * Never returns or logs the client secret.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { clientId, clientSecret } = parsed.data;

  const envPath = getEnvPath();
  let lines: string[] = [];
  const seen = new Set<string>();

  if (existsSync(envPath)) {
    const content = readFileSync(envPath, "utf-8");
    const rawLines = content.split(/\r?\n/);
    for (const line of rawLines) {
      const key = parseEnvKey(line);
      if (key && (key.startsWith("FANVUE_") || key === "APP_BASE_URL")) {
        if (key === "FANVUE_CLIENT_ID") {
          lines.push(`FANVUE_CLIENT_ID=${clientId}`);
          seen.add("FANVUE_CLIENT_ID");
        } else if (key === "FANVUE_CLIENT_SECRET") {
          lines.push(`FANVUE_CLIENT_SECRET=${clientSecret}`);
          seen.add("FANVUE_CLIENT_SECRET");
        } else {
          const defaultVal = FANVUE_VARS[key];
          if (defaultVal !== undefined) {
            lines.push(`${key}=${defaultVal}`);
            seen.add(key);
          } else {
            lines.push(line);
            seen.add(key);
          }
        }
      } else {
        lines.push(line);
        if (key) seen.add(key);
      }
    }
  }

  const toSet: Record<string, string> = {
    FANVUE_CLIENT_ID: clientId,
    FANVUE_CLIENT_SECRET: clientSecret,
    ...FANVUE_VARS,
  };

  for (const [key, value] of Object.entries(toSet)) {
    if (seen.has(key)) continue;
    lines.push(`${key}=${value}`);
  }

  const out = lines.join("\n") + (lines.length && !lines[lines.length - 1]?.endsWith("\n") ? "\n" : "");
  writeFileSync(envPath, out, "utf-8");

  return NextResponse.json({ ok: true });
}
