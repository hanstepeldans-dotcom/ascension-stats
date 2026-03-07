import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

const PROVIDER = "FANVUE";

/** POST /api/fanvue/oauth/disconnect – clear tokens and set status DISCONNECTED. Auth required. */
export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.providerConnection.upsert({
    where: {
      userId_provider: { userId: session.user.id, provider: PROVIDER },
    },
    create: {
      userId: session.user.id,
      provider: PROVIDER,
      status: "DISCONNECTED",
    },
    update: {
      accessToken: null,
      refreshToken: null,
      status: "DISCONNECTED",
      lastError: null,
      oauthState: null,
      oauthStateExpiresAt: null,
      pkceVerifier: null,
      pkceVerifierExpiresAt: null,
    },
  });

  return NextResponse.json({ ok: true });
}
