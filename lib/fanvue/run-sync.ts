/**
 * Fanvue sync: fetch creators and earnings from API, bucket by UTC+2 local day, write to DB.
 * All date bucketing uses getLocalDateKey(ts, 120) — never UTC date string slicing.
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
const PAGE_SIZE = 50;

// Rate-limit back-off delays (ms)
const DELAY_BETWEEN_PAGES_MS = 600;      // between paginated requests for one creator+chunk
const DELAY_BETWEEN_CHUNKS_MS = 1200;    // after finishing each 7-day chunk
const DELAY_BETWEEN_CREATORS_MS = 2000;  // after finishing all chunks for one creator

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

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
      avatarUrl: typeof obj.avatarUrl === "string" ? obj.avatarUrl : typeof obj.avatar === "string" ? obj.avatar : undefined,
    });
  }
  return out;
}

/** Parse earnings response into items with full timestamp and amount. */
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
      create: {
        userId,
        fanvueUuid: c.fanvueUuid,
        handle: c.handle,
        displayName: c.displayName,
        avatarUrl: c.avatarUrl,
      },
      update: {
        handle: c.handle,
        displayName: c.displayName,
        avatarUrl: c.avatarUrl,
      },
    });
    fanvueUuidToCreatorId.set(c.fanvueUuid, creator.id);
  }

  const dailyTotals = new Map<string, number>();
  let dailyRowsUpserted = 0;
  let creatorsProcessed = 0;

  for (const creatorUuid of creatorUuids) {
    const creatorId = fanvueUuidToCreatorId.get(creatorUuid);
    if (!creatorId) continue;

    const byDay = new Map<
      string,
      { total: number; messages: number; tips: number; subscriptions: number }
    >();

    let cursor: string | null = null;
    do {
      const q = new URLSearchParams({
        startDate: range.startUtcIso,
        endDate: range.endUtcIso,
        size: String(PAGE_SIZE),
        ...(cursor && { cursor }),
      });
      const earnings = await fanvueFetch<unknown>(
        `/creators/${encodeURIComponent(creatorUuid)}/insights/earnings?${q.toString()}`,
        accessToken
      );
      pagesFetched += 1;
      const items = parseEarningsItems(earnings);
      for (const { date, amountCents, source } of items) {
        const key = getLocalDateKey(date, OFFSET_MINUTES);
        dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + amountCents);
        const dollars = amountCents * CENTS_TO_DOLLARS;
        const cur = byDay.get(key) ?? {
          total: 0,
          messages: 0,
          tips: 0,
          subscriptions: 0,
        };
        cur.total += dollars;
        const s = (source ?? "").toLowerCase();
        if (s === "subscription" || s === "renewal") cur.subscriptions += dollars;
        else if (s === "message") cur.messages += dollars;
        else if (s === "tip") cur.tips += dollars;
        byDay.set(key, cur);
      }
      cursor = getNextCursor(earnings);
      if (cursor) await sleep(DELAY_BETWEEN_PAGES_MS);
    } while (cursor);

    for (const [dateStr, agg] of byDay) {
      const date = toDateOnly(dateStr);
      const finalTotal = Math.round(agg.total * 100) / 100;
      const finalMessages = Math.round(agg.messages * 100) / 100;
      const finalTips = Math.round(agg.tips * 100) / 100;
      const finalSubscriptions = Math.round(agg.subscriptions * 100) / 100;
      await prisma.fanvueCreatorDailyEarnings.upsert({
        where: { creatorId_date: { creatorId, date } },
        create: {
          creatorId,
          date,
          total: finalTotal,
          messages: finalMessages,
          tips: finalTips,
          subscriptions: finalSubscriptions,
        },
        update: {
          total: finalTotal,
          messages: finalMessages,
          tips: finalTips,
          subscriptions: finalSubscriptions,
        },
      });
      dailyRowsUpserted += 1;
    }

    for (const [dateStr, revenueCents] of dailyTotals) {
      const date = toDateOnly(dateStr);
      const revenue = revenueCents * CENTS_TO_DOLLARS;
      const infloww = 0;
      const total = revenue + infloww;
      await prisma.agencyDailyRevenue.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, fanvue: revenue, infloww, total },
        update: { fanvue: revenue, infloww, total },
      });
    }

    creatorsProcessed += 1;
    if (creatorsProcessed < creatorUuids.length) await sleep(DELAY_BETWEEN_CREATORS_MS);
  }

  const daysSynced = Math.ceil((range.endDateUtc.getTime() - range.startDateUtc.getTime()) / (24 * 60 * 60 * 1000)) + 1;

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
 * Rebuild: delete FanvueCreatorDailyEarnings and AgencyDailyRevenue for the user in the 33-day sync range,
 * then re-import all creators, all 33 days. Chunked into 7-day windows.
 */
