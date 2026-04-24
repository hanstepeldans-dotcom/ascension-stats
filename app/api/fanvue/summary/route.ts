/**
 * GET /api/fanvue/summary?period=today|yesterday|week|month&metricType=net|gross
 * Returns combined Fanvue totals for the period. Same source as earnings-by-model.
 * Period boundaries use Europe/Bucharest time (dynamic DST-aware offset).
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { getFanvuePeriodRange, type FanvuePeriod } from "@/lib/time/fanvue-range";

// Fanvue keeps ~25% of fan spend; creator net × (1/0.75) = gross fan spend
const NET_TO_GROSS = 4 / 3;

const PERIOD_MAP: Record<string, FanvuePeriod> = {
  today: "today",
  yesterday: "yesterday",
  week: "week",
  month: "month",
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period") ?? "week";
  const metricType = searchParams.get("metricType") ?? "net";

  const period = PERIOD_MAP[periodParam] ?? "week";
  const range = getFanvuePeriodRange(period);
  const mult = metricType === "gross" ? NET_TO_GROSS : 1;

  const agg = await prisma.fanvueCreatorDailyEarnings.aggregate({
    where: {
      creator: { userId: session.user.id },
      date: { gte: range.startDateUtc, lte: range.endDateUtc },
    },
    _sum: {
      total: true,
      messages: true,
      tips: true,
      subscriptions: true,
    },
  });

  const total = Math.round((Number(agg._sum.total ?? 0) * mult) * 100) / 100;
  const messages = Math.round((Number(agg._sum.messages ?? 0) * mult) * 100) / 100;
  const tips = Math.round((Number(agg._sum.tips ?? 0) * mult) * 100) / 100;
  const subscriptions = Math.round((Number(agg._sum.subscriptions ?? 0) * mult) * 100) / 100;

  return NextResponse.json({
    total,
    messages,
    tips,
    subscriptions,
  });
}
