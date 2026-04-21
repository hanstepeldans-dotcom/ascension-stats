export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { getFanvuePeriodRange, type FanvuePeriod } from "@/lib/time/fanvue-range";


/**
 * GET /api/infloww/debug/period-check?period=today|yesterday|week|month
 *
 * Uses the exact same period helper as the Fanvue/Infloww summary endpoints
 * and shows how many DB rows match, their totals, and a sample.
 * Auth required.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "week") as FanvuePeriod;

  const range = getFanvuePeriodRange(period);

  const rows = await prisma.inflowwCreatorDailyEarnings.findMany({
    where: {
      userId: session.user.id,
      date: { gte: range.startDateUtc, lte: range.endDateUtc },
    },
    orderBy: { date: "asc" },
    select: {
      creatorName: true,
      date: true,
      total: true,
      messages: true,
      tips: true,
      subscriptions: true,
    },
  });

  let total = 0, messages = 0, tips = 0, subscriptions = 0;
  for (const r of rows) {
    total += r.total;
    messages += r.messages;
    tips += r.tips;
    subscriptions += r.subscriptions;
  }

  const round = (v: number) => Math.round(v * 100) / 100;

  return NextResponse.json({
    ok: true,
    period,
    range: {
      startLocal: range.startLocal,
      endLocal: range.endLocal,
      startUtcIso: range.startUtcIso,
      endUtcIso: range.endUtcIso,
    },
    matchedRowCount: rows.length,
    totals: {
      total: round(total),
      messages: round(messages),
      tips: round(tips),
      subscriptions: round(subscriptions),
    },
    sampleMatchedRows: rows.slice(0, 10).map((r) => ({
      creatorName: r.creatorName,
      date: r.date.toISOString(),
      dateLocal: r.date.toISOString().slice(0, 10),
      total: r.total,
    })),
  });
}
