export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { runInflowwSyncNow, getInflowwSyncStatus } from "@/lib/infloww/scheduler";
import { isInflowwConfigured, listMissingInflowwEnv } from "@/lib/providers/infloww/api";

/**
 * GET  /api/infloww/sync  → current background-sync status (last run, next-ness, config state).
 * POST /api/infloww/sync  → trigger a sync now. ?days=N overrides the window.
 *
 * Both require a logged-in user. The sync itself is agency-wide (writes for all
 * target users), so any operator can trigger/inspect it.
 */

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(getInflowwSyncStatus());
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isInflowwConfigured()) {
    return NextResponse.json(
      {
        ok: false,
        error: "Infloww API not configured",
        missing: listMissingInflowwEnv(),
      },
      { status: 400 }
    );
  }

  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  const days = daysParam ? parseInt(daysParam, 10) : undefined;

  const result = await runInflowwSyncNow({
    days: Number.isInteger(days) && days! >= 1 && days! <= 366 ? days : undefined,
  });

  if (result === null) {
    const status = getInflowwSyncStatus();
    // Either a run is already in progress, or the last run errored.
    if (status.running) {
      return NextResponse.json(
        { ok: false, error: "A sync is already in progress", status },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { ok: false, error: status.lastError ?? "Sync failed", status },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
}
