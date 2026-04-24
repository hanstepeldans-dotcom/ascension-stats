/**
 * GET /api/fanvue/debug/live-vs-db?period=today|yesterday|week|month
 * ADMIN only.
 *
 * Compares what is currently stored in the DB against what the live Fanvue API
 * returns for the same period.  Useful for diagnosing staleness, missing
 * creators, or amount-unit mismatches.
 *
 * Returns:
 *  - period range (UTC) used for both DB query and API calls
 *  - per-creator: DB total vs live API total (fetches first page only, no pagination, so "liveApiFirstPageTotal" may be partial)
 *  - rawSample: first 5 items from one creator's API response (so you can see field names and units)
 *  - summary: DB total vs live API total across all creators
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { fanvueFetch } from "@/lib/providers/fanvue/client";
import {
  getFanvuePeriodRange,
  getBucharestOffsetMinutes,
  getLocalDateKey,
  type FanvuePeriod,
} from "@/lib/time/fanvue-range";

export const dynamic = "force-dynamic";

const PERIOD_MAP: Record<string, FanvuePeriod> = {
  today: "today",
  yesterday: "yesterday",
  week: "week",
  month: "month",
};

function getEarningsArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return [];
  if (Array.isArray(p.data)) return p.data;
  if (Array.isArray(p.items)) return p.items;
  return [];
}

function sumEarningsItems(
  items: unknown[]
): { total: number; count: number; rawFields: string[] } {
  let total = 0;
  const fieldSet = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    Object.keys(obj).forEach((k) => fieldSet.add(k));
    const amount =
      typeof obj.net === "number"
        ? obj.net
        : typeof obj.netAmount === "number"
        ? obj.netAmount
        : typeof obj.amount === "number"
        ? obj.amount
        : Number(obj.net) || Number(obj.amount) || 0;
    total += amount;
  }
  return { total, count: items.length, rawFields: [...fieldSet] };
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period") ?? "today";
  const period = PERIOD_MAP[periodParam] ?? "today";
  const range = getFanvuePeriodRange(period);
  const userId = session.user.id;

  // ── 1. DB data ────────────────────────────────────────────────────────────
  const creators = await prisma.fanvueCreator.findMany({
    where: { userId },
    select: {
      id: true,
      fanvueUuid: true,
      displayName: true,
      handle: true,
      earnings: {
        where: { date: { gte: range.startDateUtc, lte: range.endDateUtc } },
        select: { date: true, total: true, messages: true, tips: true, subscriptions: true },
      },
    },
  });

  // ── 2. Access token ───────────────────────────────────────────────────────
  const connection = await prisma.providerConnection.findUnique({
    where: { userId_provider: { userId, provider: "FANVUE" } },
  });
  if (!connection?.accessToken || connection.status !== "CONNECTED") {
    return NextResponse.json({ error: "Fanvue not connected" }, { status: 400 });
  }
  const accessToken = connection.accessToken;

  // ── 3. Live API for each creator (first page only, no full pagination) ────
  const creatorComparisons: {
    fanvueUuid: string;
    name: string;
    db: { totalNet: number; rows: number };
    liveApi: {
      firstPageItemCount: number;
      firstPageRawTotal: number;
      firstPageRawTotalDividedBy100: number;
      topLevelKeys: string[];
      itemFields: string[];
      note: string;
    } | { error: string };
  }[] = [];

  let rawSampleItems: unknown[] = [];
  let dbGrandTotal = 0;
  let liveGrandRawTotal = 0;
  let liveGrandRawTotalDiv100 = 0;

  for (const c of creators) {
    const name = c.displayName?.trim() || c.handle?.trim() || c.fanvueUuid;

    // DB total for this creator
    let dbTotal = 0;
    for (const e of c.earnings) dbTotal += Number(e.total);
    dbGrandTotal += dbTotal;

    // Live API call (first page only)
    let liveResult: (typeof creatorComparisons)[number]["liveApi"];
    try {
      const q = new URLSearchParams({
        startDate: range.startUtcIso,
        endDate: range.endUtcIso,
        size: "20",
      });
      const payload = await fanvueFetch<unknown>(
        `/creators/${encodeURIComponent(c.fanvueUuid)}/insights/earnings?${q}`,
        accessToken
      );

      const items = getEarningsArray(payload);
      const { total: rawTotal, rawFields } = sumEarningsItems(items);
      const topLevelKeys =
        payload && typeof payload === "object"
          ? Object.keys(payload as object)
          : [];

      if (rawSampleItems.length === 0 && items.length > 0) {
        rawSampleItems = items.slice(0, 5);
      }

      liveGrandRawTotal += rawTotal;
      liveGrandRawTotalDiv100 += rawTotal / 100;

      liveResult = {
        firstPageItemCount: items.length,
        firstPageRawTotal: Math.round(rawTotal * 100) / 100,
        firstPageRawTotalDividedBy100: Math.round((rawTotal / 100) * 100) / 100,
        topLevelKeys,
        itemFields: rawFields,
        note:
          items.length === 20
            ? "exactly 20 items — may have more pages not fetched"
            : `all items on first page (${items.length})`,
      };
    } catch (err) {
      liveResult = {
        error: err instanceof Error ? err.message : String(err),
      };
    }

    creatorComparisons.push({
      fanvueUuid: c.fanvueUuid,
      name,
      db: { totalNet: Math.round(dbTotal * 100) / 100, rows: c.earnings.length },
      liveApi: liveResult,
    });
  }

  // ── 4. Date bucketing sample ──────────────────────────────────────────────
  // Show what date key the first few items would bucket to
  const bucketingSamples: { rawDate: string; bucketedKey: string; offsetMinutes: number }[] = [];
  for (const item of rawSampleItems.slice(0, 3)) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const dateRaw = obj.date ?? obj.createdAt ?? obj.periodStart ?? obj.paidAt;
    if (!dateRaw) continue;
    const d = new Date(dateRaw as string);
    if (!isNaN(d.getTime())) {
      const offsetMinutes = getBucharestOffsetMinutes(d);
      bucketingSamples.push({
        rawDate: d.toISOString(),
        bucketedKey: getLocalDateKey(d, offsetMinutes),
        offsetMinutes,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    period,
    range: {
      startLocal: range.startLocal,
      endLocal: range.endLocal,
      startUtcIso: range.startUtcIso,
      endUtcIso: range.endUtcIso,
    },
    creatorsInDb: creators.length,
    summary: {
      dbGrandTotalNet: Math.round(dbGrandTotal * 100) / 100,
      dbGrandTotalGross: Math.round(dbGrandTotal * 1.25 * 100) / 100,
      liveApiFirstPageRawTotal: Math.round(liveGrandRawTotal * 100) / 100,
      liveApiFirstPageRawTotalDividedBy100: Math.round(liveGrandRawTotalDiv100 * 100) / 100,
      note: "If liveApiFirstPageRawTotal ≈ dbGrandTotalNet × 100 → amounts are in cents not dollars",
    },
    creatorComparisons,
    rawSampleItems,
    bucketingSamples,
  });
}
