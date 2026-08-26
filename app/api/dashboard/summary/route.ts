/**
 * GET /api/dashboard/summary?period=yesterday|today|this_week|this_month&metricType=net|gross
 * Returns combined Fanvue + Infloww totals for the period.
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { getFanvuePeriodRange, type FanvuePeriod } from "@/lib/time/fanvue-range";

export const dynamic = "force-dynamic";

const NET_TO_GROSS = 1.25;

const PERIOD_MAP: Record<string, FanvuePeriod> = {
  yesterday: "yesterday",
  today: "today",
  this_week: "week",
  this_month: "month",
  // also accept short forms for convenience
  week: "week",
  month: "month",
};

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period") ?? "this_week";
  const metricType = searchParams.get("metricType") ?? "net";

  const period = PERIOD_MAP[periodParam] ?? "week";
  const range = getFanvuePeriodRange(period);
  // Both Fanvue and Infloww rows now store GROSS. Net = gross × 0.8 (20% cut).
  const fanvueMult = metricType === "gross" ? 1 : 1 / NET_TO_GROSS;
  const inflowwMult = metricType === "gross" ? 1 : 1 / NET_TO_GROSS;

  // Fanvue aggregation
  const fanvueAgg = await prisma.fanvueCreatorDailyEarnings.aggregate({
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

  // Infloww aggregation
  const inflowwAgg = await prisma.inflowwCreatorDailyEarnings.aggregate({
    where: {
      userId: session.user.id,
      date: { gte: range.startDateUtc, lte: range.endDateUtc },
    },
    _sum: {
      total: true,
      messages: true,
      tips: true,
      subscriptions: true,
      posts: true,
      referrals: true,
      streams: true,
    },
  });

  const round = (n: number) => Math.round(n * 100) / 100;

  const fanvueTotal = Number(fanvueAgg._sum.total ?? 0);
  const fanvueMessages = Number(fanvueAgg._sum.messages ?? 0);
  const fanvueTips = Number(fanvueAgg._sum.tips ?? 0);
  const fanvueSubscriptions = Number(fanvueAgg._sum.subscriptions ?? 0);

  const inflowwTotal = Number(inflowwAgg._sum.total ?? 0);
  const inflowwMessages = Number(inflowwAgg._sum.messages ?? 0);
  const inflowwTips = Number(inflowwAgg._sum.tips ?? 0);
  const inflowwSubscriptions = Number(inflowwAgg._sum.subscriptions ?? 0);
  const inflowwPosts = Number(inflowwAgg._sum.posts ?? 0);
  const inflowwReferrals = Number(inflowwAgg._sum.referrals ?? 0);
  const inflowwStreams = Number(inflowwAgg._sum.streams ?? 0);

  return NextResponse.json({
    totalEarnings: round(fanvueTotal * fanvueMult + inflowwTotal * inflowwMult),
    subscriptions: round(fanvueSubscriptions * fanvueMult + inflowwSubscriptions * inflowwMult),
    posts: round(inflowwPosts * inflowwMult),
    messages: round(fanvueMessages * fanvueMult + inflowwMessages * inflowwMult),
    tips: round(fanvueTips * fanvueMult + inflowwTips * inflowwMult),
    referrals: round(inflowwReferrals * inflowwMult),
    streams: round(inflowwStreams * inflowwMult),
    // breakdown for transparency
    fanvue: {
      total: round(fanvueTotal * fanvueMult),
      messages: round(fanvueMessages * fanvueMult),
      tips: round(fanvueTips * fanvueMult),
      subscriptions: round(fanvueSubscriptions * fanvueMult),
    },
    infloww: {
      total: round(inflowwTotal * inflowwMult),
      messages: round(inflowwMessages * inflowwMult),
      tips: round(inflowwTips * inflowwMult),
      subscriptions: round(inflowwSubscriptions * inflowwMult),
    },
  });
}
