import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

const PROVIDER = "FANVUE";

/**
 * GET /api/fanvue/oauth/diagnostics – return last token exchange error details (no secrets). Dev only. ADMIN only.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const conn = await prisma.providerConnection.findUnique({
    where: {
      userId_provider: { userId: session.user.id, provider: PROVIDER },
    },
    select: {
      status: true,
      lastError: true,
      lastDebugJson: true,
    },
  });

  if (!conn) {
    return NextResponse.json({
      ok: true,
      connectionStatus: null,
      lastError: null,
      lastDebugJson: null,
    });
  }

  return NextResponse.json({
    ok: true,
    connectionStatus: conn.status,
    lastError: conn.lastError,
    lastDebugJson: conn.lastDebugJson,
  });
}
