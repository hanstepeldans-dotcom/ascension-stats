import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import {
  getFanvueDefaultsApplied,
  listMissingFanvueEnv,
} from "@/lib/providers/fanvue/config";

export type ValidateResponse = {
  ok: boolean;
  missing: string[];
  defaultsApplied: {
    authorizationUrl: string;
    tokenUrl: string;
    apiBaseUrl: string;
  };
};

/** GET /api/fanvue/config/validate – check Fanvue env and return what's missing. Auth required. Does NOT return secrets. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const missing = listMissingFanvueEnv();
  const defaultsApplied = getFanvueDefaultsApplied();

  return NextResponse.json({
    ok: missing.length === 0,
    missing,
    defaultsApplied,
  });
}
