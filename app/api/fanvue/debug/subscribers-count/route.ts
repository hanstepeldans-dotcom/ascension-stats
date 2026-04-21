import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { fanvueFetchRaw } from "@/lib/providers/fanvue/client";
import { getFanvueLastNDaysRange } from "@/lib/time/fanvue-range";

const PROVIDER = "FANVUE";

/** Extract the rows array from a response envelope, trying common shapes. */
function extractRows(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  for (const key of ["data", "items", "subscribers", "results"]) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  return [];
}

/**
 * GET /api/fanvue/debug/subscribers-count?creatorUuid=<uuid>
 *
 * Fetches the last 7 days from insights/subscribers for one creator.
 * Sorts rows by date, takes the latest row's `total` as the active subscriber
 * count. No DB writes. ADMIN only.
 *
 * Uses GET /creators/:creatorUuid/insights/subscribers (requires read:insights).
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

  const range = getFanvueLastNDaysRange(7);
  const q = new URLSearchParams({
    startDate: range.startUtcIso,
    endDate: range.endUtcIso,
  });
  const endpoint = `/creators/${creatorUuid}/insights/subscribers?${q.toString()}`;

  try {
    const { status, json, text } = await fanvueFetchRaw(endpoint, connection.accessToken);

    if (status !== 200 || json === undefined) {
      return NextResponse.json({
        ok: false,
        creatorUuid,
        endpoint,
        status,
        error: "Unexpected response from insights/subscribers",
        responseTextPreview: text.slice(0, 400),
      });
    }

    const rows = extractRows(json);

    // Parse each row for a date and total field.
    const parsed: { date: Date; total: number; rawDate: string }[] = [];
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const obj = row as Record<string, unknown>;
      const dateRaw = obj.date ?? obj.createdAt ?? obj.periodStart ?? obj.periodEnd;
      const rawTotal = obj.total;
      if (!dateRaw || typeof rawTotal !== "number") continue;
      const date = new Date(dateRaw as string);
      if (Number.isNaN(date.getTime())) continue;
      parsed.push({ date, total: rawTotal, rawDate: String(dateRaw) });
    }

    if (parsed.length === 0) {
      return NextResponse.json({
        ok: false,
        creatorUuid,
        endpoint,
        status,
        rowsReturned: rows.length,
        error: "No parseable rows with date + total found in response",
      });
    }

    // Latest row by date → its `total` is the current active headcount.
    parsed.sort((a, b) => b.date.getTime() - a.date.getTime());
    const latest = parsed[0];

    return NextResponse.json({
      ok: true,
      creatorUuid,
      endpoint,
      totalSubscribersCount: latest.total,
      asOfDate: latest.rawDate,
      rowsReturned: parsed.length,
      allRows: parsed.map((r) => ({ date: r.rawDate, total: r.total })),
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        creatorUuid,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 }
    );
  }
}
