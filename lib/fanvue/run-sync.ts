/**
 * Fanvue sync — fetch creators and earnings from the API, bucket by UTC+2 local
 * day, write to DB.
 *
 * Architecture
 * ────────────
 * All creators are started concurrently immediately.  Every Fanvue HTTP request
 * passes through a single AdaptiveLimiter that caps total in-flight requests and
 * automatically backs off when 429/502/503/504 responses are detected.
 *
 * Concurrency invariants:
 *   • At most LIMITER_MAX in-flight Fanvue requests at any time (global, cross-creator)
 *   • Pagination within a creator is sequential (page N+1 starts after page N)
 *   • Chunks within a creator are sequential (chunk N+1 starts after chunk N)
 *   • fanvueCreatorDailyEarnings rows are written chunk-by-chunk, while other
 *     creators are still running (different rows → no DB conflict)
 *   • agencyDailyRevenue is written once at the very end, after all creators finish
 *
 * All date bucketing uses getLocalDateKey(ts) with the dynamic Europe/Bucharest offset.
 */

import { prisma } from "@/lib/db";
import { fanvueFetch } from "@/lib/providers/fanvue/client";
import { AdaptiveLimiter } from "@/lib/fanvue/adaptive-limiter";
import type { LimiterDiagnostics } from "@/lib/fanvue/adaptive-limiter";
import type { FanvuePeriod } from "@/lib/time/fanvue-range";
import {
  getFanvuePeriodRange,
  getLocalDateKey,
  toDateOnly,
  getFanvueLastNDaysRange,
  splitRangeIntoChunks,
  getBucharestOffsetMinutes,
} from "@/lib/time/fanvue-range";

// ─── Constants ────────────────────────────────────────────────────────────────

const CENTS_TO_DOLLARS  = 1 / 100;
const PAGE_SIZE         = 50;   // creators list
const EARNINGS_PAGE_SIZE = 20;  // earnings pagination (smaller = lighter per request)

// Small courtesy pauses — the limiter is the primary rate-control mechanism
const DELAY_BETWEEN_PAGES_MS  = 100;  // between cursor pages within one creator+chunk
const DELAY_BETWEEN_CHUNKS_MS = 200;  // between 7-day chunks within one creator (rebuild only)

// Adaptive limiter config
const LIMITER_INITIAL = 4;  // starting in-flight Fanvue request slots
const LIMITER_MAX     = 8;  // ceiling
const LIMITER_MIN     = 1;  // floor

const SYNC_DAYS  = 33;
const CHUNK_DAYS = 7;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ─── Internal types ───────────────────────────────────────────────────────────

type DayAgg = { total: number; messages: number; tips: number; subscriptions: number };

interface CreatorTaskResult {
  fanvueUuid: string;
  /** Per-date revenue in cents across all chunks/pages — used to roll up agencyDailyRevenue. */
  revenueCentsByDate: Map<string, number>;
  pagesFetched: number;
  chunksProcessed: number;
  dailyRowsUpserted: number;
}

// ─── Parsing helpers ──────────────────────────────────────────────────────────

function getEarningsArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return [];
  // Common field names for the items array
  for (const key of ["data", "items", "results", "earnings", "records", "content"]) {
    if (Array.isArray(p[key])) return p[key] as unknown[];
  }
  return [];
}

/**
 * Extract the next-page cursor from a variety of response shapes.
 * Checks top-level keys, nested pagination/meta objects, and URL-style "next" links.
 */
function getNextCursor(payload: unknown): string | null {
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return null;

  // Top-level cursor fields
  for (const key of ["nextCursor", "next_cursor", "cursor", "afterCursor", "after"]) {
    const v = p[key];
    if (typeof v === "string" && v) return v;
  }

  // Top-level "next" that might be a URL (extract cursor= param) or a bare cursor
  if (typeof p.next === "string" && p.next) {
    try {
      const url = new URL(p.next, "https://api.fanvue.com");
      const c = url.searchParams.get("cursor") ?? url.searchParams.get("after");
      if (c) return c;
    } catch {
      // Not a URL — treat as raw cursor string
      return p.next;
    }
  }

  // Nested objects: pagination, meta, links, pageInfo
  for (const nsKey of ["pagination", "meta", "links", "pageInfo", "paging"]) {
    const ns = p[nsKey];
    if (!ns || typeof ns !== "object") continue;
    const nsObj = ns as Record<string, unknown>;
    for (const key of ["cursor", "nextCursor", "next_cursor", "next", "afterCursor", "after", "endCursor"]) {
      const v = nsObj[key];
      if (typeof v === "string" && v) return v;
    }
  }

  return null;
}

