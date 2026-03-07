import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import {
  FANVUE_DEFAULT_AUTHORIZATION_URL,
  FANVUE_DEFAULT_TOKEN_URL,
  FANVUE_REQUIRED_SCOPES,
} from "@/lib/providers/fanvue/config";

const REQUIRED_SCOPE_PARTS = ["openid", "offline_access", "offline"];
const AUTH_FANVUE_PREFIX = "https://auth.fanvue.com";

export type PreflightResponse = {
  ok: boolean;
  checks: {
    port3000: boolean;
    appBaseUrl: string;
    redirectUri: string;
    authorizationUrl: string;
    tokenUrl: string;
    scope: string;
    hasClientId: boolean;
    hasClientSecret: boolean;
    usesAuthFanvueHost: boolean;
    hasPkce: boolean;
  };
  /** Informational: Basic Auth may be required by Fanvue token endpoint. Not a blocking problem. */
  basicAuthNote: string;
  problems: string[];
  redirectUriHint: string;
};

/** GET /api/fanvue/oauth/preflight – run OAuth config checks (no secrets). Auth required. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const appBaseUrl = (process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "").trim().replace(/\/$/, "") || "http://localhost:3000";
  const redirectUri = `${appBaseUrl}/api/fanvue/oauth/callback`;
  const authorizationUrl = process.env.FANVUE_AUTHORIZATION_URL?.trim() || FANVUE_DEFAULT_AUTHORIZATION_URL;
  const tokenUrl = process.env.FANVUE_TOKEN_URL?.trim() || FANVUE_DEFAULT_TOKEN_URL;
  const rawScopes = (process.env.FANVUE_SCOPES?.trim() ?? FANVUE_REQUIRED_SCOPES)
    .replace(/[,;\n]+/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  const scopeSet = new Set([...REQUIRED_SCOPE_PARTS, ...rawScopes]);
  const scope = [...scopeSet].join(" ");

  const hasClientId = !!process.env.FANVUE_CLIENT_ID?.trim();
  const hasClientSecret = !!process.env.FANVUE_CLIENT_SECRET?.trim();
  const usesAuthFanvueHost = authorizationUrl.startsWith(AUTH_FANVUE_PREFIX);
  const port3000 = /localhost:3000(?:\/|$)/.test(appBaseUrl) || appBaseUrl.endsWith(":3000");

  const checks = {
    port3000,
    appBaseUrl,
    redirectUri,
    authorizationUrl,
    tokenUrl,
    scope,
    hasClientId,
    hasClientSecret,
    usesAuthFanvueHost,
    hasPkce: true,
  };

  const problems: string[] = [];

  if (!port3000) {
    problems.push(
      `APP_BASE_URL is "${appBaseUrl}" but Fanvue redirect is usually set for http://localhost:3000. Run "npm run dev" (port 3000) or set APP_BASE_URL and the Fanvue redirect URL in the Fanvue dashboard to match.`
    );
  }

  if (!hasClientId) {
    problems.push("FANVUE_CLIENT_ID is missing. Paste your Client ID in Settings → Fanvue setup or in .env.");
  }
  if (!hasClientSecret) {
    problems.push("FANVUE_CLIENT_SECRET is missing. Paste your Client Secret in Settings → Fanvue setup or in .env.");
  }

  if (!usesAuthFanvueHost) {
    problems.push(
      `FANVUE_AUTHORIZATION_URL must be https://auth.fanvue.com/oauth2/auth (currently: ${authorizationUrl}). Update .env and restart.`
    );
  }

  const tokenUsesAuth = tokenUrl.startsWith(AUTH_FANVUE_PREFIX);
  if (!tokenUsesAuth) {
    problems.push(
      `FANVUE_TOKEN_URL must be https://auth.fanvue.com/oauth2/token (currently: ${tokenUrl}). Update .env and restart.`
    );
  }

  const hasRequiredScopes = REQUIRED_SCOPE_PARTS.every((s) => scope.toLowerCase().includes(s));
  if (!hasRequiredScopes) {
    problems.push(
      `Scope must include: openid offline_access offline. Current scope: "${scope}". Set FANVUE_SCOPES or leave default.`
    );
  }

  const ok = problems.length === 0;
  const basicAuthNote = hasClientSecret
    ? "FANVUE_CLIENT_SECRET is set. If the token endpoint returns 401 invalid_client, the app will retry with Basic Auth."
    : "FANVUE_CLIENT_SECRET is missing. If Fanvue requires client authentication at the token endpoint, set it to allow automatic Basic Auth retry.";

  return NextResponse.json({
    ok,
    checks,
    basicAuthNote,
    problems,
    redirectUriHint: redirectUri,
  });
}
