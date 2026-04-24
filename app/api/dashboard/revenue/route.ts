/**
 * GET /api/dashboard/revenue?year=YYYY&month=M&metricType=net|gross
 * Returns daily revenue per source (fanvue, infloww, total) for a calendar month.
 * Fanvue comes from FanvueCreatorDailyEarnings grouped by date.
 * Infloww comes from InflowwCreatorDailyEarnings grouped by date.
 */

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const NET_TO_GROSS = 1.25;

function formatDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");
  const metricType = searchParams.get("metricType") ?? "net";
  const mult = metricType === "gross" ? NET_TO_GROSS : 1;

  let startUtc: Date | undefined;
  let endUtc: Date | undefined;

  if (yearParam && monthParam) {
    const year = parseInt(yearParam, 10);
    const month = parseInt(monthParam, 10);
    if (!Number.isNaN(year) && !Number.isNaN(month) && month >= 1 && month <= 12) {
      startUtc = new Date(Date.UTC(year, month - 1, 1));
      endUtc = new Date(Date.UTC(year, month, 1));
    }
  }

  // Fanvue: group by date, sum total
  const fanvueRows = await prisma.fanvueCreatorDailyEarnings.groupBy({
    by: ["date"],
    where: {
      creator: { userId: session.user.id },
      ...(startUtc && endUtc ? { date: { gte: startUtc, lt: endUtc } } : {}),
    },
    _sum: { total: true },
    orderBy: { date: "asc" },
  });

  // Infloww: group by date, sum total
  const inflowwRows = await prisma.inflowwCreatorDailyEarnings.groupBy({
    by: ["date"],
    where: {
      userId: session.user.id,
      ...(startUtc && endUtc ? { date: { gte: startUtc, lt: endUtc } } : {}),
    },
    _sum: { total: true },
    orderBy: { date: "asc" },
  });

  // Build a unified map by date string
  const byDate: Record<string, { fanvue: number; infloww: number }> = {};

  for (const row of fanvueRows) {
    const key = formatDateKey(row.date);
    if (!byDate[key]) byDate[key] = { fanvue: 0, infloww: 0 };
    byDate[key].fanvue = Number(row._sum.total ?? 0);
  }

  for (const row of inflowwRows) {
    const key = formatDateKey(row.date);
    if (!byDate[key]) byDate[key] = { fanvue: 0, infloww: 0 };
    byDate[key].infloww = Number(row._sum.total ?? 0);
  }

  const sortedDates = Object.keys(byDate).sort();
  const round = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    dates: sortedDates,
    fanvue: sortedDates.map((d) => round((byDate[d]?.fanvue ?? 0) * mult)),
    infloww: sortedDates.map((d) => round((byDate[d]?.infloww ?? 0) * mult)),
    total: sortedDates.map((d) =>
      round(((byDate[d]?.fanvue ?? 0) + (byDate[d]?.infloww ?? 0)) * mult)
    ),
  });
}
