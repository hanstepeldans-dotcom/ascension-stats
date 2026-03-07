import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { getRequestedScopeString } from "@/lib/providers/fanvue/oauth";

/**
 * GET /api/fanvue/scopes
 * Returns the scope string used when building the Fanvue OAuth URL. Auth required.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const scope = getRequestedScopeString();
  return NextResponse.json({ scope });
}
