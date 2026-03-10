import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authOptions } from "@/lib/auth/config";
import {
  buildFanvueAuthUrl,
  computeCodeChallenge,
  generateCodeVerifier,
  getFanvueRedirectUri,
  getFanvueOAuthEnv,
} from "@/lib/providers/fanvue/oauth";

/**
 * GET /api/fanvue/oauth/debug – return the built authorize URL (no secrets). Dev only. Auth required.
 * Supports ?fresh=1 to preview the URL that would be generated with prompt=consent + max_age=0.
 */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    getFanvueOAuthEnv();
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Fanvue not configured" },
      { status: 400 }
    );
  }

  const fresh = req.nextUrl.searchParams.get("fresh") === "1";

  const state = randomBytes(8).toString("hex");
  const verifier = generateCodeVerifier();
  const challenge = computeCodeChallenge(verifier);
  const freshOptions = fresh ? { prompt: "consent", maxAge: 0 } : undefined;
  const authorizeUrl = buildFanvueAuthUrl(state, challenge, freshOptions);
  const redirectUri = getFanvueRedirectUri();
  const env = getFanvueOAuthEnv();
  const requiredScopes = "openid offline_access offline";
  const scope = (requiredScopes + (env.scopes ? " " + env.scopes : "")).trim();

  return NextResponse.json({
    authorizeUrl,
    authorizeUrlHost: new URL(env.authorizationUrl).host,
    redirectUri,
    scope,
    hasState: true,
    hasCodeChallenge: true,
    codeChallengeMethod: "S256",
    prompt: freshOptions?.prompt ?? null,
    maxAge: freshOptions?.maxAge ?? null,
    freshMode: fresh,
  });
}
