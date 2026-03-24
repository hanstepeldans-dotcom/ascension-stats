/**
 * Fanvue sync: fetch creators and earnings from API, bucket by UTC+2 local day, write to DB.
 * All date bucketing uses getLocalDateKey(ts, 120) — never UTC date string slicing.
 *
 * Creator concurrency: up to CREATOR_CONCURRENCY creators are fetched in parallel.
 * Pagination within a creator is always sequential.
 * DB writes are always sequential (after each batch resolves).
 */

import { prisma } from "@/lib/db";
import { fanvueFetch } from "@/lib/providers/fanvue/client";
import type { FanvuePeriod } from "@/lib/time/fanvue-range";
import {
  getFanvuePeriodRange,
  getLocalDateKey,
  toDateOnly,
  getFanvueLastNDaysRange,
  splitRangeIntoChunks,
} from "@/lib/time/fanvue-range";

const OFFSET_MINUTES = 120;
const CENTS_TO_DOLLARS = 1 / 100;
const PAGE_SIZE = 50;          // creators list
const EARNINGS_PAGE_SIZE = 20; // earnings pagination (smaller = lighter per request)

// Rate-limit back-off delays (ms) — reduced from previous values to speed up sync
const DELAY_BETWEEN_PAGES_MS   = 300;   // was 600 — between paginated pages within one creator+chunk
const DELAY_BETWEEN_CHUNKS_MS  = 600;   // was 1200 — after each 7-day chunk (rebuild only)
const DELAY_BETWEEN_BATCHES_MS = 1500;  // was 2000 per creator — between groups of parallel creators

// Max number of creators fetched simultaneously from the Fanvue API
const CREATOR_CONCURRENCY = 2;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ─── Shared types ────────────────────────────────────────────────────────────

type DayAgg = { total: number; messages: number; tips: number; subscriptions: number };

interface CreatorFetchResult {
  byDay: Map<string, DayAgg>;
  /** Per-date revenue in cents, used to roll up agencyDailyRevenue. */
  revenueCentsByDate: Map<string, number>;
  pagesFetched: number;
  chunksProcessed: number;
}

// ─── Parsing helpers ─────────────────────────────────────────────────────────

function getEarningsArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const p = payload as Record<string, unknown> | null;
  if (!p || typeof p !== "object") return [];
  if (Array.isArray(p.data)) return p.data;
  if (Array.isArray(p.items)) return p.items;
  return [];
}

function getNextCursor(payload: unknown): string | null {
  const p = payload as Record<string, unknown> | null;
  if (!p) return null;
  const c = p.nextCursor ?? p.next_cursor ?? p.cursor;
  return typeof c === "string" && c ? c : null;
}

function parseCreatorsList(payload: unknown): { fanvueUuid: string; handle?: string; displayName?: string; avatarUrl?: string }[] {
  const arr = getEarningsArray(payload);
  const out: { fanvueUuid: string; handle?: string; displayName?: string; avatarUrl?: string }[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const fanvueUuid =
      typeof obj.userUuid === "string"
        ? obj.userUuid
        : typeof obj.uuid === "string"
          ? obj.uuid
          : typeof obj.id === "string"
            ? obj.id
            : "";
    if (!fanvueUuid) continue;
    out.push({
      fanvueUuid,
      handle: typeof obj.handle === "string" ? obj.handle : undefined,
      displayName:
        typeof obj.displayName === "string"
          ? obj.displayName
          : typeof obj.name === "string"
            ? obj.name
            : undefined,
      avatarUrl:
        typeof obj.avatarUrl === "string"
          ? obj.avatarUrl
          : typeof obj.avatar === "string"
            ? obj.avatar
            : undefined,
    });
  }
  return out;
}

function parseEarningsItems(payload: unknown): { date: Date; amountCents: number; source?: string }[] {
  const arr = getEarningsArray(payload);
  const out: { date: Date; amountCents: number; source?: string }[] = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const dateRaw = obj.date ?? obj.createdAt ?? obj.periodStart ?? obj.paidAt;
    const amountCents =
      typeof obj.net === "number"
        ? obj.net
        : typeof obj.netAmount === "number"
          ? obj.netAmount
          : typeof obj.amount === "number"
            ? obj.amount
            : Number(obj.net) || Number(obj.amount) || 0;
    if (!dateRaw || Number.isNaN(amountCents)) continue;
    const date = new Date(dateRaw as string);
    if (Number.isNaN(date.getTime())) continue;
    const source = typeof obj.source === "string" ? obj.source : undefined;
    out.push({ date, amountCents, source });
  }
  return out;
}

