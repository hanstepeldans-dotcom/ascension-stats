/**
 * Fanvue token freshness helper.
 *
 * Fanvue access tokens expire after ~1 hour. Any background/long-running use of
 * the Fanvue API must refresh before calling. This refreshes via the stored
 * refresh_token, persists the rotated tokens back to the ProviderConnection, and
 * returns a valid access token.
 */

import { prisma } from "@/lib/db";
import { refreshFanvueTokens } from "@/lib/providers/fanvue/oauth";

const PROVIDER = "FANVUE";

/**
 * Return a freshly-refreshed Fanvue access token for the given connection,
 * persisting the rotated access + refresh tokens. Throws if there is no refresh
 * token or the refresh fails (caller should mark the connection ERROR / prompt reconnect).
 */
export async function getFreshFanvueAccessToken(connectionId: string): Promise<string> {
  const conn = await prisma.providerConnection.findUnique({
    where: { id: connectionId },
    select: { id: true, refreshToken: true, accessToken: true },
  });
  if (!conn) throw new Error(`Fanvue connection ${connectionId} not found`);
  if (!conn.refreshToken) {
    throw new Error("No Fanvue refresh token — reconnect Fanvue");
  }

  const { tokens } = await refreshFanvueTokens(conn.refreshToken);

  await prisma.providerConnection.update({
    where: { id: conn.id },
    data: {
      accessToken: tokens.access_token,
      // Fanvue rotates refresh tokens — persist the new one, else the next refresh fails.
      refreshToken: tokens.refresh_token ?? conn.refreshToken,
      status: "CONNECTED",
      lastError: null,
    },
  });

  return tokens.access_token;
}

/** Mark a Fanvue connection as errored (e.g. refresh failed → needs reconnect). */
export async function markFanvueError(userId: string, message: string): Promise<void> {
  await prisma.providerConnection
    .update({
      where: { userId_provider: { userId, provider: PROVIDER } },
      data: { status: "ERROR", lastError: message.slice(0, 300) },
    })
    .catch(() => {});
}
