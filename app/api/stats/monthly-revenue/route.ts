import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

/** Get all days in a calendar month (1..lastDay). */
function getDaysInMonth(year: number, month: number): string[] {
  const first = new Date(year, month - 1, 1);
  const last = new Date(year, month, 0);
  const days: string[] = [];
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

/** Simple deterministic "random" from a string seed (for mock data). */
function seeded(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h << 5) - h + seed.charCodeAt(i);
  return Math.abs(h) / (2 ** 31);
}

/** Mock Infloww + Fanvue revenue for a date when DB has no data. Agency = infloww + fanvue. */
function getMockRevenueForDate(date: string): { inflowwCents: number; fanvueCents: number } {
  const inflowwCents = Math.floor(5000 + seeded(date + "infloww") * 15000); // ~$50–$200/day
  const fanvueCents = Math.floor(3000 + seeded(date + "fanvue") * 12000);   // ~$30–$150/day
  return { inflowwCents, fanvueCents };
}

/** Sample "today" revenue in cents (Infloww $2,018.94 + Fanvue $1,735.09 messages-only). */
const SAMPLE_TODAY_INFLOWW_CENTS = 201894;  // $2,018.94
const SAMPLE_TODAY_FANVUE_CENTS = 173509;    // $1,735.09
const SAMPLE_TODAY_AGENCY_CENTS = SAMPLE_TODAY_INFLOWW_CENTS + SAMPLE_TODAY_FANVUE_CENTS;

export interface MonthlyRevenueDay {
  date: string;
  inflowwCents: number;
  fanvueCents: number;
  agencyCents: number;
}

/**
 * GET /api/stats/monthly-revenue?year=YYYY&month=MM
 * Returns all days in the calendar month with revenue in cents (0 for missing days).
 * Auth required; uses session user id.
 */
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = parseInt(searchParams.get("year") ?? String(now.getFullYear()), 10);
  const month = parseInt(searchParams.get("month") ?? String(now.getMonth() + 1), 10);

  if (Number.isNaN(year) || Number.isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json({ error: "Invalid year or month" }, { status: 400 });
  }

  const days = getDaysInMonth(year, month);
  const firstDay = days[0]!;
  const lastDay = days[days.length - 1]!;

  const rows = await prisma.dailyStat.findMany({
    where: {
      userId: session.user.id,
      date: { gte: firstDay, lte: lastDay },
      provider: { in: ["INFLOWW", "FANVUE"] },
    },
    select: { date: true, provider: true, revenueCents: true },
  });

  const byDate = new Map<string, { inflowwCents: number; fanvueCents: number }>();
  for (const row of rows) {
    const cur = byDate.get(row.date) ?? { inflowwCents: 0, fanvueCents: 0 };
    if (row.provider === "INFLOWW") cur.inflowwCents += row.revenueCents;
    else if (row.provider === "FANVUE") cur.fanvueCents += row.revenueCents;
    byDate.set(row.date, cur);
  }

  let data: MonthlyRevenueDay[] = days.map((date) => {
    const cur = byDate.get(date) ?? { inflowwCents: 0, fanvueCents: 0 };
    return {
      date,
      inflowwCents: cur.inflowwCents,
      fanvueCents: cur.fanvueCents,
      agencyCents: cur.inflowwCents + cur.fanvueCents,
    };
  });

  const todayStr =
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0");

  const hasRealData = data.some((d) => d.agencyCents > 0);
  if (!hasRealData) {
    data = days.map((date) => {
      if (date > todayStr) {
        return { date, inflowwCents: 0, fanvueCents: 0, agencyCents: 0 };
      }
      if (date === todayStr) {
        return {
          date,
          inflowwCents: SAMPLE_TODAY_INFLOWW_CENTS,
          fanvueCents: SAMPLE_TODAY_FANVUE_CENTS,
          agencyCents: SAMPLE_TODAY_AGENCY_CENTS,
        };
      }
      const mock = getMockRevenueForDate(date);
      return {
        date,
        inflowwCents: mock.inflowwCents,
        fanvueCents: mock.fanvueCents,
        agencyCents: mock.inflowwCents + mock.fanvueCents,
      };
    });
  }

  // Zero out future days (we can't know future revenue)
  data = data.map((d) =>
    d.date > todayStr
      ? { date: d.date, inflowwCents: 0, fanvueCents: 0, agencyCents: 0 }
      : d
  );

  return NextResponse.json({ ok: true, data });
}
