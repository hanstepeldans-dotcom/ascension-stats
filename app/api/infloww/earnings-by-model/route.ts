export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { getFanvuePeriodRange, type FanvuePeriod } from "@/lib/time/fanvue-range";

// Applies same gross multiplier as Fanvue (platform keeps ~25%)
const NET_TO_GROSS = 4 / 3;

export interface ModelEarningsResponse {
  modelId: string;
  modelName: string;
  total: number;
  messages: number;
  tips: number;
  subscriptions: number;
  posts: number;
  referrals: number;
  streams: number;
  totalSubscribers: number | null;
}

/**
 * GET /api/infloww/earnings-by-model?period=week|month|today|yesterday&metricType=net|gross
 *
 * Groups InflowwCreatorDailyEarnings by creatorName for the selected period.
 * Returns the same shape as the Fanvue equivalent so UI components are reused
 * without modification.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "week") as FanvuePeriod;
  const metricType = searchParams.get("metricType") ?? "net";

  const range = getFanvuePeriodRange(period);
  const mult = metricType === "gross" ? NET_TO_GROSS : 1;

  const rows = await prisma.inflowwCreatorDailyEarnings.findMany({
    where: {
      userId: session.user.id,
      date: { gte: range.startDateUtc, lte: range.endDateUtc },
    },
    select: {
      creatorName: true,
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

  // Group by creatorName
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
    // Use the latest (max) subscriber value across rows for this creator
    cur.subscribers = Math.max(cur.subscribers, r.subscribers);
    grouped.set(r.creatorName, cur);
  }

  const round = (v: number) => Math.round(v * mult * 100) / 100;

  const models: ModelEarningsResponse[] = [...grouped.entries()].map(
    ([name, agg]) => ({
      modelId: name,
      modelName: name,
      total: round(agg.total),
      subscriptions: round(agg.subscriptions),
      messages: round(agg.messages),
      tips: round(agg.tips),
      posts: round(agg.posts),
      referrals: round(agg.referrals),
      streams: round(agg.streams),
      totalSubscribers: agg.subscribers > 0 ? agg.subscribers : null,
    })
  );

  return NextResponse.json({ models });
}
