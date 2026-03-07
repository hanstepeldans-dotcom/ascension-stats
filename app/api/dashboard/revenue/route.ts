import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

function formatDateKey(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * GET /api/dashboard/revenue?year=YYYY&month=M
 * Returns agency daily revenue for the current user: dates, fanvue, infloww, total arrays.
 * Optional year/month filter for calendar month (default: all stored rows).
 * Auth required.
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const yearParam = searchParams.get("year");
  const monthParam = searchParams.get("month");

  const where: { userId: string; date?: { gte?: Date; lt?: Date } } = {
    userId: session.user.id,
  };

  if (yearParam && monthParam) {
    const year = parseInt(yearParam, 10);
    const month = parseInt(monthParam, 10);
    if (!Number.isNaN(year) && !Number.isNaN(month) && month >= 1 && month <= 12) {
      const start = new Date(Date.UTC(year, month - 1, 1));
      const end = new Date(Date.UTC(year, month, 1));
      where.date = { gte: start, lt: end };
    }
  }

  const rows = await prisma.agencyDailyRevenue.findMany({
    where,
    orderBy: { date: "asc" },
    select: { date: true, fanvue: true, infloww: true, total: true },
  });

  const dates = rows.map((r) => formatDateKey(r.date));
  const fanvue = rows.map((r) => r.fanvue);
  const infloww = rows.map((r) => r.infloww);
  const total = rows.map((r) => r.total);

  return NextResponse.json({
    dates,
    fanvue,
    infloww,
    total,
  });
}