type PaginationToken =
  | { kind: "cursor"; value: string }
  | { kind: "page"; value: number };

function getNextPaginationToken(
  payload: unknown,
  pageSize: number,
  itemCount: number
): PaginationToken | null {
  const nextCursor = getNextCursor(payload);
  if (nextCursor) {
    // Numeric cursor-like values from explicit cursor fields are still treated as cursors.
    return { kind: "cursor", value: nextCursor };
  }

  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return null;

  // Some endpoints use hasMore + page (page-based pagination without cursor fields).
  const topHasMore = p.hasMore === true || p.has_more === true;
  if (topHasMore && typeof p.page === "number" && Number.isFinite(p.page)) {
    return { kind: "page", value: p.page + 1 };
  }

  for (const nsKey of ["pagination", "meta", "pageInfo", "paging"]) {
    const ns = p[nsKey];
    if (!ns || typeof ns !== "object") continue;
    const nsObj = ns as Record<string, unknown>;
    const nsHasMore = nsObj.hasMore === true || nsObj.has_more === true;
    if (nsHasMore && typeof nsObj.page === "number" && Number.isFinite(nsObj.page)) {
      return { kind: "page", value: nsObj.page + 1 };
    }
  }

  return null;
}

function parseCreatorsList(
  payload: unknown
): { fanvueUuid: string; handle?: string; displayName?: string; avatarUrl?: string }[] {
  const out: { fanvueUuid: string; handle?: string; displayName?: string; avatarUrl?: string }[] = [];
  for (const item of getEarningsArray(payload)) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const fanvueUuid =
      typeof obj.userUuid === "string" ? obj.userUuid :
      typeof obj.uuid    === "string" ? obj.uuid    :
      typeof obj.id      === "string" ? obj.id      : "";
    if (!fanvueUuid) continue;
    out.push({
      fanvueUuid,
      handle:      typeof obj.handle      === "string" ? obj.handle      : undefined,
      displayName: typeof obj.displayName === "string" ? obj.displayName :
                   typeof obj.name        === "string" ? obj.name        : undefined,
      avatarUrl:   typeof obj.avatarUrl   === "string" ? obj.avatarUrl   :
                   typeof obj.avatar      === "string" ? obj.avatar      : undefined,
    });
  }
  return out;
}

function parseEarningsItems(
  payload: unknown
): { date: Date; amountCents: number; source?: string }[] {
  const out: { date: Date; amountCents: number; source?: string }[] = [];
  for (const item of getEarningsArray(payload)) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const dateRaw = obj.date ?? obj.createdAt ?? obj.periodStart ?? obj.paidAt;
    const amountCents =
      typeof obj.net       === "number" ? obj.net       :
      typeof obj.netAmount === "number" ? obj.netAmount :
      typeof obj.amount    === "number" ? obj.amount    :
      Number(obj.net) || Number(obj.amount) || 0;
    if (!dateRaw || Number.isNaN(amountCents)) continue;
    const date = new Date(dateRaw as string);
    if (Number.isNaN(date.getTime())) continue;
    out.push({ date, amountCents, source: typeof obj.source === "string" ? obj.source : undefined });
  }
  return out;
}

