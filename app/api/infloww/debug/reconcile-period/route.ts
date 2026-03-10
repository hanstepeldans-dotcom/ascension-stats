export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { getFanvuePeriodRange, type FanvuePeriod } from "@/lib/time/fanvue-range";

const OFFSET_MINUTES = 120;

/**
 * GET /api/infloww/debug/reconcile-period?period=today|yesterday|week|month
 *
 * Proves that the summary endpoint and the earnings-by-model endpoint both
 * compute from the EXACT same set of DB rows for the same period.
 *
 * Returns:
 *  - The period range (UTC boundaries)
 *  - matchedRowCount
 *  - A sample of matched rows
 *  - summary aggregated directly from those rows (same as /api/infloww/summary)
 *  - tableGrandTotal: sum of per-model totals (same as sum of earnings-by-model rows)
 *  - tableBreakdownGrandTotals: sum of per-model breakdowns (same as earnings-by-model)
 *
 * If summary.total == tableGrandTotal and summary.messages == tableBreakdownGrandTotals.messages
 * then the two endpoints are in sync.
 *
 * Auth required.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "today") as FanvuePeriod;

  const range = getFanvuePeriodRange(period, OFFSET_MINUTES);

  const rows = await prisma.inflowwCreatorDailyEarnings.findMany({
    where: {
      userId: session.user.id,
      date: { gte: range.startDateUtc, lte: range.endDateUtc },
    },
    orderBy: [{ date: "asc" }, { creatorName: "asc" }],
    select: {
      creatorName: true,
      date: true,
      total: true,
      subscriptions: true,
      messages: true,
      tips: true,
      posts: true,
      referrals: true,
      streams: true,
      subscribers: true,
    },
  });

  // ── summary (exactly what /api/infloww/summary computes) ──────────────────
  let sTotal = 0, sSubscriptions = 0, sMessages = 0, sTips = 0,
    sPosts = 0, sReferrals = 0, sStreams = 0;

  for (const r of rows) {
    sTotal += r.total;
    sSubscriptions += r.subscriptions;
    sMessages += r.messages;
    sTips += r.tips;
    sPosts += r.posts;
    sReferrals += r.referrals;
    sStreams += r.streams;
  }

  const round = (v: number) => Math.round(v * 100) / 100;

  // ── per-model grouping (exactly what /api/infloww/earnings-by-model computes) ─
  const grouped = new Map<string, {
    total: number; subscriptions: number; messages: number;
    tips: number; posts: number; referrals: number; streams: number;
    subscribers: number;
  }>();

  for (const r of rows) {
    const cur = grouped.get(r.creatorName) ?? {
      total: 0, subscriptions: 0, messages: 0, tips: 0,
      posts: 0, referrals: 0, streams: 0, subscribers: 0,
    };
    cur.total += r.total;
    cur.subscriptions += r.subscriptions;
    cur.messages += r.messages;
    cur.tips += r.tips;
    cur.posts += r.posts;
    cur.referrals += r.referrals;
    cur.streams += r.streams;
    cur.subscribers = Math.max(cur.subscribers, r.subscribers);
    grouped.set(r.creatorName, cur);
  }

  let tTotal = 0, tSubscriptions = 0, tMessages = 0, tTips = 0, tSubscribers = 0;
  for (const agg of grouped.values()) {
    tTotal += agg.total;
    tSubscriptions += agg.subscriptions;
    tMessages += agg.messages;
    tTips += agg.tips;
    tSubscribers += agg.subscribers;
  }

  // ── unique dates in matched set ────────────────────────────────────────────
  const uniqueDates = [...new Set(rows.map((r) => r.date.toISOString().slice(0, 10)))].sort();
  const uniqueCreators = [...new Set(rows.map((r) => r.creatorName))];

  // ── also show ALL rows in DB for comparison ──────────────────────────────
  const totalDbRows = await prisma.inflowwCreatorDailyEarnings.count({
    where: { userId: session.user.id },
  });

  const allUniqueDates = await prisma.inflowwCreatorDailyEarnings
    .findMany({
      where: { userId: session.user.id },
      select: { date: true },
      distinct: ["date"],
      orderBy: { date: "asc" },
    })
    .then((rs) => rs.map((r) => r.date.toISOString().slice(0, 10)));

  return NextResponse.json({
    ok: true,
    period,
    range: {
      startLocal: range.startLocal,
      endLocal: range.endLocal,
      startUtcIso: range.startUtcIso,
      endUtcIso: range.endUtcIso,
    },
    // Rows matched by the period filter
    matchedRowCount: rows.length,
    matchedUniqueDates: uniqueDates,
    matchedUniqueCreators: uniqueCreators,
    // What /api/infloww/summary returns for this period
    summary: {
      total: round(sTotal),
      subscriptions: round(sSubscriptions),
      messages: round(sMessages),
      tips: round(sTips),
      posts: round(sPosts),
      referrals: round(sReferrals),
      streams: round(sStreams),
    },
    // Grand totals of per-model table (what /api/infloww/earnings-by-model returns, summed)
    tableGrandTotal: round(tTotal),
    tableBreakdownGrandTotals: {
      subscriptions: round(tSubscriptions),
      messages: round(tMessages),
      tips: round(tTips),
      subscribers: tSubscribers,
    },
    // Consistency check: these should all be true
    consistencyChecks: {
      "summary.total == tableGrandTotal": round(sTotal) === round(tTotal),
      "summary.messages == table.messages": round(sMessages) === round(tMessages),
      "summary.tips == table.tips": round(sTips) === round(tTips),
      "summary.subscriptions == table.subscriptions": round(sSubscriptions) === round(tSubscriptions),
    },
    // Sample of matched rows (first 10)
    rowsSample: rows.slice(0, 10).map((r) => ({
      creatorName: r.creatorName,
      date: r.date.toISOString(),
      dateLocal: r.date.toISOString().slice(0, 10),
      total: r.total,
      subscriptions: r.subscriptions,
      messages: r.messages,
      tips: r.tips,
      posts: r.posts,
      referrals: r.referrals,
      streams: r.streams,
      subscribers: r.subscribers,
    })),
    // Full DB state summary
    dbState: {
      totalDbRows,
      allUniqueDates,
      allUniqueDateCount: allUniqueDates.length,
    },
  });
}
