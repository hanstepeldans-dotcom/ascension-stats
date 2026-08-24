/**
 * Infloww sync — pull revenue transactions from the Infloww API and write daily
 * per-creator totals into InflowwCreatorDailyEarnings.
 *
 * This replaces the manual CSV/XLSX upload path with a live API pull. The upload
 * route still exists as a fallback and writes to the same table.
 *
 * How it works
 * ────────────
 *   1. Fetch the full connected-creators list once (GET /v1/creators).
 *   2. For each creator, fetch all transactions in a rolling N-day window
 *      (GET /v1/transactions?creatorId=…), sequentially to respect the 1000 QPM cap.
 *   3. Aggregate transactions into per-creator, per-local-day buckets. Money is
 *      GROSS (the `amount` field, what the fan paid) in cents → dollars, matching
 *      the basis the CSV parser and dashboard already use.
 *   4. Upsert one InflowwCreatorDailyEarnings row per (userId, creatorName, date)
 *      for every target user, so the shared dashboard shows the data.
 *
 * Days are bucketed with the same Europe/Bucharest local-day logic the Fanvue
 * sync uses, so the two sources line up on the same calendar day.
 *
 * Not yet covered (safe follow-ups): refunds (GET /v1/refunds) are not subtracted,
 * and subscriber counts are left at 0 — transactions don't carry them.
 */

import { prisma } from "@/lib/db";
import {
  getInflowwConfig,
  isInflowwConfigured,
  listAllCreators,
  listCreatorTransactions,
  InflowwApiError,
  type InflowwTransaction,
} from "@/lib/providers/infloww/api";
import { getLocalDateKey, getBucharestOffsetMinutes, toDateOnly } from "@/lib/time/fanvue-range";

const CENTS_TO_DOLLARS = 1 / 100;
const DEFAULT_SYNC_DAYS = 7;
const DELAY_BETWEEN_CREATORS_MS = 120; // gentle spacing under the 1000 QPM agency cap

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Rolling window length in days, from INFLOWW_SYNC_DAYS (default 7). */
export function getInflowwSyncDays(): number {
  const raw = parseInt(process.env.INFLOWW_SYNC_DAYS ?? "", 10);
  return Number.isInteger(raw) && raw >= 1 && raw <= 366 ? raw : DEFAULT_SYNC_DAYS;
}

type DayAgg = {
  total: number;
  subscriptions: number;
  messages: number;
  tips: number;
  posts: number;
  referrals: number;
  streams: number;
};

function emptyAgg(): DayAgg {
  return { total: 0, subscriptions: 0, messages: 0, tips: 0, posts: 0, referrals: 0, streams: 0 };
}

/** Map an Infloww transaction `type` to a revenue bucket. Unknown types count toward total only. */
function bucketForType(type: string | undefined): keyof DayAgg | null {
  const t = (type ?? "").toLowerCase();
  if (t.includes("subscription")) return "subscriptions"; // Subscription, RecurringSubscription
  if (t.includes("message")) return "messages";
  if (t.includes("tip")) return "tips";
  if (t.includes("post")) return "posts";
  if (t.includes("stream")) return "streams";
  if (t.includes("referral")) return "referrals";
  return null;
}

/** Aggregate one creator's transactions into per-local-day buckets. */
function aggregateTransactions(txns: InflowwTransaction[]): Map<string, DayAgg> {
  const byDay = new Map<string, DayAgg>();
  for (const tx of txns) {
    const ms = Number(tx.createdTime);
    if (!Number.isFinite(ms)) continue;
    const amountCents = Number(tx.amount);
    if (!Number.isFinite(amountCents)) continue;

    const date = new Date(ms);
    const key = getLocalDateKey(date, getBucharestOffsetMinutes(date));
    const dollars = amountCents * CENTS_TO_DOLLARS;

    const agg = byDay.get(key) ?? emptyAgg();
    agg.total += dollars;
    const bucket = bucketForType(tx.type);
    if (bucket && bucket !== "total") agg[bucket] += dollars;
    byDay.set(key, agg);
  }
  return byDay;
}

export interface RunInflowwSyncResult {
  ok: boolean;
  targetUserCount: number;
  creatorsFetched: number;
  creatorsProcessed: number;
  creatorsFailed: number;
  transactionsFetched: number;
  dailyRowsUpserted: number;
  days: number;
  startTimeMs: number;
  startedAt: string;
  finishedAt: string;
}

