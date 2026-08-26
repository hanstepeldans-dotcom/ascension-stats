import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { FanvueApiError } from "@/lib/providers/fanvue/client";
import type { FanvuePeriod } from "@/lib/time/fanvue-range";
import { runFanvueSync, runFanvueRebuild } from "@/lib/fanvue/run-sync";
import { getFreshFanvueAccessToken } from "@/lib/fanvue/token";

const PROVIDER = "FANVUE";

/**
 * POST /api/fanvue/sync
 * Fetches creators list, then per-creator earnings for the given period (UTC+2), aggregates by local day, upserts AgencyDailyRevenue.
 * Query: period=today|yesterday|week|month (default: month).
 * Query: rebuild=1 — delete Fanvue creator daily + agency revenue in 33-day range, then re-sync with UTC+2 bucketing.
 */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connection = await prisma.providerConnection.findUnique({
    where: {
      userId_provider: { userId: session.user.id, provider: PROVIDER },
    },
  });

  if (!connection || connection.status !== "CONNECTED" || !connection.refreshToken) {
    return NextResponse.json(
      { error: "Fanvue not connected or no refresh token", ok: false },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const rebuild = url.searchParams.get("rebuild") === "1";
  const period = (url.searchParams.get("period") ?? "month") as FanvuePeriod;
  const userId = session.user.id;
  // Fanvue access tokens expire after ~1h — refresh before every sync.
  const accessToken = await getFreshFanvueAccessToken(connection.id);

  try {
    const result = rebuild
      ? await runFanvueRebuild(userId, accessToken)
      : await runFanvueSync(userId, accessToken, period);
    return NextResponse.json({
      ...result,
      startDate: result.startDate,
      endDate: result.endDate,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    if (msg === "insufficient_scopes") {
      await prisma.providerConnection.update({
        where: {
          userId_provider: { userId: session.user.id, provider: PROVIDER },
        },
        data: { status: "ERROR", lastError: "insufficient_scopes" },
      });
      return NextResponse.json(
        { error: "insufficient_scopes", ok: false },
        { status: 403 }
      );
    }
    if (e instanceof FanvueApiError) {
      const lastError = `fanvue_sync_failed: ${e.status} ${e.endpoint}`;
      const lastDebugJson =
        process.env.NODE_ENV !== "production"
          ? {
              status: e.status,
              endpoint: e.endpoint,
              method: e.method,
              queryParams: e.queryParams,
              responsePreview: e.responsePreview,
            }
          : undefined;
      await prisma.providerConnection.update({
        where: {
          userId_provider: { userId: session.user.id, provider: PROVIDER },
        },
        data: {
          status: "ERROR",
          lastError,
          ...(lastDebugJson !== undefined && { lastDebugJson: lastDebugJson as unknown as Prisma.InputJsonValue }),
        },
      });
      return NextResponse.json(
        { ok: false, error: "fanvue_sync_failed" },
        { status: 500 }
      );
    }
    if (process.env.NODE_ENV !== "production") {
      console.log("Fanvue sync error:", msg);
    }
    return NextResponse.json({ error: msg, ok: false }, { status: 500 });
  }
}
