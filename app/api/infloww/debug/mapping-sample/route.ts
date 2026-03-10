export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

/**
 * GET /api/infloww/debug/mapping-sample
 *
 * Reads the InflowwUploadMeta record saved on the most recent upload and
 * returns the full column mapping + sample rows so you can verify that:
 *   1. Every CSV column is mapped to the correct normalized field.
 *   2. The "total" field is mapped to a GROSS total column (not "Net earnings").
 *   3. messages, tips, subscriptions are on the same earnings basis as total.
 *
 * Also cross-checks each sample row: if total < any single component, it flags
 * a suspicious mapping with an explanation.
 *
 * Auth required.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const meta = await prisma.inflowwUploadMeta.findUnique({
    where: { userId: session.user.id },
  });

  if (!meta) {
    return NextResponse.json({
      ok: false,
      error: "No upload metadata found. Upload a CSV first, then check this endpoint.",
    });
  }

  const mappedFields = meta.mappedFields as Record<string, string>;
  const rawHeaders = meta.rawHeaders as string[];
  const firstRowsRaw = meta.firstRowsRaw as Record<string, string>[];
  const firstRowsMapped = meta.firstRowsMapped as Array<{
    creatorName: string;
    date: string;
    total: number;
    subscriptions: number;
    messages: number;
    tips: number;
    posts: number;
    referrals: number;
    streams: number;
    subscribers: number;
  }>;
  const warnings = meta.warnings as string[];

  // Build reverse mapping: fieldKey → csvHeader
  const fieldToCsvHeader: Record<string, string> = {};
  for (const [field, header] of Object.entries(mappedFields)) {
    fieldToCsvHeader[field] = header;
  }

  // Per-row consistency check: total must be >= each component
  const rowConsistencyChecks = firstRowsMapped.map((row, i) => {
    const components: Record<string, number> = {
      subscriptions: row.subscriptions,
      messages: row.messages,
      tips: row.tips,
      posts: row.posts,
      referrals: row.referrals,
      streams: row.streams,
    };
    const componentSum = Object.values(components).reduce((a, b) => a + b, 0);
    const violations = Object.entries(components)
      .filter(([, v]) => v > row.total && v > 0)
      .map(([k, v]) => `${k}=${v} > total=${row.total}`);
    return {
      rowIndex: i + 1,
      creatorName: row.creatorName,
      date: row.date,
      total: row.total,
      componentSum: Math.round(componentSum * 100) / 100,
      totalEqualsComponentSum: Math.abs(row.total - componentSum) < 0.02,
      suspicious: violations.length > 0,
      violations,
    };
  });

  const anySuspicious = rowConsistencyChecks.some((r) => r.suspicious);

  return NextResponse.json({
    ok: true,
    fileName: meta.fileName,
    updatedAt: meta.updatedAt,
    detectedHeaders: rawHeaders,
    mappedFields: {
      total: fieldToCsvHeader["total"] ?? null,
      subscriptions: fieldToCsvHeader["subscriptions"] ?? null,
      messages: fieldToCsvHeader["messages"] ?? null,
      tips: fieldToCsvHeader["tips"] ?? null,
      posts: fieldToCsvHeader["posts"] ?? null,
      referrals: fieldToCsvHeader["referrals"] ?? null,
      streams: fieldToCsvHeader["streams"] ?? null,
      subscribers: fieldToCsvHeader["subscribers"] ?? null,
      creatorName: fieldToCsvHeader["creatorName"] ?? null,
      date: fieldToCsvHeader["date"] ?? null,
    },
    // Raw CSV rows exactly as they appear in the file (strings, no coercion).
    firstRowsRaw,
    // Same rows after normalization (numbers, UTC dates).
    firstRowsMapped,
    rowConsistencyChecks,
    summaryDiagnosis: {
      anySuspiciousRows: anySuspicious,
      advice: anySuspicious
        ? "One or more rows show total < a single component. " +
          "The 'total' column may be a NET/agency column, not the gross total. " +
          "After re-uploading, the parser now automatically falls back to sum-of-components when this is detected."
        : "All sample rows look consistent (total >= every component).",
    },
    parserWarnings: warnings,
  });
}