/**
 * Run one Infloww sync for the given target users.
 * Fetches Infloww data ONCE and writes the aggregated rows for every target user.
 */
export async function runInflowwSync(
  targetUserIds: string[],
  opts?: { days?: number }
): Promise<RunInflowwSyncResult> {
  const startedAt = new Date();
  if (!isInflowwConfigured()) {
    throw new Error("Infloww API not configured: set INFLOWW_API_KEY and INFLOWW_AGENCY_OID");
  }
  const uniqueUserIds = [...new Set(targetUserIds.filter(Boolean))];
  const config = getInflowwConfig();
  const days = opts?.days ?? getInflowwSyncDays();
  const startTimeMs = startedAt.getTime() - days * 24 * 60 * 60 * 1000;

  const creators = await listAllCreators(config);

  let creatorsProcessed = 0;
  let creatorsFailed = 0;
  let transactionsFetched = 0;
  let dailyRowsUpserted = 0;

  for (const creator of creators) {
    const creatorName = (creator.name ?? creator.userName ?? creator.id).trim();
    if (!creator.id || !creatorName) {
      creatorsFailed++;
      continue;
    }

    let byDay: Map<string, DayAgg>;
    try {
      const txns = await listCreatorTransactions(creator.id, startTimeMs, undefined, config);
      transactionsFetched += txns.length;
      byDay = aggregateTransactions(txns);
    } catch (err) {
      creatorsFailed++;
      if (err instanceof InflowwApiError) {
        console.error(
          `[infloww-sync] creator ${creatorName} (${creator.id}) failed: ${err.message}`,
          err.bodyPreview ?? ""
        );
        // A 429 means we've hit the agency QPM cap — stop early rather than hammer it.
        if (err.status === 429) break;
      } else {
        console.error(`[infloww-sync] creator ${creatorName} (${creator.id}) failed:`, err);
      }
      await sleep(DELAY_BETWEEN_CREATORS_MS);
      continue;
    }

    // Upsert this creator's days for every target user (data is agency-wide → shared).
    for (const [dateStr, agg] of byDay) {
      const date = toDateOnly(dateStr);
      for (const userId of uniqueUserIds) {
        await prisma.inflowwCreatorDailyEarnings.upsert({
          where: { userId_creatorName_date: { userId, creatorName, date } },
          create: {
            userId,
            creatorName,
            date,
            total: round2(agg.total),
            subscriptions: round2(agg.subscriptions),
            messages: round2(agg.messages),
            tips: round2(agg.tips),
            posts: round2(agg.posts),
            referrals: round2(agg.referrals),
            streams: round2(agg.streams),
            subscribers: 0,
          },
          update: {
            total: round2(agg.total),
            subscriptions: round2(agg.subscriptions),
            messages: round2(agg.messages),
            tips: round2(agg.tips),
            posts: round2(agg.posts),
            referrals: round2(agg.referrals),
            streams: round2(agg.streams),
          },
        });
        dailyRowsUpserted++;
      }
    }

    creatorsProcessed++;
    await sleep(DELAY_BETWEEN_CREATORS_MS);
  }

  const finishedAt = new Date();
  const result: RunInflowwSyncResult = {
    ok: true,
    targetUserCount: uniqueUserIds.length,
    creatorsFetched: creators.length,
    creatorsProcessed,
    creatorsFailed,
    transactionsFetched,
    dailyRowsUpserted,
    days,
    startTimeMs,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
  };
  console.log("[infloww-sync] completed", result);
  return result;
}

/**
 * Resolve which users the synced (agency-wide) rows should be written for.
 *
 * Precedence:
 *   1. INFLOWW_SYNC_USER_ID (comma-separated) if set.
 *   2. Every user that has a ProviderConnection (i.e. real operator accounts).
 *   3. Fallback: all users.
 */
export async function resolveInflowwTargetUserIds(): Promise<string[]> {
  const override = process.env.INFLOWW_SYNC_USER_ID?.trim();
  if (override) {
    return override.split(",").map((s) => s.trim()).filter(Boolean);
  }

  const connected = await prisma.providerConnection.findMany({
    select: { userId: true },
    distinct: ["userId"],
  });
  if (connected.length > 0) return connected.map((c) => c.userId);

  const users = await prisma.user.findMany({ select: { id: true } });
  return users.map((u) => u.id);
}