/** Merge parsed earnings items into running accumulators. */
function accumulateItems(
  items: { date: Date; amountCents: number; source?: string }[],
  byDay: Map<string, DayAgg>,
  revenueCentsByDate: Map<string, number>
): void {
  for (const { date, amountCents, source } of items) {
    const key = getLocalDateKey(date, getBucharestOffsetMinutes(date));
    revenueCentsByDate.set(key, (revenueCentsByDate.get(key) ?? 0) + amountCents);
    const dollars = amountCents * CENTS_TO_DOLLARS;
    const cur = byDay.get(key) ?? { total: 0, messages: 0, tips: 0, subscriptions: 0 };
    cur.total += dollars;
    const s = (source ?? "").toLowerCase();
    if (s === "subscription" || s === "renewal") cur.subscriptions += dollars;
    else if (s === "message") cur.messages += dollars;
    else if (s === "tip") cur.tips += dollars;
    byDay.set(key, cur);
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Build the onThrottle option that wires fanvueFetch back to the limiter. */
function throttleOpt(limiter: AdaptiveLimiter) {
  return { onThrottle: () => limiter.onThrottleSignal() };
}

// ─── Public result types ──────────────────────────────────────────────────────

export interface RunFanvueSyncResult {
  ok: boolean;
  creatorsUpserted: number;
  creatorsProcessed: number;
  creatorsFailedToFetch: number;
  chunksProcessed: number;
  pagesFetched: number;
  dailyRowsUpserted: number;
  daysSynced: number;
  startDate: string;
  endDate: string;
  startLocal: string;
  endLocal: string;
  limiterDiagnostics: LimiterDiagnostics;
}

export interface RunFanvueRebuildResult extends RunFanvueSyncResult {
  rebuilt: true;
  deletedCreatorDailyRows: number;
  deletedAgencyRows: number;
}

// ─── runFanvueSync ────────────────────────────────────────────────────────────

/**
 * Sync Fanvue for the given period.  All creators start concurrently; every
 * HTTP request is gated through the global adaptive limiter.
 */
export async function runFanvueSync(
  userId: string,
  accessToken: string,
  period: FanvuePeriod
): Promise<RunFanvueSyncResult> {
  const range = getFanvuePeriodRange(period);
  const limiter = new AdaptiveLimiter({ initial: LIMITER_INITIAL, max: LIMITER_MAX, min: LIMITER_MIN });

  // Fetch full creators list (counts toward limiter)
  const parsedCreators: { fanvueUuid: string; handle?: string; displayName?: string; avatarUrl?: string }[] = [];
  let creatorsPagesFetched = 0;
  let creatorsPageToken: PaginationToken | null = { kind: "page", value: 1 };
  do {
    const q = new URLSearchParams({ size: String(PAGE_SIZE) });
    if (creatorsPageToken?.kind === "page") q.set("page", String(creatorsPageToken.value));
    if (creatorsPageToken?.kind === "cursor") q.set("cursor", creatorsPageToken.value);
    const creatorsPayload = await limiter.run(() =>
      fanvueFetch<unknown>(`/creators?${q}`, accessToken, throttleOpt(limiter))
    );
    creatorsPagesFetched++;
    const pageCreators = parseCreatorsList(creatorsPayload);
    parsedCreators.push(...pageCreators);
    creatorsPageToken = getNextPaginationToken(creatorsPayload, PAGE_SIZE, pageCreators.length);
    if (!creatorsPageToken && pageCreators.length >= PAGE_SIZE) {
      console.warn(`[fanvue-sync] creators: got ${pageCreators.length} items but no pagination token — possible truncation`);
    }
    if (creatorsPageToken) await sleep(DELAY_BETWEEN_PAGES_MS);
  } while (creatorsPageToken);

  // Upsert creator records sequentially (DB only, not API)
  const fanvueUuidToCreatorId = new Map<string, string>();
  for (const c of parsedCreators) {
    const creator = await prisma.fanvueCreator.upsert({
      where: { userId_fanvueUuid: { userId, fanvueUuid: c.fanvueUuid } },
      create: { userId, fanvueUuid: c.fanvueUuid, handle: c.handle, displayName: c.displayName, avatarUrl: c.avatarUrl },
      update: { handle: c.handle, displayName: c.displayName, avatarUrl: c.avatarUrl },
    });
    fanvueUuidToCreatorId.set(c.fanvueUuid, creator.id);
  }

  // Clear existing data for this period so partial syncs can't corrupt stored totals.
  // We delete only after successfully obtaining the creators list.
  await prisma.fanvueCreatorDailyEarnings.deleteMany({
    where: { creator: { userId }, date: { gte: range.startDateUtc, lte: range.endDateUtc } },
  });
  await prisma.agencyDailyRevenue.deleteMany({
    where: { userId, date: { gte: range.startDateUtc, lte: range.endDateUtc } },
  });

  // ── Launch all creators concurrently ──────────────────────────────────────
  const creatorTasks = parsedCreators.map(async (c): Promise<CreatorTaskResult> => {
    const creatorId = fanvueUuidToCreatorId.get(c.fanvueUuid);
    if (!creatorId) return { fanvueUuid: c.fanvueUuid, revenueCentsByDate: new Map(), pagesFetched: 0, chunksProcessed: 0, dailyRowsUpserted: 0 };

    const byDay = new Map<string, DayAgg>();
    const revenueCentsByDate = new Map<string, number>();
    let pagesFetched = 0;
    let earningsPageToken: PaginationToken | null = null;

    // Paginate the full range (no chunks for regular sync)
    do {
      const q = new URLSearchParams({
        startDate: range.startUtcIso,
        endDate:   range.endUtcIso,
        size:      String(EARNINGS_PAGE_SIZE),
      });
      if (earningsPageToken?.kind === "cursor") q.set("cursor", earningsPageToken.value);
      if (earningsPageToken?.kind === "page") q.set("page", String(earningsPageToken.value));
      const earnings = await limiter.run(() =>
        fanvueFetch<unknown>(
          `/creators/${encodeURIComponent(c.fanvueUuid)}/insights/earnings?${q}`,
          accessToken,
          throttleOpt(limiter)
        )
      );
      pagesFetched++;
      const pageItems = parseEarningsItems(earnings);
      accumulateItems(pageItems, byDay, revenueCentsByDate);
      earningsPageToken = getNextPaginationToken(earnings, EARNINGS_PAGE_SIZE, pageItems.length);
      if (!earningsPageToken && pageItems.length >= EARNINGS_PAGE_SIZE) {
        // Got a full page but no cursor — log in case API changed its pagination shape
        console.warn(`[fanvue-sync] ${c.fanvueUuid}: got ${pageItems.length} items but no next pagination token — possible truncation`);
      }
      if (earningsPageToken) await sleep(DELAY_BETWEEN_PAGES_MS);
    } while (earningsPageToken);

    // Write this creator's rows to DB (runs concurrently with other creators; different rows → no conflict)
    let dailyRowsUpserted = 0;
    for (const [dateStr, agg] of byDay) {
      const date = toDateOnly(dateStr);
      await prisma.fanvueCreatorDailyEarnings.upsert({
        where: { creatorId_date: { creatorId, date } },
        create: { creatorId, date, total: round2(agg.total), messages: round2(agg.messages), tips: round2(agg.tips), subscriptions: round2(agg.subscriptions) },
        update: { total: round2(agg.total), messages: round2(agg.messages), tips: round2(agg.tips), subscriptions: round2(agg.subscriptions) },
      });
      dailyRowsUpserted++;
    }

    return { fanvueUuid: c.fanvueUuid, revenueCentsByDate, pagesFetched, chunksProcessed: 0, dailyRowsUpserted };
  });

  const settled = await Promise.allSettled(creatorTasks);

  // ── Merge results & write agencyDailyRevenue ──────────────────────────────
  const globalRevenueCents = new Map<string, number>();
  let totalPagesFetched = creatorsPagesFetched;
  let totalDailyRowsUpserted = 0;
  let creatorsProcessed = 0;
  let creatorsFailedToFetch = 0;

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      const r = outcome.value;
      totalPagesFetched += r.pagesFetched;
      totalDailyRowsUpserted += r.dailyRowsUpserted;
      for (const [dateStr, cents] of r.revenueCentsByDate) {
        globalRevenueCents.set(dateStr, (globalRevenueCents.get(dateStr) ?? 0) + cents);
      }
      creatorsProcessed++;
    } else {
      creatorsFailedToFetch++;
      // Always log creator failures so they show up in Render logs
      console.error("[fanvue-sync] creator task failed:", outcome.reason);
    }
  }

  for (const [dateStr, revenueCents] of globalRevenueCents) {
    const date = toDateOnly(dateStr);
    const revenue = revenueCents * CENTS_TO_DOLLARS;
    await prisma.agencyDailyRevenue.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, fanvue: revenue, infloww: 0, total: revenue },
      update: { fanvue: revenue, infloww: 0, total: revenue },
    });
  }

  const diag = limiter.diagnostics;
  console.log("[fanvue-sync] completed", {
    totalCreators: parsedCreators.length,
    creatorsProcessed,
    creatorsFailedToFetch,
    totalPagesFetched,
    ...diag,
  });

  const daysSynced = Math.ceil(
    (range.endDateUtc.getTime() - range.startDateUtc.getTime()) / (24 * 60 * 60 * 1000)
  ) + 1;

  return {
    ok: true,
    creatorsUpserted: parsedCreators.length,
    creatorsProcessed,
    creatorsFailedToFetch,
    chunksProcessed: 1,
    pagesFetched: totalPagesFetched,
    dailyRowsUpserted: totalDailyRowsUpserted,
    daysSynced,
    startDate: range.startUtcIso,
    endDate: range.endUtcIso,
    startLocal: range.startLocal,
    endLocal: range.endLocal,
    limiterDiagnostics: diag,
  };
}