export async function runFanvueRebuild(
  userId: string,
  accessToken: string
): Promise<RunFanvueRebuildResult> {
  const range = getFanvueLastNDaysRange(SYNC_DAYS, OFFSET_MINUTES);

  const r1 = await prisma.fanvueCreatorDailyEarnings.deleteMany({
    where: {
      creator: { userId },
      date: { gte: range.startDateUtc, lte: range.endDateUtc },
    },
  });
  const r2 = await prisma.agencyDailyRevenue.deleteMany({
    where: {
      userId,
      date: { gte: range.startDateUtc, lte: range.endDateUtc },
    },
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
      create: {
        userId,
        fanvueUuid: c.fanvueUuid,
        handle: c.handle,
        displayName: c.displayName,
        avatarUrl: c.avatarUrl,
      },
      update: { handle: c.handle, displayName: c.displayName, avatarUrl: c.avatarUrl },
    });
    fanvueUuidToCreatorId.set(c.fanvueUuid, creator.id);
  }

  const dailyTotals = new Map<string, number>();
  let dailyRowsUpserted = 0;
  let creatorsProcessed = 0;

  for (const creatorUuid of creatorUuids) {
    const creatorId = fanvueUuidToCreatorId.get(creatorUuid);
    if (!creatorId) continue;

    const byDay = new Map<
      string,
      { total: number; messages: number; tips: number; subscriptions: number }
    >();

    for (const chunk of chunks) {
      let cursor: string | null = null;
      do {
        const q = new URLSearchParams({
          startDate: chunk.startUtcIso,
          endDate: chunk.endUtcIso,
          size: String(PAGE_SIZE),
          ...(cursor && { cursor }),
        });
        const earnings = await fanvueFetch<unknown>(
          `/creators/${encodeURIComponent(creatorUuid)}/insights/earnings?${q.toString()}`,
          accessToken
        );
        pagesFetched += 1;
        const items = parseEarningsItems(earnings);
        for (const { date, amountCents, source } of items) {
          const key = getLocalDateKey(date, OFFSET_MINUTES);
          dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + amountCents);
          const dollars = amountCents * CENTS_TO_DOLLARS;
          const cur = byDay.get(key) ?? { total: 0, messages: 0, tips: 0, subscriptions: 0 };
          cur.total += dollars;
          const s = (source ?? "").toLowerCase();
          if (s === "subscription" || s === "renewal") cur.subscriptions += dollars;
          else if (s === "message") cur.messages += dollars;
          else if (s === "tip") cur.tips += dollars;
          byDay.set(key, cur);
        }
        cursor = getNextCursor(earnings);
        if (cursor) await sleep(DELAY_BETWEEN_PAGES_MS);
      } while (cursor);
      chunksProcessed += 1;
      await sleep(DELAY_BETWEEN_CHUNKS_MS);
    }

    for (const [dateStr, agg] of byDay) {
      const date = toDateOnly(dateStr);
      await prisma.fanvueCreatorDailyEarnings.upsert({
        where: { creatorId_date: { creatorId, date } },
        create: {
          creatorId,
          date,
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

    for (const [dateStr, revenueCents] of dailyTotals) {
      const date = toDateOnly(dateStr);
      const revenue = revenueCents * CENTS_TO_DOLLARS;
      await prisma.agencyDailyRevenue.upsert({
        where: { userId_date: { userId, date } },
        create: { userId, date, fanvue: revenue, infloww: 0, total: revenue },
        update: { fanvue: revenue, infloww: 0, total: revenue },
      });
    }

    creatorsProcessed += 1;
    if (creatorsProcessed < creatorUuids.length) await sleep(DELAY_BETWEEN_CREATORS_MS);
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
