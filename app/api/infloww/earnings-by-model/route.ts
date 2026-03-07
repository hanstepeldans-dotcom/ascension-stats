import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";

export interface ModelEarningsResponse {
  modelId: string;
  modelName: string;
  total: number;
  messages: number;
  tips: number;
  subscriptions: number;
}

/**
 * GET /api/infloww/earnings-by-model?period=week|month|today|yesterday&metricType=net|gross
 * Returns per-model earnings for the selected period. Auth required.
 * Placeholder: returns empty list until Infloww API is integrated.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const models: ModelEarningsResponse[] = [];

  return NextResponse.json({ models });
}
