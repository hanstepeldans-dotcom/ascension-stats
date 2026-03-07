/**
 * Fanvue OAuth config with sane defaults for endpoints.
 * Only FANVUE_CLIENT_ID, FANVUE_CLIENT_SECRET, and APP_BASE_URL are required.
 */

export const FANVUE_DEFAULT_AUTHORIZATION_URL = "https://auth.fanvue.com/oauth2/auth";
export const FANVUE_DEFAULT_TOKEN_URL = "https://auth.fanvue.com/oauth2/token";
export const FANVUE_DEFAULT_API_BASE_URL = "https://api.fanvue.com";
/** Required default scopes per Fanvue Implementation Guide (openid offline_access offline). */
export const FANVUE_REQUIRED_SCOPES = "openid offline_access offline";

/**
 * Default API scopes when FANVUE_SCOPES is not set.
 * Needed for /creators, /agencies/team-members, /insights/earnings. Without these, the token
 * only has the three base scopes and API calls return 403 Insufficient scopes.
 */
export const FANVUE_DEFAULT_API_SCOPES = "read:creator read:insights read:agency read:self";

const REQUIRED_KEYS = [
  "FANVUE_CLIENT_ID",
  "FANVUE_CLIENT_SECRET",
  "APP_BASE_URL",
] as const;

export interface FanvueConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
  scopes: string;
  appBaseUrl: string;
}

/** Returns list of required env keys that are missing or empty. */
export function listMissingFanvueEnv(): string[] {
  return REQUIRED_KEYS.filter((key) => !process.env[key]?.trim());
}

/**
 * Returns full Fanvue config. Uses defaults for optional endpoints.
 * Throws if any required key (CLIENT_ID, CLIENT_SECRET, APP_BASE_URL) is missing.
 */
export function getFanvueConfig(): FanvueConfig {
  const missing = listMissingFanvueEnv();
  if (missing.length > 0) {
    throw new Error(`Fanvue OAuth missing: ${missing.join(", ")}. See Settings → Fanvue setup.`);
  }

  const clientId = process.env.FANVUE_CLIENT_ID!.trim();
  const clientSecret = process.env.FANVUE_CLIENT_SECRET!.trim();
  const appBaseUrl = process.env.APP_BASE_URL!.trim().replace(/\/$/, "");

  return {
    clientId,
    clientSecret,
    authorizationUrl:
      process.env.FANVUE_AUTHORIZATION_URL?.trim() || FANVUE_DEFAULT_AUTHORIZATION_URL,
    tokenUrl: process.env.FANVUE_TOKEN_URL?.trim() || FANVUE_DEFAULT_TOKEN_URL,
    apiBaseUrl:
      (process.env.FANVUE_API_BASE_URL?.trim() || FANVUE_DEFAULT_API_BASE_URL).replace(/\/$/, ""),
    scopes: process.env.FANVUE_SCOPES?.trim() || FANVUE_DEFAULT_API_SCOPES,
    appBaseUrl,
  };
}

/** Returns the defaults that would be applied when env vars are missing (for display only). */
export function getFanvueDefaultsApplied(): {
  authorizationUrl: string;
  tokenUrl: string;
  apiBaseUrl: string;
} {
  return {
    authorizationUrl:
      process.env.FANVUE_AUTHORIZATION_URL?.trim() || FANVUE_DEFAULT_AUTHORIZATION_URL,
    tokenUrl: process.env.FANVUE_TOKEN_URL?.trim() || FANVUE_DEFAULT_TOKEN_URL,
    apiBaseUrl:
      (process.env.FANVUE_API_BASE_URL?.trim() || FANVUE_DEFAULT_API_BASE_URL).replace(/\/$/, ""),
  };
}
