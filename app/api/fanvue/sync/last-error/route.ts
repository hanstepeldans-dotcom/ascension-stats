import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

const PROVIDER = "FANVUE";

/**
 * GET /api/fanvue/sync/last-error
 * Returns last sync error details (lastError + lastDebugJson) for the current user's Fanvue connection. ADMIN only. No tokens/secrets.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  const connection = await prisma.providerConnection.findUnique({
    where: {
      userId_provider: { userId: session.user.id, provider: PROVIDER },
    },
    select: { lastError: true, lastDebugJson: true },
  });

  if (!connection) {
    return NextResponse.json(
      { lastError: null, lastDebugJson: null },
      { status: 200 }
    );
  }

  return NextResponse.json({
    lastError: connection.lastError ?? null,
    lastDebugJson: connection.lastDebugJson ?? null,
  });
}
