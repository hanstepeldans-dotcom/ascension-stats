export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

/**
 * GET /api/infloww/debug/date-range
 *
 * Reads InflowwCreatorDailyEarnings from the DB (not from a file) and returns:
 *  - rowCount
 *  - minDate / maxDate as ISO strings
 *  - sampleRows (first 10, ordered by date asc)
 *
 * Use this to verify that upload stored the correct dates.
 * Auth required.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const [rowCount, allRows] = await Promise.all([
    prisma.inflowwCreatorDailyEarnings.count({ where: { userId } }),
    prisma.inflowwCreatorDailyEarnings.findMany({
      where: { userId },
      orderBy: { date: "asc" },
      select: {
        creatorName: true,
        date: true,
        total: true,
        messages: true,
        tips: true,
        subscriptions: true,
        subscribers: true,
      },
    }),
  ]);

  if (allRows.length === 0) {
    return NextResponse.json({ ok: true, rowCount: 0, minDate: null, maxDate: null, sampleRows: [] });
  }

  const minDate = allRows[0].date.toISOString();
  const maxDate = allRows[allRows.length - 1].date.toISOString();

  // Unique dates in DB
  const uniqueDates = [...new Set(allRows.map((r) => r.date.toISOString().slice(0, 10)))].sort();

  // Unique creators in DB
  const uniqueCreators = [...new Set(allRows.map((r) => r.creatorName))];

  const sampleRows = allRows.slice(0, 10).map((r) => ({
    creatorName: r.creatorName,
    date: r.date.toISOString(),
    dateLocal: r.date.toISOString().slice(0, 10),
    total: r.total,
    messages: r.messages,
    tips: r.tips,
    subscriptions: r.subscriptions,
    subscribers: r.subscribers,
  }));

  return NextResponse.json({
    ok: true,
    rowCount,
    minDate,
    maxDate,
    uniqueDateCount: uniqueDates.length,
    uniqueDates,
    uniqueCreators,
    sampleRows,
  });
}
