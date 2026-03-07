import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { isFanvueOAuthConfigured } from "@/lib/providers/fanvue/oauth";

export type ConnectionStatus = {
  provider: string;
  status: string;
  connectedAt: string | null;
  lastError: string | null;
  /** From lastDebugJson.tokenUrlHost when status is ERROR (for UI hints). */
  tokenUrlHost: string | null;
};

export type ConnectionsResponse = {
  connections: ConnectionStatus[];
  fanvueConfigured: boolean;
};

/** GET /api/settings/connections – list provider connection status for current user. Auth required. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.providerConnection.findMany({
    where: { userId: session.user.id },
    select: {
      provider: true,
      status: true,
      connectedAt: true,
      lastError: true,
      lastDebugJson: true,
    },
  });

  const connections: ConnectionStatus[] = rows.map((r) => {
    const debug = r.lastDebugJson as { tokenUrlHost?: string } | null;
    return {
      provider: r.provider,
      status: r.status,
      connectedAt: r.connectedAt?.toISOString() ?? null,
      lastError: r.lastError ?? null,
      tokenUrlHost: debug?.tokenUrlHost ?? null,
    };
  });

  return NextResponse.json({
    connections,
    fanvueConfigured: isFanvueOAuthConfigured(),
  });
}
