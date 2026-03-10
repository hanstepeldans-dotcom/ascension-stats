import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import {
  buildFanvueAuthUrl,
  computeCodeChallenge,
  generateCodeVerifier,
  getFanvueOAuthEnv,
} from "@/lib/providers/fanvue/oauth";

const PROVIDER = "FANVUE";
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * GET /api/fanvue/oauth/start
 *
 * Redirects to Fanvue OAuth. Supports ?fresh=1 to force a clean re-authorization:
 * clears all local token/state fields and adds prompt=consent + max_age=0 to the
 * authorize URL so the provider shows a fresh approval screen.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL("/login", process.env.APP_BASE_URL ?? "http://localhost:3000"));
  }

  try {
    getFanvueOAuthEnv();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fanvue OAuth not configured";
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(msg)}`, process.env.APP_BASE_URL ?? "http://localhost:3000")
    );
  }

  const fresh = req.nextUrl.searchParams.get("fresh") === "1";

  const state = randomBytes(32).toString("hex");
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = computeCodeChallenge(codeVerifier);
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);

  await prisma.providerConnection.upsert({
    where: {
      userId_provider: { userId: session.user.id, provider: PROVIDER },
    },
    create: {
      userId: session.user.id,
      provider: PROVIDER,
      status: "DISCONNECTED",
      oauthState: state,
      oauthStateExpiresAt: expiresAt,
      pkceVerifier: codeVerifier,
      pkceVerifierExpiresAt: expiresAt,
    },
    update: {
      // Always clear stale tokens so the new flow cannot reuse a narrower-scoped token.
      accessToken: null,
      refreshToken: null,
      lastError: null,
      lastDebugJson: Prisma.JsonNull,
      status: "DISCONNECTED",
      oauthState: state,
      oauthStateExpiresAt: expiresAt,
      pkceVerifier: codeVerifier,
      pkceVerifierExpiresAt: expiresAt,
    },
  });

  const authUrl = buildFanvueAuthUrl(
    state,
    codeChallenge,
    fresh ? { prompt: "consent", maxAge: 0 } : undefined
  );
  return NextResponse.redirect(authUrl, 302);
}
