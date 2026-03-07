/**
 * Fanvue API client. Uses FANVUE_API_BASE_URL, Bearer token, and X-Fanvue-API-Version.
 */

const getBaseUrl = (): string => {
  const url = process.env.FANVUE_API_BASE_URL?.trim();
  if (!url) throw new Error("FANVUE_API_BASE_URL is not set");
  return url.replace(/\/$/, "");
};

export const FANVUE_API_VERSION_DEFAULT = "2025-06-26";

export function getFanvueApiVersion(): string {
  return process.env.FANVUE_API_VERSION?.trim() ?? FANVUE_API_VERSION_DEFAULT;
}

function getHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "X-Fanvue-API-Version": getFanvueApiVersion(),
  };
}

/** Raw fetch: returns status, contentType, text, and optional parsed json. Does not throw on 4xx/5xx. */
export async function fanvueFetchRaw(
  endpoint: string,
  accessToken: string
): Promise<{ status: number; contentType: string; text: string; json?: unknown }> {
  const base = getBaseUrl();
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${base}${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: getHeaders(accessToken),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const text = await res.text();
  let json: unknown = undefined;
  if (text && /application\/json/i.test(contentType)) {
    try {
      json = JSON.parse(text) as unknown;
    } catch {
      // leave json undefined
    }
  }

  return { status: res.status, contentType, text, json };
}

const INSUFFICIENT_SCOPES_MESSAGE = "insufficient_scopes";
const RESPONSE_PREVIEW_MAX = 500;

/** Sanitize string so it does not contain tokens/secrets (for error reporting). */
function sanitizePreview(raw: string): string {
  return raw
    .replace(/access_token["\s:=]+[^\s"}\]]+/gi, "access_token=***")
    .replace(/refresh_token["\s:=]+[^\s"}\]]+/gi, "refresh_token=***")
    .replace(/client_secret["\s:=]+[^\s"}\]]+/gi, "client_secret=***")
    .replace(/["']?token["\s:=]+[^\s"}\]]+/gi, "token=***")
    .slice(0, RESPONSE_PREVIEW_MAX);
}

/** Parsed query params from endpoint path (e.g. "/creators?page=1&size=50") for safe display. */
function getQueryParamsFromEndpoint(endpoint: string): Record<string, string> {
  const q = endpoint.indexOf("?");
  if (q === -1) return {};
  const params: Record<string, string> = {};
  try {
    new URLSearchParams(endpoint.slice(q)).forEach((value, key) => {
      params[key] = value;
    });
  } catch {
    return {};
  }
  return params;
}

export interface FanvueApiErrorDetails {
  status: number;
  endpoint: string;
  method: string;
  queryParams: Record<string, string>;
  responsePreview: string;
}

export class FanvueApiError extends Error {
  readonly status: number;
  readonly endpoint: string;
  readonly method: string;
  readonly queryParams: Record<string, string>;
  readonly responsePreview: string;

  constructor(details: FanvueApiErrorDetails) {
    super(`Fanvue API error ${details.status}`);
    this.name = "FanvueApiError";
    this.status = details.status;
    this.endpoint = details.endpoint;
    this.method = details.method;
    this.queryParams = details.queryParams;
    this.responsePreview = details.responsePreview;
  }
}

export function isInsufficientScopesError(body: string): boolean {
  return /insufficient\s+scopes/i.test(body);
}

export async function fanvueFetch<T = unknown>(
  endpoint: string,
  accessToken: string
): Promise<T> {
  const base = getBaseUrl();
  const path = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const url = `${base}${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: getHeaders(accessToken),
  });

  if (!res.ok) {
    const raw = await res.text();
    if (res.status === 403 && isInsufficientScopesError(raw)) {
      throw new Error(INSUFFICIENT_SCOPES_MESSAGE);
    }
    let responsePreview: string;
    try {
      const json = JSON.parse(raw) as { error?: string; error_description?: string; message?: string };
      const part = json.error_description ?? json.error ?? json.message ?? raw;
      responsePreview = sanitizePreview(typeof part === "string" ? part : JSON.stringify(part));
    } catch {
      responsePreview = sanitizePreview(raw);
    }
    throw new FanvueApiError({
      status: res.status,
      endpoint,
      method: "GET",
      queryParams: getQueryParamsFromEndpoint(endpoint),
      responsePreview,
    });
  }

  return res.json() as Promise<T>;
}