// ─── runFanvueRebuild ─────────────────────────────────────────────────────────

/**
 * Full 33-day rebuild: delete existing Fanvue data in the range, then re-import
 * everything.  All creators run concurrently; each creator saves chunk-by-chunk
 * so progress survives a mid-sync failure.
 */
export async function runFanvueRebuild(
  userId: string,
  accessToken: string
): Promise<RunFanvueRebuildResult> {
  const range  = getFanvueLastNDaysRange(SYNC_DAYS);
  const chunks = splitRangeIntoChunks(range.startDateUtc, range.endDateUtc, CHUNK_DAYS);
  const limiter = new AdaptiveLimiter({ initial: LIMITER_INITIAL, max: LIMITER_MAX, min: LIMITER_MIN });

  // Clear existing data for the window
  const r1 = await prisma.fanvueCreatorDailyEarnings.deleteMany({
    where: { creator: { userId }, date: { gte: range.startDateUtc, lte: range.endDateUtc } },
  });
  const r2 = await prisma.agencyDailyRevenue.deleteMany({
    where: { userId, date: { gte: range.startDateUtc, lte: range.endDateUtc } },
  });

  // Fetch full creators list
  const parsedCreators: { fanvueUuid: string; handle?: string; displayName?: string; avatarUrl?: string }[] = [];
  let creatorsPagesFetched = 0;
  let creatorsPageToken: PaginationToken | null = { kind: "page", value: 1 };
  do {
    const q = new URLSearchParams({ size: String(PAGE_SIZE) });
    if (creatorsPageToken?.kind === "page") q.set("page", String(creatorsPageToken.value));
    if (creatorsPageToken?.kind === "cursor") q.set("cursor", creatorsPageToken.value);
    const creatorsPayload = await limiter.run(() =>
      fanvueFetch<unknown>(`/creators?${q}`, accessToken, throttleOpt(limiter))
    );
    creatorsPagesFetched++;
    const pageCreators = parseCreatorsList(creatorsPayload);
    parsedCreators.push(...pageCreators);
    creatorsPageToken = getNextPaginationToken(creatorsPayload, PAGE_SIZE, pageCreators.length);
    if (!creatorsPageToken && pageCreators.length >= PAGE_SIZE) {
      console.warn(`[fanvue-rebuild] creators: got ${pageCreators.length} items but no pagination token — possible truncation`);
    }
    if (creatorsPageToken) await sleep(DELAY_BETWEEN_PAGES_MS);
  } while (creatorsPageToken);

  const fanvueUuidToCreatorId = new Map<string, string>();
  for (const c of parsedCreators) {
    const creator = await prisma.fanvueCreator.upsert({
      where: { userId_fanvueUuid: { userId, fanvueUuid: c.fanvueUuid } },
      create: { userId, fanvueUuid: c.fanvueUuid, handle: c.handle, displayName: c.displayName, avatarUrl: c.avatarUrl },
      update: { handle: c.handle, displayName: c.displayName, avatarUrl: c.avatarUrl },
    });
    fanvueUuidToCreatorId.set(c.fanvueUuid, creator.id);
  }

  // ── Launch all creators concurrently ──────────────────────────────────────
  const creatorTasks = parsedCreators.map(async (c): Promise<CreatorTaskResult> => {
    const creatorId = fanvueUuidToCreatorId.get(c.fanvueUuid);
    if (!creatorId) return { fanvueUuid: c.fanvueUuid, revenueCentsByDate: new Map(), pagesFetched: 0, chunksProcessed: 0, dailyRowsUpserted: 0 };

    const revenueCentsByDate = new Map<string, number>();
    let pagesFetched = 0;
    let chunksProcessed = 0;
    let dailyRowsUpserted = 0;

    for (const chunk of chunks) {
      // Accumulate this chunk's data into a temporary map
      const chunkByDay = new Map<string, DayAgg>();
      let earningsPageToken: PaginationToken | null = null;

      do {
        const q = new URLSearchParams({
          startDate: chunk.startUtcIso,
          endDate:   chunk.endUtcIso,
          size:      String(EARNINGS_PAGE_SIZE),
        });
        if (earningsPageToken?.kind === "cursor") q.set("cursor", earningsPageToken.value);
        if (earningsPageToken?.kind === "page") q.set("page", String(earningsPageToken.value));
        const earnings = await limiter.run(() =>
          fanvueFetch<unknown>(
            `/creators/${encodeURIComponent(c.fanvueUuid)}/insights/earnings?${q}`,
            accessToken,
            throttleOpt(limiter)
          )
        );
        pagesFetched++;
        const chunkPageItems = parseEarningsItems(earnings);
        accumulateItems(chunkPageItems, chunkByDay, revenueCentsByDate);
        earningsPageToken = getNextPaginationToken(earnings, EARNINGS_PAGE_SIZE, chunkPageItems.length);
        if (!earningsPageToken && chunkPageItems.length >= EARNINGS_PAGE_SIZE) {
          console.warn(`[fanvue-rebuild] ${c.fanvueUuid}: got ${chunkPageItems.length} items but no next pagination token — possible truncation`);
        }
        if (earningsPageToken) await sleep(DELAY_BETWEEN_PAGES_MS);
      } while (earningsPageToken);

      // ── Chunk-by-chunk save: write immediately while other creators still run ──
      for (const [dateStr, agg] of chunkByDay) {
        const date = toDateOnly(dateStr);
        await prisma.fanvueCreatorDailyEarnings.upsert({
          where: { creatorId_date: { creatorId, date } },
          create: { creatorId, date, total: round2(agg.total), messages: round2(agg.messages), tips: round2(agg.tips), subscriptions: round2(agg.subscriptions) },
          update: { total: round2(agg.total), messages: round2(agg.messages), tips: round2(agg.tips), subscriptions: round2(agg.subscriptions) },
        });
        dailyRowsUpserted++;
      }

      chunksProcessed++;
      await sleep(DELAY_BETWEEN_CHUNKS_MS);
    }

    return { fanvueUuid: c.fanvueUuid, revenueCentsByDate, pagesFetched, chunksProcessed, dailyRowsUpserted };
  });

  const settled = await Promise.allSettled(creatorTasks);

  // ── Merge results & write agencyDailyRevenue ──────────────────────────────
  const globalRevenueCents = new Map<string, number>();
  let totalPagesFetched = creatorsPagesFetched;
  let totalChunksProcessed = 0;
  let totalDailyRowsUpserted = 0;
  let creatorsProcessed = 0;
  let creatorsFailedToFetch = 0;

  for (const outcome of settled) {
    if (outcome.status === "fulfilled") {
      const r = outcome.value;
      totalPagesFetched += r.pagesFetched;
      totalChunksProcessed += r.chunksProcessed;
      totalDailyRowsUpserted += r.dailyRowsUpserted;
      for (const [dateStr, cents] of r.revenueCentsByDate) {
        globalRevenueCents.set(dateStr, (globalRevenueCents.get(dateStr) ?? 0) + cents);
      }
      creatorsProcessed++;
    } else {
      creatorsFailedToFetch++;
      // Always log creator failures so they show up in Render logs
      console.error("[fanvue-rebuild] creator task failed:", outcome.reason);
    }
  }

  for (const [dateStr, revenueCents] of globalRevenueCents) {
    const date = toDateOnly(dateStr);
    const revenue = revenueCents * CENTS_TO_DOLLARS;
    await prisma.agencyDailyRevenue.upsert({
      where: { userId_date: { userId, date } },
      create: { userId, date, fanvue: revenue, infloww: 0, total: revenue },
      update: { fanvue: revenue, infloww: 0, total: revenue },
    });
  }

  const diag = limiter.diagnostics;
  console.log("[fanvue-rebuild] completed", {
    totalCreators: parsedCreators.length,
    totalChunksPerCreator: chunks.length,
    totalChunksProcessed,
    creatorsProcessed,
    creatorsFailedToFetch,
    totalPagesFetched,
    startConcurrency: diag.startConcurrency,
    maxConcurrencyReached: diag.maxConcurrencyReached,
    finalConcurrency: diag.finalConcurrency,
    throttleSignalsReceived: diag.throttleSignalsReceived,
    concurrencyWasReduced: diag.concurrencyWasReduced,
  });

  return {
    ok: true,
    rebuilt: true,
    deletedCreatorDailyRows: r1.count,
    deletedAgencyRows: r2.count,
    creatorsUpserted: parsedCreators.length,
    creatorsProcessed,
    creatorsFailedToFetch,
    chunksProcessed: totalChunksProcessed,
    pagesFetched: totalPagesFetched,
    dailyRowsUpserted: totalDailyRowsUpserted,
    daysSynced: SYNC_DAYS,
    startDate: range.startUtcIso,
    endDate: range.endUtcIso,
    startLocal: range.startLocal,
    endLocal: range.endLocal,
    limiterDiagnostics: diag,
  };
}
