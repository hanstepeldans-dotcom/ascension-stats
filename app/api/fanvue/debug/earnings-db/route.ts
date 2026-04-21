import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { getFanvuePeriodRange, type FanvuePeriod } from "@/lib/time/fanvue-range";


/**
 * GET /api/fanvue/debug/earnings-db?period=week|month|today|yesterday
 * ADMIN only. Returns DB counts, date range, sample rows and top creators for the period.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const period = (searchParams.get("period") ?? "week") as FanvuePeriod;
  const userId = session.user.id;

  const range = getFanvuePeriodRange(period);

  const [creatorsCount, dailyRowsCount, dateRange, sampleRows, earningsGrouped] =
    await Promise.all([
      prisma.fanvueCreator.count({ where: { userId } }),
      prisma.fanvueCreatorDailyEarnings.count({
        where: { creator: { userId } },
      }),
      prisma.fanvueCreatorDailyEarnings.aggregate({
        where: { creator: { userId } },
        _min: { date: true },
        _max: { date: true },
      }),
      prisma.fanvueCreatorDailyEarnings.findMany({
        where: { creator: { userId } },
        orderBy: { date: "desc" },
        take: 10,
        include: {
          creator: {
            select: { fanvueUuid: true, displayName: true, handle: true },
          },
        },
      }),
      prisma.fanvueCreatorDailyEarnings.groupBy({
        by: ["creatorId"],
        where: {
          creator: { userId },
          date: { gte: range.startDateUtc, lte: range.endDateUtc },
        },
        _sum: { total: true },
        _count: { date: true },
      }),
    ]);

  const creatorIds = [...new Set(earningsGrouped.map((g) => g.creatorId))];
  const creators =
    creatorIds.length > 0
      ? await prisma.fanvueCreator.findMany({
          where: { id: { in: creatorIds } },
          select: { id: true, fanvueUuid: true, displayName: true, handle: true },
        })
      : [];
  const creatorMap = new Map(creators.map((c) => [c.id, c]));

  const topCreatorsInRange = earningsGrouped
    .map((g) => ({
      creatorId: g.creatorId,
      total: Number(g._sum.total ?? 0),
      daysCount: g._count.date,
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((g) => {
      const c = creatorMap.get(g.creatorId);
      return {
        creatorFanvueUuid: c?.fanvueUuid ?? null,
        name: (c?.displayName?.trim() || c?.handle?.trim() || c?.fanvueUuid) ?? null,
        total: Number(g.total),
        daysCount: g.daysCount,
      };
    });

  const sampleDailyRows = sampleRows.map((r) => ({
    creatorFanvueUuid: r.creator.fanvueUuid,
    date: r.date.toISOString().slice(0, 10),
    total: Number(r.total),
    messages: Number(r.messages),
    tips: Number(r.tips),
    subscriptions: Number(r.subscriptions),
  }));

  return NextResponse.json({
    ok: true,
    period,
    filterRange: {
      startLocal: range.startLocal,
      endLocal: range.endLocal,
      startUtcIso: range.startUtcIso,
      endUtcIso: range.endUtcIso,
    },
    creatorsCount,
    dailyRowsCount,
    minDate: dateRange._min.date ? dateRange._min.date.toISOString().slice(0, 10) : null,
    maxDate: dateRange._max.date ? dateRange._max.date.toISOString().slice(0, 10) : null,
    sampleDailyRows,
    topCreatorsInRange,
  });
}
