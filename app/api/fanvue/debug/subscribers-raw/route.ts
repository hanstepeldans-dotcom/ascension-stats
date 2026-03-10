import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { fanvueFetchRaw } from "@/lib/providers/fanvue/client";
import { getFanvueLastNDaysRange } from "@/lib/time/fanvue-range";

const PROVIDER = "FANVUE";
const SAMPLE_ITEMS = 3;

/** Sanitize a value: strip token-like fields, cap depth and string length. */
function sanitize(val: unknown, depth = 0): unknown {
  if (depth > 2) return "[…]";
  if (val === null || val === undefined) return val;
  if (typeof val === "string") {
    if (/token|secret|password|auth/i.test(val)) return "***";
    return val.length > 120 ? val.slice(0, 120) + "…" : val;
  }
  if (typeof val === "number" || typeof val === "boolean") return val;
  if (Array.isArray(val)) {
    return val.slice(0, SAMPLE_ITEMS).map((item) => sanitize(item, depth + 1));
  }
  if (typeof val === "object") {
    const obj = val as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).slice(0, 20)) {
      if (/token|secret|password/i.test(key)) continue;
      out[key] = sanitize(obj[key], depth + 1);
    }
    return out;
  }
  return val;
}

/** Extract top-level keys from a parsed JSON value. */
function topLevelKeys(json: unknown): string[] {
  if (!json || typeof json !== "object" || Array.isArray(json)) return [];
  return Object.keys(json as Record<string, unknown>);
}

/** Pull pagination-related fields from the top level of a response. */
function extractPaginationInfo(json: unknown): Record<string, unknown> {
  if (!json || typeof json !== "object" || Array.isArray(json)) return {};
  const obj = json as Record<string, unknown>;
  const paginationKeys = [
    "nextCursor", "next_cursor", "cursor",
    "page", "pageSize", "page_size", "size",
    "totalCount", "total_count", "total",
    "hasNextPage", "has_next_page",
    "nextPage", "next_page",
    "meta", "pagination",
  ];
  const out: Record<string, unknown> = {};
  for (const key of paginationKeys) {
    if (key in obj) out[key] = obj[key];
  }
  return out;
}

const OFFSET_MINUTES = 120;

/**
 * GET /api/fanvue/debug/subscribers-raw?creatorUuid=<uuid>
 *
 * Fetches the last 7 days from the insights/subscribers time-series endpoint
 * for one creator and returns the raw response shape. No DB writes. ADMIN only.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const creatorUuid = req.nextUrl.searchParams.get("creatorUuid")?.trim();
  if (!creatorUuid) {
    return NextResponse.json(
      { error: "Missing query param: creatorUuid" },
      { status: 400 }
    );
  }

  const connection = await prisma.providerConnection.findUnique({
    where: { userId_provider: { userId: session.user.id, provider: PROVIDER } },
  });
  if (!connection || connection.status !== "CONNECTED" || !connection.accessToken) {
    return NextResponse.json(
      { error: "Fanvue not connected or no access token" },
      { status: 400 }
    );
  }

  const range = getFanvueLastNDaysRange(7, OFFSET_MINUTES);
  const q = new URLSearchParams({
    startDate: range.startUtcIso,
    endDate: range.endUtcIso,
  });
  const endpoint = `/creators/${creatorUuid}/insights/subscribers?${q.toString()}`;

  try {
    const { status, json, text } = await fanvueFetchRaw(endpoint, connection.accessToken);

    if (json === undefined) {
      return NextResponse.json({
        ok: false,
        creatorUuid,
        status,
        error: "Response was not JSON",
        responseTextPreview: text.slice(0, 400),
      });
    }

    const keys = topLevelKeys(json);
    const paginationInfo = extractPaginationInfo(json);

    // Pull the rows array — try common envelope shapes.
    const obj = json as Record<string, unknown>;
    const rawItems: unknown[] = Array.isArray(json)
      ? json
      : Array.isArray(obj.data)
        ? (obj.data as unknown[])
        : Array.isArray(obj.items)
          ? (obj.items as unknown[])
          : Array.isArray(obj.subscribers)
            ? (obj.subscribers as unknown[])
            : [];

    const sampleResponse = sanitize(rawItems.slice(0, SAMPLE_ITEMS));

    return NextResponse.json({
      ok: true,
      creatorUuid,
      endpoint,
      status,
      topLevelKeys: keys,
      sampleResponse,
      paginationInfo,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, creatorUuid, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
