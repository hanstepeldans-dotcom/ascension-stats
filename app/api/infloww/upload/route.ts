export const dynamic = "force-dynamic";

import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";
import { parseInflowwDocument } from "@/lib/infloww/parser";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * POST /api/infloww/upload
 *
 * Accepts a multipart/form-data upload with field name "file" (CSV or XLSX).
 * Parses the document, upserts rows into InflowwCreatorDailyEarnings, saves
 * header-mapping metadata into InflowwUploadMeta, and returns a summary.
 *
 * ?inspect=1  → dry-run: returns header mapping + preview rows without DB writes.
 *
 * Auth required.
 */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Missing file field" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!["csv", "xlsx", "xls"].includes(ext)) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload a CSV, XLSX, or XLS file." },
      { status: 400 }
    );
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // ── ?inspect=1 dry-run ────────────────────────────────────────────────────
  if (req.nextUrl.searchParams.get("inspect") === "1") {
    try {
      const result = parseInflowwDocument(buffer, file.name.replace(/\.[^.]+$/, ""));
      return NextResponse.json({
        ok: true,
        fileName: file.name,
        rawHeaders: result.rawHeaders,
        headerMapping: result.headerMapping,
        unmappedHeaders: result.unmappedHeaders,
        warnings: result.warnings,
        firstRowsRaw: result.firstRowsRaw,
        previewRows: result.rows.slice(0, 5).map((r) => ({ ...r, date: r.date.toISOString() })),
      });
    } catch (e) {
      return NextResponse.json(
        { error: `Inspect failed: ${e instanceof Error ? e.message : String(e)}` },
        { status: 422 }
      );
    }
  }

  // ── parse ─────────────────────────────────────────────────────────────────
  let result;
  try {
    result = parseInflowwDocument(buffer, file.name.replace(/\.[^.]+$/, ""));
  } catch (e) {
    return NextResponse.json(
      { error: `Failed to parse file: ${e instanceof Error ? e.message : String(e)}` },
      { status: 422 }
    );
  }

  const { rows, rawHeaders, headerMapping, unmappedHeaders, warnings, firstRowsRaw } = result;

  if (rows.length === 0) {
    return NextResponse.json(
      {
        error: "No data rows found. Check that the file has a recognised header row.",
        rawHeaders,
        warnings,
      },
      { status: 422 }
    );
  }

  const userId = session.user.id;
  let upserted = 0;

  // ── upsert earnings rows ──────────────────────────────────────────────────
  for (const row of rows) {
    await prisma.inflowwCreatorDailyEarnings.upsert({
      where: {
        userId_creatorName_date: {
          userId,
          creatorName: row.creatorName,
          date: row.date,
        },
      },
      create: {
        userId,
        creatorName: row.creatorName,
        date: row.date,
        total: row.total,
        subscriptions: row.subscriptions,
        messages: row.messages,
        tips: row.tips,
        posts: row.posts,
        referrals: row.referrals,
        streams: row.streams,
        subscribers: row.subscribers,
      },
      update: {
        total: row.total,
        subscriptions: row.subscriptions,
        messages: row.messages,
        tips: row.tips,
        posts: row.posts,
        referrals: row.referrals,
        streams: row.streams,
        subscribers: row.subscribers,
      },
    });
    upserted += 1;
  }

  // ── save upload metadata for /api/infloww/debug/mapping-sample ───────────
  // firstRowsRaw comes directly from the parser (raw header→value strings).
  const sampleRowsMapped = rows.slice(0, 5).map((r) => ({
    creatorName: r.creatorName,
    date: r.date.toISOString().slice(0, 10),
    total: r.total,
    subscriptions: r.subscriptions,
    messages: r.messages,
    tips: r.tips,
    posts: r.posts,
    referrals: r.referrals,
    streams: r.streams,
    subscribers: r.subscribers,
  }));

  try {
    await prisma.inflowwUploadMeta.upsert({
      where: { userId },
      create: {
        userId,
        fileName: file.name,
        rawHeaders: rawHeaders as unknown as import("@prisma/client").Prisma.InputJsonValue,
        mappedFields: headerMapping as unknown as import("@prisma/client").Prisma.InputJsonValue,
        firstRowsRaw: firstRowsRaw as unknown as import("@prisma/client").Prisma.InputJsonValue,
        firstRowsMapped: sampleRowsMapped as unknown as import("@prisma/client").Prisma.InputJsonValue,
        warnings: warnings as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
      update: {
        fileName: file.name,
        rawHeaders: rawHeaders as unknown as import("@prisma/client").Prisma.InputJsonValue,
        mappedFields: headerMapping as unknown as import("@prisma/client").Prisma.InputJsonValue,
        firstRowsRaw: firstRowsRaw as unknown as import("@prisma/client").Prisma.InputJsonValue,
        firstRowsMapped: sampleRowsMapped as unknown as import("@prisma/client").Prisma.InputJsonValue,
        warnings: warnings as unknown as import("@prisma/client").Prisma.InputJsonValue,
      },
    });
  } catch {
    // Non-fatal: meta save failure doesn't affect the import result
    warnings.push("Warning: failed to save upload metadata (debug endpoint may show stale data).");
  }

  // ── summary ───────────────────────────────────────────────────────────────
  const creators = [...new Set(rows.map((r) => r.creatorName))];
  const dates = rows.map((r) => r.date.toISOString().slice(0, 10)).sort();
  const minDate = dates[0] ?? null;
  const maxDate = dates[dates.length - 1] ?? null;
  const uniqueDates = [...new Set(dates)].length;

  return NextResponse.json({
    ok: true,
    fileName: file.name,
    rowsParsed: rows.length,
    rowsUpserted: upserted,
    creators,
    dateRange: { minDate, maxDate, uniqueDates },
    headerMapping,
    unmappedHeaders,
    warnings,
  });
}
