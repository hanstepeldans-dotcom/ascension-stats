/**
 * GET /api/fanvue/debug/reconcile-period?period=today|yesterday|week|month
 * ADMIN only. Returns range, per-creator DB totals (same rows as table), summary (same as top cards), tableGrandTotal.
 * Use to verify consistency across the Fanvue tab.
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { getFanvuePeriodRange, type FanvuePeriod } from "@/lib/time/fanvue-range";

const FANVUE_OFFSET_MINUTES = 120;

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
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const periodParam = searchParams.get("period") ?? "week";
  const period = PERIOD_MAP[periodParam] ?? "week";
  const range = getFanvuePeriodRange(period, FANVUE_OFFSET_MINUTES);
  const userId = session.user.id;

  const creators = await prisma.fanvueCreator.findMany({
    where: { userId },
    select: {
      id: true,
      fanvueUuid: true,
      displayName: true,
      handle: true,
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

  const creatorRows: {
    creatorUuid: string;
    name: string;
    db: { total: number; messages: number; tips: number; subscriptions: number };
  }[] = [];
  let summaryTotal = 0;
  let summaryMessages = 0;
  let summaryTips = 0;
  let summarySubscriptions = 0;

  for (const c of creators) {
    let total = 0;
    let messages = 0;
    let tips = 0;
    let subscriptions = 0;
    for (const e of c.earnings) {
      total += Number(e.total);
      messages += Number(e.messages);
      tips += Number(e.tips);
      subscriptions += Number(e.subscriptions);
    }
    const name = c.displayName?.trim() || c.handle?.trim() || c.fanvueUuid;
    creatorRows.push({
      creatorUuid: c.fanvueUuid,
      name,
      db: {
        total: Math.round(total * 100) / 100,
        messages: Math.round(messages * 100) / 100,
        tips: Math.round(tips * 100) / 100,
        subscriptions: Math.round(subscriptions * 100) / 100,
      },
    });
    summaryTotal += total;
    summaryMessages += messages;
    summaryTips += tips;
    summarySubscriptions += subscriptions;
  }

  const tableGrandTotal = creatorRows.reduce((s, r) => s + r.db.total, 0);

  return NextResponse.json({
    ok: true,
    period,
    range: {
      startLocal: range.startLocal,
      endLocal: range.endLocal,
      startUtcIso: range.startUtcIso,
      endUtcIso: range.endUtcIso,
    },
    creators: creatorRows,
    summary: {
      total: Math.round(summaryTotal * 100) / 100,
      messages: Math.round(summaryMessages * 100) / 100,
      tips: Math.round(summaryTips * 100) / 100,
      subscriptions: Math.round(summarySubscriptions * 100) / 100,
    },
    tableGrandTotal: Math.round(tableGrandTotal * 100) / 100,
  });
}