function accumulateItems(
  items: { date: Date; amountCents: number; source?: string }[],
  byDay: Map<string, DayAgg>,
  revenueCentsByDate: Map<string, number>
) {
  for (const { date, amountCents, source } of items) {
    const key = getLocalDateKey(date, OFFSET_MINUTES);
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

// ─── Per-creator fetch helpers (run in parallel per batch) ───────────────────

/** Fetch earnings for one creator over a single date range (used by runFanvueSync). */
async function fetchCreatorEarningsForRange(
  creatorUuid: string,
  accessToken: string,
  startUtcIso: string,
  endUtcIso: string
): Promise<CreatorFetchResult> {
  const byDay = new Map<string, DayAgg>();
  const revenueCentsByDate = new Map<string, number>();
  let pagesFetched = 0;
  let cursor: string | null = null;

  do {
    const q = new URLSearchParams({
      startDate: startUtcIso,
      endDate: endUtcIso,
      size: String(EARNINGS_PAGE_SIZE),
      ...(cursor && { cursor }),
    });
    const earnings = await fanvueFetch<unknown>(
      `/creators/${encodeURIComponent(creatorUuid)}/insights/earnings?${q.toString()}`,
      accessToken
    );
    pagesFetched += 1;
    accumulateItems(parseEarningsItems(earnings), byDay, revenueCentsByDate);
    cursor = getNextCursor(earnings);
    if (cursor) await sleep(DELAY_BETWEEN_PAGES_MS);
  } while (cursor);

  return { byDay, revenueCentsByDate, pagesFetched, chunksProcessed: 0 };
}

/** Fetch earnings for one creator over multiple 7-day chunks (used by runFanvueRebuild). */
async function fetchCreatorEarningsChunked(
  creatorUuid: string,
  accessToken: string,
  chunks: { startUtcIso: string; endUtcIso: string }[]
): Promise<CreatorFetchResult> {
  const byDay = new Map<string, DayAgg>();
  const revenueCentsByDate = new Map<string, number>();
  let pagesFetched = 0;
  let chunksProcessed = 0;

  for (const chunk of chunks) {
    let cursor: string | null = null;
    do {
      const q = new URLSearchParams({
        startDate: chunk.startUtcIso,
        endDate: chunk.endUtcIso,
        size: String(EARNINGS_PAGE_SIZE),
        ...(cursor && { cursor }),
      });
      const earnings = await fanvueFetch<unknown>(
        `/creators/${encodeURIComponent(creatorUuid)}/insights/earnings?${q.toString()}`,
        accessToken
      );
      pagesFetched += 1;
      accumulateItems(parseEarningsItems(earnings), byDay, revenueCentsByDate);
      cursor = getNextCursor(earnings);
      if (cursor) await sleep(DELAY_BETWEEN_PAGES_MS);
    } while (cursor);
    chunksProcessed += 1;
    await sleep(DELAY_BETWEEN_CHUNKS_MS);
  }

  return { byDay, revenueCentsByDate, pagesFetched, chunksProcessed };
}

// ─── Public sync functions ───────────────────────────────────────────────────

export interface RunFanvueSyncResult {
  ok: boolean;
  creatorsUpserted: number;
  creatorsProcessed: number;
  chunksProcessed: number;
  pagesFetched: number;
  dailyRowsUpserted: number;
  daysSynced: number;
  startDate: string;
  endDate: string;
  startLocal: string;
  endLocal: string;
}

/**
 * Run Fanvue sync for the given period. Uses UTC+2 for all date bucketing.
 * Fetches up to CREATOR_CONCURRENCY creators in parallel; DB writes are sequential.
 */
export async function runFanvueSync(
  userId: string,
  accessToken: string,
  period: FanvuePeriod
): Promise<RunFanvueSyncResult> {
  const range = getFanvuePeriodRange(period, OFFSET_MINUTES);
  let pagesFetched = 0;

  const creatorsPayload = await fanvueFetch<unknown>(
    `/creators?page=1&size=${PAGE_SIZE}`,
    accessToken
  );
  pagesFetched += 1;
  const parsedCreators = parseCreatorsList(creatorsPayload);
  const creatorUuids = parsedCreators.map((c) => c.fanvueUuid);

  const fanvueUuidToCreatorId = new Map<string, string>();
  for (const c of parsedCreators) {
    const creator = await prisma.fanvueCreator.upsert({
      where: { userId_fanvueUuid: { userId, fanvueUuid: c.fanvueUuid } },
      create: { userId, fanvueUuid: c.fanvueUuid, handle: c.handle, displayName: c.displayName, avatarUrl: c.avatarUrl },
      update: { handle: c.handle, displayName: c.displayName, avatarUrl: c.avatarUrl },
    });
    fanvueUuidToCreatorId.set(c.fanvueUuid, creator.id);
  }

  // Accumulates cross-creator daily revenue for agencyDailyRevenue
  const globalRevenueCents = new Map<string, number>();
  let dailyRowsUpserted = 0;
  let creatorsProcessed = 0;

  for (let i = 0; i < creatorUuids.length; i += CREATOR_CONCURRENCY) {
    const batch = creatorUuids.slice(i, i + CREATOR_CONCURRENCY);

    // Fetch all creators in this batch in parallel
    const batchResults = await Promise.all(
      batch.map((uuid) =>
        fetchCreatorEarningsForRange(uuid, accessToken, range.startUtcIso, range.endUtcIso)
      )
    );

    // Write results sequentially (no DB race conditions)
    for (let j = 0; j < batch.length; j++) {
      const creatorUuid = batch[j]!;
      const creatorId = fanvueUuidToCreatorId.get(creatorUuid);
      if (!creatorId) continue;

      const result = batchResults[j]!;
      pagesFetched += result.pagesFetched;

      for (const [dateStr, cents] of result.revenueCentsByDate) {
        globalRevenueCents.set(dateStr, (globalRevenueCents.get(dateStr) ?? 0) + cents);
      }

      for (const [dateStr, agg] of result.byDay) {
        const date = toDateOnly(dateStr);
        await prisma.fanvueCreatorDailyEarnings.upsert({
          where: { creatorId_date: { creatorId, date } },
          create: {
            creatorId, date,
            total: Math.round(agg.total * 100) / 100,
            messages: Math.round(agg.messages * 100) / 100,
            tips: Math.round(agg.tips * 100) / 100,
            subscriptions: Math.round(agg.subscriptions * 100) / 100,
          },
          update: {
            total: Math.round(agg.total * 100) / 100,
            messages: Math.round(agg.messages * 100) / 100,
            tips: Math.round(agg.tips * 100) / 100,
            subscriptions: Math.round(agg.subscriptions * 100) / 100,
          },
        });
        dailyRowsUpserted += 1;
      }
      creatorsProcessed += 1;
    }

    if (i + CREATOR_CONCURRENCY < creatorUuids.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
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

  const daysSynced =
    Math.ceil((range.endDateUtc.getTime() - range.startDateUtc.getTime()) / (24 * 60 * 60 * 1000)) + 1;

  return {
    ok: true,
    creatorsUpserted: parsedCreators.length,
    creatorsProcessed,
    chunksProcessed: 1,
    pagesFetched,
    dailyRowsUpserted,
    daysSynced,
    startDate: range.startUtcIso,
    endDate: range.endUtcIso,
    startLocal: range.startLocal,
    endLocal: range.endLocal,
  };
}

/** Full 33-day sync for rebuild: clear Fanvue data in range then re-import. */
const SYNC_DAYS = 33;
const CHUNK_DAYS = 7;

export interface RunFanvueRebuildResult extends RunFanvueSyncResult {
  rebuilt: true;
  deletedCreatorDailyRows: number;
  deletedAgencyRows: number;
}

/**
 * Rebuild: delete FanvueCreatorDailyEarnings and AgencyDailyRevenue for the user in the 33-day range,
 * then re-import all creators over all 33 days in 7-day chunks.
 * Fetches up to CREATOR_CONCURRENCY creators in parallel; DB writes are sequential.
 */
export async function runFanvueRebuild(
  userId: string,
  accessToken: string
): Promise<RunFanvueRebuildResult> {
  const range = getFanvueLastNDaysRange(SYNC_DAYS, OFFSET_MINUTES);

  const r1 = await prisma.fanvueCreatorDailyEarnings.deleteMany({
    where: { creator: { userId }, date: { gte: range.startDateUtc, lte: range.endDateUtc } },
  });
  const r2 = await prisma.agencyDailyRevenue.deleteMany({
    where: { userId, date: { gte: range.startDateUtc, lte: range.endDateUtc } },
  });

  const chunks = splitRangeIntoChunks(range.startDateUtc, range.endDateUtc, CHUNK_DAYS);
  let pagesFetched = 0;
  let chunksProcessed = 0;

  const creatorsPayload = await fanvueFetch<unknown>(
    `/creators?page=1&size=${PAGE_SIZE}`,
    accessToken
  );
  pagesFetched += 1;
  const parsedCreators = parseCreatorsList(creatorsPayload);
  const creatorUuids = parsedCreators.map((c) => c.fanvueUuid);

  const fanvueUuidToCreatorId = new Map<string, string>();
  for (const c of parsedCreators) {
    const creator = await prisma.fanvueCreator.upsert({
      where: { userId_fanvueUuid: { userId, fanvueUuid: c.fanvueUuid } },
      create: { userId, fanvueUuid: c.fanvueUuid, handle: c.handle, displayName: c.displayName, avatarUrl: c.avatarUrl },
      update: { handle: c.handle, displayName: c.displayName, avatarUrl: c.avatarUrl },
    });
    fanvueUuidToCreatorId.set(c.fanvueUuid, creator.id);
  }

  const globalRevenueCents = new Map<string, number>();
  let dailyRowsUpserted = 0;
  let creatorsProcessed = 0;

  for (let i = 0; i < creatorUuids.length; i += CREATOR_CONCURRENCY) {
    const batch = creatorUuids.slice(i, i + CREATOR_CONCURRENCY);

    // Fetch all creators in this batch in parallel (each processes all chunks sequentially)
    const batchResults = await Promise.all(
      batch.map((uuid) => fetchCreatorEarningsChunked(uuid, accessToken, chunks))
    );

    // Write results sequentially
    for (let j = 0; j < batch.length; j++) {
      const creatorUuid = batch[j]!;
      const creatorId = fanvueUuidToCreatorId.get(creatorUuid);
      if (!creatorId) continue;

      const result = batchResults[j]!;
      pagesFetched += result.pagesFetched;
      chunksProcessed += result.chunksProcessed;

      for (const [dateStr, cents] of result.revenueCentsByDate) {
        globalRevenueCents.set(dateStr, (globalRevenueCents.get(dateStr) ?? 0) + cents);
      }

      for (const [dateStr, agg] of result.byDay) {
        const date = toDateOnly(dateStr);
        await prisma.fanvueCreatorDailyEarnings.upsert({
          where: { creatorId_date: { creatorId, date } },
          create: {
            creatorId, date,
            total: Math.round(agg.total * 100) / 100,
            messages: Math.round(agg.messages * 100) / 100,
            tips: Math.round(agg.tips * 100) / 100,
            subscriptions: Math.round(agg.subscriptions * 100) / 100,
          },
          update: {
            total: Math.round(agg.total * 100) / 100,
            messages: Math.round(agg.messages * 100) / 100,
            tips: Math.round(agg.tips * 100) / 100,
            subscriptions: Math.round(agg.subscriptions * 100) / 100,
          },
        });
        dailyRowsUpserted += 1;
      }
      creatorsProcessed += 1;
    }

    if (i + CREATOR_CONCURRENCY < creatorUuids.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
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

  return {
    ok: true,
    rebuilt: true,
    deletedCreatorDailyRows: r1.count,
    deletedAgencyRows: r2.count,
    creatorsUpserted: parsedCreators.length,
    creatorsProcessed,
    chunksProcessed,
    pagesFetched,
    dailyRowsUpserted,
    daysSynced: SYNC_DAYS,
    startDate: range.startUtcIso,
    endDate: range.endUtcIso,
    startLocal: range.startLocal,
    endLocal: range.endLocal,
  };
}
