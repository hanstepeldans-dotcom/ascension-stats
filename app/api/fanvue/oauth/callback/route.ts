import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  exchangeCodeForTokens,
  getFanvueRedirectUri,
  TokenExchangeError,
} from "@/lib/providers/fanvue/oauth";

const PROVIDER = "FANVUE";
const baseUrl = () =>
  process.env.APP_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

/** Redirect to login with next= so after login user lands on settings with banner. No session required. */
function redirectToLoginWithNext(settingsQuery: string): NextResponse {
  const loginUrl = new URL("/login", baseUrl());
  loginUrl.searchParams.set("next", "/settings?" + settingsQuery);
  return NextResponse.redirect(loginUrl.toString(), 302);
}

/** GET /api/fanvue/oauth/callback – handle Fanvue redirect. User identified by state only (no session required). */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const errorParam = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  if (process.env.NODE_ENV !== "production") {
    const reason = errorParam ? "fanvue_error" : !state ? "missing_state" : "processing";
    console.log("Fanvue callback hit", { hasCode: !!code, hasState: !!state, reason });
  }

  // Fanvue returned an error (e.g. user denied)
  if (errorParam) {
    const msg = (errorDescription?.trim() || errorParam).slice(0, 200);
    if (state) {
      const conn = await prisma.providerConnection.findUnique({ where: { oauthState: state } });
      if (conn) {
        await prisma.providerConnection.update({
          where: { id: conn.id },
          data: {
            status: "ERROR",
            lastError: msg,
            oauthState: null,
            oauthStateExpiresAt: null,
            pkceVerifier: null,
            pkceVerifierExpiresAt: null,
          },
        });
      }
    }
    const q = new URLSearchParams({ fanvue_error: "1", ...(msg ? { error: msg } : {}) }).toString();
    return redirectToLoginWithNext(q);
  }

  if (!state || !code) {
    const q = new URLSearchParams({ fanvue_error: "1", reason: !state ? "missing_state" : "missing_code" }).toString();
    return redirectToLoginWithNext(q);
  }

  const connection = await prisma.providerConnection.findUnique({
    where: { oauthState: state },
  });

  if (!connection) {
    return redirectToLoginWithNext("fanvue_error=1&reason=state_not_found");
  }
  if (connection.oauthStateExpiresAt && connection.oauthStateExpiresAt < new Date()) {
    await prisma.providerConnection.update({
      where: { id: connection.id },
      data: { oauthState: null, oauthStateExpiresAt: null },
    });
    return redirectToLoginWithNext("fanvue_error=1&reason=state_expired");
  }

  const codeVerifier = connection.pkceVerifier;
  if (!codeVerifier || (connection.pkceVerifierExpiresAt && connection.pkceVerifierExpiresAt < new Date())) {
    await prisma.providerConnection.update({
      where: { id: connection.id },
      data: { oauthState: null, oauthStateExpiresAt: null, pkceVerifier: null, pkceVerifierExpiresAt: null },
    });
    return redirectToLoginWithNext("fanvue_error=1&reason=pkce_missing");
  }

  /** Sanitize for storage: no tokens or secrets, max length. */
  function sanitizeError(msg: string): string {
    const s = msg
      .replace(/access_token[\s=][^\s]+/gi, "access_token=***")
      .replace(/refresh_token[\s=][^\s]+/gi, "refresh_token=***")
      .replace(/client_secret[\s=][^\s&]+/gi, "client_secret=***")
      .replace(/code_verifier[\s=][^\s&]+/gi, "code_verifier=***")
      .trim();
    return s.length > 200 ? s.slice(0, 197) + "…" : s;
  }

  let result: { tokens: { access_token: string; refresh_token?: string | null }; authMethodUsed: "none" | "basic" };
  try {
    const redirectUri = getFanvueRedirectUri();
    result = await exchangeCodeForTokens(code, redirectUri, codeVerifier);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Token exchange failed";
    const safeMsg = sanitizeError(msg);
    const isTokenError = e instanceof TokenExchangeError;
    const oneLineError = isTokenError
      ? `token_exchange_failed: ${e.diagnostics.status} ${e.diagnostics.responseJson?.error ?? "error"}`
      : safeMsg;
    const lastDebugJson =
      process.env.NODE_ENV !== "production" && isTokenError ? e.diagnostics : null;
    await prisma.providerConnection.update({
      where: { id: connection.id },
      data: {
        status: "ERROR",
        lastError: oneLineError.slice(0, 200),
        lastDebugJson: lastDebugJson !== null ? (lastDebugJson as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        oauthState: null,
        oauthStateExpiresAt: null,
        pkceVerifier: null,
        pkceVerifierExpiresAt: null,
      },
    });
    return redirectToLoginWithNext("fanvue_error=1&error=" + encodeURIComponent(msg));
  }

  const successDebugJson =
    process.env.NODE_ENV !== "production"
      ? ({ finalAuthMethodUsed: result.authMethodUsed } as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;

  await prisma.providerConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: result.tokens.access_token,
      refreshToken: result.tokens.refresh_token ?? null,
      status: "CONNECTED",
      connectedAt: new Date(),
      lastError: null,
      lastDebugJson: successDebugJson,
      oauthState: null,
      oauthStateExpiresAt: null,
      pkceVerifier: null,
      pkceVerifierExpiresAt: null,
    },
  });

  if (process.env.NODE_ENV !== "production") {
    console.log("Fanvue OAuth success for user id:", connection.userId);
  }

  // Always send to login with next= so after login they land on settings with success banner (avoids session/cookie issues).
  return redirectToLoginWithNext("fanvue_connected=1");
}
