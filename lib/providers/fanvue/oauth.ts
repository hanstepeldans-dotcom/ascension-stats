/**
 * Fanvue OAuth 2.0 (authorization code + PKCE) helpers.
 * Uses config.ts for env; PKCE S256 is required by Fanvue.
 */

import { createHash, randomBytes } from "node:crypto";
import { getFanvueConfig, FANVUE_REQUIRED_SCOPES, type FanvueConfig } from "./config";

export type { FanvueConfig as FanvueOAuthEnv } from "./config";

/** Throws if required Fanvue env (CLIENT_ID, CLIENT_SECRET, APP_BASE_URL) is missing. */
export function getFanvueOAuthEnv(): FanvueConfig {
  return getFanvueConfig();
}

/** Returns true if required Fanvue env is set. */
export function isFanvueOAuthConfigured(): boolean {
  try {
    getFanvueOAuthEnv();
    return true;
  } catch {
    return false;
  }
}

/** Build redirect_uri for Fanvue OAuth (callback URL). */
export function getFanvueRedirectUri(): string {
  const { appBaseUrl } = getFanvueOAuthEnv();
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}/api/fanvue/oauth/callback`;
}

/**
 * Generate PKCE code_verifier (43–64 chars, base64url).
 * Per RFC 7636: 32–96 bytes before encoding.
 */
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Compute code_challenge = base64url(SHA256(verifier)).
 */
export function computeCodeChallenge(verifier: string): string {
  const hash = createHash("sha256").update(verifier, "utf8").digest();
  return hash.toString("base64url");
}

/**
 * Normalize scope: replace commas/newlines with spaces, collapse multiple spaces, always include required scopes.
 */
function getFullScopeString(extraScopes: string): string {
  const required = FANVUE_REQUIRED_SCOPES.split(/\s+/).filter(Boolean);
  const normalized = (extraScopes || "")
    .replace(/[,;\n\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const extra = normalized ? normalized.split(" ").filter(Boolean) : [];
  const set = new Set([...required, ...extra]);
  return [...set].join(" ");
}

/** Scope string used in buildFanvueAuthUrl (for display / Copy scopes). Returns empty if config missing. */
export function getRequestedScopeString(): string {
  try {
    const env = getFanvueOAuthEnv();
    return getFullScopeString(env.scopes);
  } catch {
    return "";
  }
}

/** Build the authorization URL with PKCE (code_challenge + code_challenge_method=S256). */
export function buildFanvueAuthUrl(state: string, codeChallenge: string): string {
  const env = getFanvueOAuthEnv();
  const redirectUri = getFanvueRedirectUri();
  const scope = getFullScopeString(env.scopes);
  const params = new URLSearchParams({
    response_type: "code",
    client_id: env.clientId,
    redirect_uri: redirectUri,
    scope,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
  const sep = env.authorizationUrl.includes("?") ? "&" : "?";
  return `${env.authorizationUrl}${sep}${params.toString()}`;
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
}

export type TokenAuthMethod = "none" | "basic";

/** Sanitized token exchange failure details (no secrets). */
export interface TokenExchangeDiagnostics {
  status: number;
  statusText: string;
  tokenUrlHost: string;
  responseJson: { error?: string; error_description?: string } | null;
  responseTextPreview: string | null;
  sentClientSecret: false;
  redirectUri: string;
  attemptedAuthMethod: TokenAuthMethod;
  retryAttempted?: boolean;
}

/** On success, optional diagnostics to persist (e.g. which method was used). */
export interface TokenSuccessDiagnostics {
  finalAuthMethodUsed: TokenAuthMethod;
}

export class TokenExchangeError extends Error {
  diagnostics: TokenExchangeDiagnostics;
  constructor(message: string, diagnostics: TokenExchangeDiagnostics) {
    super(message);
    this.name = "TokenExchangeError";
    this.diagnostics = diagnostics;
  }
}

function tryParseError(raw: string): { error?: string; error_description?: string } | null {
  try {
    return JSON.parse(raw) as { error?: string; error_description?: string };
  } catch {
    return null;
  }
}

function buildDiagnostics(
  res: Response,
  raw: string,
  tokenUrl: string,
  redirectUri: string,
  attemptedAuthMethod: TokenAuthMethod,
  retryAttempted: boolean
): TokenExchangeDiagnostics {
  const parsed = tryParseError(raw);
  return {
    status: res.status,
    statusText: res.statusText,
    tokenUrlHost: new URL(tokenUrl).host,
    responseJson: parsed ? { error: parsed.error, error_description: parsed.error_description } : null,
    responseTextPreview: parsed ? null : raw.slice(0, 500),
    sentClientSecret: false,
    redirectUri,
    attemptedAuthMethod,
    retryAttempted,
  };
}

function parseTokenResponse(raw: string): TokenResponse {
  const data = JSON.parse(raw) as TokenResponse & { error?: string };
  if (!data.access_token) throw new Error("No access_token in response");
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    id_token: data.id_token,
    expires_in: data.expires_in,
    token_type: data.token_type,
  };
}

/** Exchange authorization code for tokens. Tries PKCE-only first; on 401 invalid_client, retries with HTTP Basic Auth (client_id:client_secret). */
export async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<{ tokens: TokenResponse; authMethodUsed: TokenAuthMethod }> {
  const env = getFanvueOAuthEnv();
  const tokenUrl = env.tokenUrl;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: env.clientId,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  }).toString();

  const headersNone: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };

  const res = await fetch(tokenUrl, { method: "POST", headers: headersNone, body });
  const raw = await res.text();

  if (res.ok) {
    return { tokens: parseTokenResponse(raw), authMethodUsed: "none" };
  }

  const parsed = tryParseError(raw);
  const isInvalidClient = res.status === 401 && parsed?.error === "invalid_client";

  if (isInvalidClient && env.clientSecret) {
    const basicAuth = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
    const headersBasic: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    };
    const res2 = await fetch(tokenUrl, { method: "POST", headers: headersBasic, body });
    const raw2 = await res2.text();

    if (res2.ok) {
      return { tokens: parseTokenResponse(raw2), authMethodUsed: "basic" };
    }

    const parsed2 = tryParseError(raw2);
    const diagnostics = buildDiagnostics(res2, raw2, tokenUrl, redirectUri, "basic", true);
    throw new TokenExchangeError(parsed2?.error ?? `Token exchange failed (${res2.status})`, diagnostics);
  }

  const diagnostics = buildDiagnostics(
    res,
    raw,
    tokenUrl,
    redirectUri,
    "none",
    isInvalidClient && !!env.clientSecret
  );
  throw new TokenExchangeError(parsed?.error ?? `Token exchange failed (${res.status})`, diagnostics);
}
