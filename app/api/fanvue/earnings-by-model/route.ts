import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { getFanvuePeriodRange, type FanvuePeriod } from "@/lib/time/fanvue-range";

const NET_TO_GROSS = 1.25;
const FANVUE_OFFSET_MINUTES = 120;

export interface ModelEarningsResponse {
  modelId: string;
  modelName: string;
  total: number;
  messages: number;
  tips: number;
  subscriptions: number;
}

/**
 * GET /api/fanvue/earnings-by-model?period=week|month|today|yesterday&metricType=net|gross
 * Returns per-creator (model) earnings from stored FanvueCreatorDailyEarnings. Auth required.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "week") as FanvuePeriod;
  const metricType = searchParams.get("metricType") ?? "net";

  const range = getFanvuePeriodRange(period, FANVUE_OFFSET_MINUTES);

  const mult = metricType === "gross" ? NET_TO_GROSS : 1;

  const creators = await prisma.fanvueCreator.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      fanvueUuid: true,
      handle: true,
      displayName: true,
      earnings: {
        where: {
          date: { gte: range.startDateUtc, lte: range.endDateUtc },
        },
        select: {
          total: true,
          messages: true,
          tips: true,
          subscriptions: true,
        },
      },
    },
  });

  const models: ModelEarningsResponse[] = creators.map((c) => {
    let total = 0;
    let messages = 0;
    let tips = 0;
    let subscriptions = 0;
    for (const e of c.earnings) {
      total += e.total;
      messages += e.messages;
      tips += e.tips;
      subscriptions += e.subscriptions;
    }
    const modelName =
      c.displayName?.trim() || c.handle?.trim() || c.fanvueUuid;
    return {
      modelId: c.id,
      modelName,
      total: Math.round(total * mult * 100) / 100,
      messages: Math.round(messages * mult * 100) / 100,
      tips: Math.round(tips * mult * 100) / 100,
      subscriptions: Math.round(subscriptions * mult * 100) / 100,
    };
  });

  return NextResponse.json({ models });
}
