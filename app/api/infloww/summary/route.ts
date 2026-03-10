export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { getFanvuePeriodRange, type FanvuePeriod } from "@/lib/time/fanvue-range";

const OFFSET_MINUTES = 120;
const NET_TO_GROSS = 1.25;

/**
 * GET /api/infloww/summary?period=week|month|today|yesterday&metricType=net|gross
 *
 * Aggregates all InflowwCreatorDailyEarnings rows for the authenticated user
 * within the selected period and returns totals matching the Fanvue summary shape.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "week") as FanvuePeriod;
  const metricType = searchParams.get("metricType") ?? "net";

  const range = getFanvuePeriodRange(period, OFFSET_MINUTES);
  const mult = metricType === "gross" ? NET_TO_GROSS : 1;

  const rows = await prisma.inflowwCreatorDailyEarnings.findMany({
    where: {
      userId: session.user.id,
      date: { gte: range.startDateUtc, lte: range.endDateUtc },
    },
    select: {
      total: true,
      subscriptions: true,
      messages: true,
      tips: true,
      posts: true,
      referrals: true,
      streams: true,
    },
  });

  let total = 0, subscriptions = 0, messages = 0, tips = 0,
    posts = 0, referrals = 0, streams = 0;

  for (const r of rows) {
    total += r.total;
    subscriptions += r.subscriptions;
    messages += r.messages;
    tips += r.tips;
    posts += r.posts;
    referrals += r.referrals;
    streams += r.streams;
  }

  const round = (v: number) => Math.round(v * mult * 100) / 100;

  return NextResponse.json({
    total: round(total),
    subscriptions: round(subscriptions),
    messages: round(messages),
    tips: round(tips),
    posts: round(posts),
    referrals: round(referrals),
    streams: round(streams),
  });
}
