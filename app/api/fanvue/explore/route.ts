import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { fanvueFetchRaw, isInsufficientScopesError } from "@/lib/providers/fanvue/client";

const PROVIDER = "FANVUE";

/** Documented Fanvue API endpoints (no /v1 prefix). */
const ENDPOINTS_TO_TRY = [
  "/creators",
  "/agencies/team-members",
  "/me",
  "/users/me",
];

const PREVIEW_TEXT_MAX = 300;

/** Build a safe preview of JSON: limit depth and size, no tokens/secrets. */
function buildPreview(body: unknown): unknown {
  if (body === null || body === undefined) return body;
  if (typeof body !== "object") return body;

  const sanitize = (val: unknown, depth: number): unknown => {
    if (depth > 2) return "[…]";
    if (val === null || val === undefined) return val;
    if (typeof val === "string") {
      if (/token|secret|password|auth/i.test(val)) return "***";
      return val.length > 100 ? val.slice(0, 100) + "…" : val;
    }
    if (typeof val === "number" || typeof val === "boolean") return val;
    if (Array.isArray(val)) {
      return val.slice(0, 5).map((item) => sanitize(item, depth + 1));
    }
    if (typeof val === "object") {
      const obj = val as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(obj).slice(0, 15)) {
        if (/token|secret|password/i.test(key)) continue;
        out[key] = sanitize(obj[key], depth + 1);
      }
      return out;
    }
    return val;
  };

  return sanitize(body, 0);
}

/**
 * GET /api/fanvue/explore
 * Tries documented Fanvue API endpoints and returns status + preview for each. ADMIN only.
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
  });

  if (!connection || connection.status !== "CONNECTED" || !connection.accessToken) {
    return NextResponse.json(
      { error: "Fanvue not connected or no access token" },
      { status: 400 }
    );
  }

  const accessToken = connection.accessToken;
  const endpoints: {
    endpoint: string;
    status: number;
    preview?: unknown;
    responseTextPreview?: string;
    error?: string;
    insufficientScopes?: boolean;
  }[] = [];

  for (const endpoint of ENDPOINTS_TO_TRY) {
    try {
      const { status, text, json } = await fanvueFetchRaw(endpoint, accessToken);

      let preview: unknown = undefined;
      let responseTextPreview: string | undefined;
      let error: string | undefined;
      const insufficientScopes =
        status === 403 &&
        (isInsufficientScopesError(text) ||
          (json !== undefined && isInsufficientScopesError(JSON.stringify(json))));

      if (json !== undefined) {
        preview = buildPreview(json);
      } else if (text) {
        responseTextPreview = text.slice(0, PREVIEW_TEXT_MAX);
        if (text.length > PREVIEW_TEXT_MAX) responseTextPreview += "…";
        error = "Response not JSON";
      }

      endpoints.push({
        endpoint,
        status,
        ...(preview !== undefined && { preview }),
        ...(responseTextPreview !== undefined && { responseTextPreview }),
        ...(error && { error }),
        ...(insufficientScopes && { insufficientScopes: true }),
      });
    } catch (e) {
      endpoints.push({
        endpoint,
        status: 0,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ endpoints });
}
