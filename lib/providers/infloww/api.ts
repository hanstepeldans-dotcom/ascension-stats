/**
 * Infloww API client (read-only).
 *
 * Base URL:  https://openapi.infloww.com  (INFLOWW_API_BASE_URL)
 * Auth:      two headers on every request —
 *              Authorization: <raw api key>   (NO "Bearer " prefix — Infloww is explicit about this)
 *              x-oid:         <agency OID>
 * Rate:      1000 QPM per agency.
 *
 * Docs: https://infloww-openapi.stoplight.io  (closed beta, v1.4)
 */

const DEFAULT_BASE_URL = "https://openapi.infloww.com";
const DEFAULT_PLATFORM = "OnlyFans";
const PAGE_LIMIT = 50; // items per page; API default is 10

export interface InflowwConfig {
  apiKey: string;
  agencyOid: string;
  baseUrl: string;
}

/** Env keys that must be present for the Infloww API to work. */
export const INFLOWW_REQUIRED_ENV = ["INFLOWW_API_KEY", "INFLOWW_AGENCY_OID"] as const;

/** Returns the required Infloww env keys that are missing/empty. */
export function listMissingInflowwEnv(): string[] {
  return INFLOWW_REQUIRED_ENV.filter((k) => !process.env[k]?.trim());
}

export function isInflowwConfigured(): boolean {
  return listMissingInflowwEnv().length === 0;
}

export function getInflowwConfig(): InflowwConfig {
  const missing = listMissingInflowwEnv();
  if (missing.length > 0) {
    throw new Error(`Infloww API not configured: missing ${missing.join(", ")}`);
  }
  return {
    apiKey: process.env.INFLOWW_API_KEY!.trim(),
    agencyOid: process.env.INFLOWW_AGENCY_OID!.trim(),
    baseUrl: (process.env.INFLOWW_API_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/$/, ""),
  };
}

export class InflowwApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly endpoint: string,
    readonly requestId?: string,
    readonly bodyPreview?: string
  ) {
    super(message);
    this.name = "InflowwApiError";
  }
}

/** Envelope Infloww wraps every response in. */
interface InflowwEnvelope<T> {
  data?: T;
  cursor?: string | null;
  hasMore?: boolean;
  errors?: unknown[];
}

/**
 * GET an Infloww endpoint and return the parsed JSON envelope.
 * Throws InflowwApiError on any non-2xx (including 429 rate-limit).
 */
export async function inflowwFetch<T>(
  path: string,
  config: InflowwConfig = getInflowwConfig()
): Promise<InflowwEnvelope<T>> {
  const url = path.startsWith("http")
    ? path
    : `${config.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: config.apiKey,
      "x-oid": config.agencyOid,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    json = undefined;
  }

  if (!res.ok) {
    const requestId = res.headers.get("x-request-id") ?? undefined;
    const preview = text.slice(0, 300);
    throw new InflowwApiError(
      `Infloww ${res.status} on ${path}${requestId ? ` (x-request-id: ${requestId})` : ""}`,
      res.status,
      path,
      requestId,
      preview
    );
  }

  return (json ?? {}) as InflowwEnvelope<T>;
}

// ─── Creators ─────────────────────────────────────────────────────────────────

export interface InflowwCreator {
  id: string;
  name: string;
  nickName?: string;
  userName?: string;
  tagName?: string;
  createdTime?: string | number;
  platformPid?: number | string;
}

interface CreatorsData {
  list?: InflowwCreator[];
  platformCode?: string;
}

/**
 * Fetch every connected creator, following the cursor to the last page.
 * GET /v1/creators?cursor=&limit=&platformCode=OnlyFans
 */
export async function listAllCreators(
  config: InflowwConfig = getInflowwConfig(),
  platformCode: string = DEFAULT_PLATFORM
): Promise<InflowwCreator[]> {
  const out: InflowwCreator[] = [];
  let cursor: string | undefined;
  let guard = 0;

  do {
    const q = new URLSearchParams({ limit: String(PAGE_LIMIT), platformCode });
    if (cursor) q.set("cursor", cursor);
    const env = await inflowwFetch<CreatorsData>(`/v1/creators?${q}`, config);
    const list = env.data?.list ?? [];
    out.push(...list);
    cursor = env.hasMore && env.cursor ? String(env.cursor) : undefined;
    guard++;
  } while (cursor && guard < 1000);

  return out;
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export interface InflowwTransaction {
  id: string;
  transactionId?: string;
  fanId?: string;
  fanName?: string;
  createdTime: string; // unix ms as string
  type?: string; // Messages | Subscription | RecurringSubscription | Tip | Post | Stream | Referral | ...
  tipSource?: string | null;
  status?: string; // "loading" | settled | ...
  amount?: string; // gross, in cents (smallest currency unit)
  fee?: string; // cents
  net?: string; // cents
  currency?: string;
}

interface TransactionsData {
  list?: InflowwTransaction[];
  platformCode?: string;
}

/**
 * Fetch all transactions for one creator within [startTimeMs, endTimeMs], following the cursor.
 * GET /v1/transactions?creatorId=&startTime=&endTime=&cursor=&limit=&platformCode=OnlyFans
 */
export async function listCreatorTransactions(
  creatorId: string,
  startTimeMs: number,
  endTimeMs: number | undefined,
  config: InflowwConfig = getInflowwConfig(),
  platformCode: string = DEFAULT_PLATFORM
): Promise<InflowwTransaction[]> {
  const out: InflowwTransaction[] = [];
  let cursor: string | undefined;
  let guard = 0;

  do {
    const q = new URLSearchParams({
      creatorId,
      startTime: String(startTimeMs),
      limit: String(PAGE_LIMIT),
      platformCode,
    });
    if (endTimeMs != null) q.set("endTime", String(endTimeMs));
    if (cursor) q.set("cursor", cursor);
    const env = await inflowwFetch<TransactionsData>(`/v1/transactions?${q}`, config);
    const list = env.data?.list ?? [];
    out.push(...list);
    cursor = env.hasMore && env.cursor ? String(env.cursor) : undefined;
    guard++;
  } while (cursor && guard < 5000);

  return out;
}
