import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
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
 * Use to confirm redirect_uri, scope, state, code_challenge are correct.
 */
export async function GET() {
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

  const state = randomBytes(8).toString("hex");
  const verifier = generateCodeVerifier();
  const challenge = computeCodeChallenge(verifier);
  const authorizeUrl = buildFanvueAuthUrl(state, challenge);
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
  });
}
