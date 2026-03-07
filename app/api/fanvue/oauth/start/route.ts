import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
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

/** GET /api/fanvue/oauth/start – redirect to Fanvue OAuth (client_id, redirect_uri, response_type=code, scope, state, code_challenge, code_challenge_method=S256). No JSON. */
export async function GET() {
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
      oauthState: state,
      oauthStateExpiresAt: expiresAt,
      pkceVerifier: codeVerifier,
      pkceVerifierExpiresAt: expiresAt,
    },
  });

  const authUrl = buildFanvueAuthUrl(state, codeChallenge);
  return NextResponse.redirect(authUrl, 302);
}
