/**
 * Fanvue sync/period helpers using the Europe/Bucharest IANA timezone.
 * The UTC offset is computed dynamically so it is always correct through
 * DST transitions (UTC+2 / EET in winter, UTC+3 / EEST in summer).
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export type FanvuePeriod = "today" | "yesterday" | "week" | "month";

// ─── Dynamic Bucharest offset ─────────────────────────────────────────────────

export const BUCHAREST_TZ = "Europe/Bucharest";

/**
 * Returns the current UTC offset for Europe/Bucharest in minutes.
 *   UTC+2 (EET)  = 120  in winter
 *   UTC+3 (EEST) = 180  in summer
 *
 * Computed via Intl so it is automatically correct after every DST change
 * without any code changes.
 *
 * @param date Defaults to now. Pass a specific date to get the offset for
 *             that instant (useful when bucketing historical earnings).
 */
export function getBucharestOffsetMinutes(date: Date = new Date()): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: BUCHAREST_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
    hour12: false,
  });

  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);

  const year   = get("year");
  const month  = get("month") - 1; // 0-indexed
  const day    = get("day");
  const hour   = get("hour") % 24; // some environments emit "24" for midnight
  const minute = get("minute");
  const second = get("second");

  const localAsUtcMs = Date.UTC(year, month, day, hour, minute, second);
  return Math.round((localAsUtcMs - date.getTime()) / 60_000);
}

/**
 * Returns the human-readable UTC offset label for Europe/Bucharest.
 *   "UTC+02:00" in winter  (EET)
 *   "UTC+03:00" in summer  (EEST)
 */
export function getBucharestTimezoneLabel(date: Date = new Date()): string {
  const offset  = getBucharestOffsetMinutes(date);
  const sign    = offset >= 0 ? "+" : "-";
  const absMin  = Math.abs(offset);
  const hours   = Math.floor(absMin / 60);
  const minutes = absMin % 60;
  return `UTC${sign}${pad(hours)}:${pad(minutes)}`;
}

// ─── Period ranges ────────────────────────────────────────────────────────────

export interface FanvuePeriodRange {
  startLocal: string;
  endLocal: string;
  startUtcIso: string;
  endUtcIso: string;
  startDateUtc: Date;
  endDateUtc: Date;
}

/**
 * Single source of truth for Fanvue period ranges in Europe/Bucharest time.
 * Defaults to the dynamically computed current Bucharest offset so it is always
 * correct in both winter (UTC+2) and summer (UTC+3).
 *
 * - today:     today 00:00:00 → 23:59:59.999 local
 * - yesterday: yesterday 00:00:00 → 23:59:59.999 local
 * - week:      Monday 00:00:00 of current week → now
 * - month:     first day of month 00:00:00 → now
 */
export function getFanvuePeriodRange(
  period: FanvuePeriod,
  offsetMinutes = getBucharestOffsetMinutes()
): FanvuePeriodRange {
  const now = new Date();
  const offsetMs = offsetMinutes * 60 * 1000;

  const toLocalDateStr = (d: Date): string => {
    const r = new Date(d.getTime() + offsetMs);
    return `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`;
  };

  const localMidnightUtc = (year: number, month: number, day: number): Date =>
    new Date(Date.UTC(year, month, day, 0, 0, 0, 0) - offsetMs);

  const localEndOfDayUtc = (year: number, month: number, day: number): Date =>
    new Date(Date.UTC(year, month, day, 23, 59, 59, 999) - offsetMs);

  // Determine today's LOCAL (Bucharest) date components from `now` shifted by the
  // local offset. Using now.getUTCDate() directly is wrong late in the UTC day:
  // e.g. 22:40 UTC is already the next calendar day in Bucharest (+03:00), so the
  // "today" window must be that next day, not the UTC day.
  const localNow = new Date(now.getTime() + offsetMs);
  const ly = localNow.getUTCFullYear();
  const lm = localNow.getUTCMonth();
  const ld = localNow.getUTCDate();

  let startDateUtc: Date;
  let endDateUtc: Date;

  switch (period) {
    case "today": {
      startDateUtc = localMidnightUtc(ly, lm, ld);
      endDateUtc   = localEndOfDayUtc(ly, lm, ld);
      break;
    }
    case "yesterday": {
      const yesterday = new Date(Date.UTC(ly, lm, ld));
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yY = yesterday.getUTCFullYear();
      const mM = yesterday.getUTCMonth();
      const dD = yesterday.getUTCDate();
      startDateUtc = localMidnightUtc(yY, mM, dD);
      endDateUtc   = localEndOfDayUtc(yY, mM, dD);
      break;
    }
    case "week": {
      const localNoonUtc = new Date(Date.UTC(ly, lm, ld, 10, 0, 0, 0));
      const day  = localNoonUtc.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day;
      const mondayRef = new Date(Date.UTC(ly, lm, ld));
      mondayRef.setUTCDate(mondayRef.getUTCDate() + diff);
      startDateUtc = localMidnightUtc(
        mondayRef.getUTCFullYear(),
        mondayRef.getUTCMonth(),
        mondayRef.getUTCDate()
      );
      endDateUtc = now;
      break;
    }
    case "month": {
      startDateUtc = localMidnightUtc(ly, lm, 1);
      endDateUtc   = now;
      break;
    }
    default: {
      const localNoonUtc = new Date(Date.UTC(ly, lm, ld, 10, 0, 0, 0));
      const day  = localNoonUtc.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day;
      const mondayRef = new Date(Date.UTC(ly, lm, ld));
      mondayRef.setUTCDate(mondayRef.getUTCDate() + diff);
      startDateUtc = localMidnightUtc(
        mondayRef.getUTCFullYear(),
        mondayRef.getUTCMonth(),
        mondayRef.getUTCDate()
      );
      endDateUtc = now;
    }
  }

  return {
    startLocal:   toLocalDateStr(startDateUtc),
    endLocal:     toLocalDateStr(endDateUtc),
    startUtcIso:  startDateUtc.toISOString(),
    endUtcIso:    endDateUtc.toISOString(),
    startDateUtc,
    endDateUtc,
  };
}

/**
 * Return YYYY-MM-DD for the given timestamp in Europe/Bucharest local time.
 * Uses the offset for THAT specific date so historical data bucketed across a
 * DST boundary (e.g. March transition) is always assigned to the correct day.
 *
 * @param ts           The earnings timestamp.
 * @param offsetMinutes Override if needed; defaults to the Bucharest offset for ts.
 */
export function getLocalDateKey(ts: Date, offsetMinutes?: number): string {
  const om = offsetMinutes ?? getBucharestOffsetMinutes(ts);
  const offsetMs = om * 60 * 1000;
  const local = new Date(ts.getTime() + offsetMs);
  const y   = local.getUTCFullYear();
  const mon = local.getUTCMonth() + 1;
  const day = local.getUTCDate();
  return `${y}-${pad(mon)}-${pad(day)}`;
}

// ─── Last N days range ────────────────────────────────────────────────────────

export interface FanvueLastNDaysRange {
  startLocal: string;
  endLocal: string;
  startUtcIso: string;
  endUtcIso: string;
  startDateUtc: Date;
  endDateUtc: Date;
}

/**
 * Rolling N-day range in Europe/Bucharest time.
 * end = today 23:59:59.999 local, start = (N-1) days before today 00:00:00.
 */
export function getFanvueLastNDaysRange(
  days: number,
  offsetMinutes = getBucharestOffsetMinutes()
): FanvueLastNDaysRange {
  const now = new Date();
  const offsetMs = offsetMinutes * 60 * 1000;

  const localRef = new Date(now.getTime() + offsetMs);
  const endYear  = localRef.getUTCFullYear();
  const endMonth = localRef.getUTCMonth();
  const endDay   = localRef.getUTCDate();

  const endDateUtc = new Date(
    Date.UTC(endYear, endMonth, endDay, 23, 59, 59, 999) - offsetMs
  );
  const endLocal   = `${endYear}-${pad(endMonth + 1)}-${pad(endDay)}`;
  const endUtcIso  = endDateUtc.toISOString();

  const startRef = new Date(Date.UTC(endYear, endMonth, endDay));
  startRef.setUTCDate(startRef.getUTCDate() - (days - 1));
  const startYear  = startRef.getUTCFullYear();
  const startMonth = startRef.getUTCMonth();
  const startDay   = startRef.getUTCDate();

  const startDateUtc = new Date(
    Date.UTC(startYear, startMonth, startDay, 0, 0, 0, 0) - offsetMs
  );
  const startLocal  = `${startYear}-${pad(startMonth + 1)}-${pad(startDay)}`;
  const startUtcIso = startDateUtc.toISOString();

  return { startLocal, endLocal, startUtcIso, endUtcIso, startDateUtc, endDateUtc };
}

// ─── Chunk splitting ──────────────────────────────────────────────────────────

export interface FanvueRangeChunk {
  startUtcIso: string;
  endUtcIso: string;
  startLocal: string;
  endLocal: string;
}

/**
 * Split a UTC date range into chunks of `chunkDays` days.
 * `offsetMinutes` is used only for the display labels (startLocal/endLocal);
 * the actual UTC timestamps are authoritative.
 */
export function splitRangeIntoChunks(
  startDateUtc: Date,
  endDateUtc: Date,
  chunkDays: number,
  offsetMinutes = getBucharestOffsetMinutes()
): FanvueRangeChunk[] {
  const chunks: FanvueRangeChunk[] = [];
  const offsetMs = offsetMinutes * 60 * 1000;
  const chunkMs  = chunkDays * 24 * 60 * 60 * 1000;
  let currentStart = startDateUtc.getTime();
  const endMs = endDateUtc.getTime();

  while (currentStart <= endMs) {
    const chunkEndMs    = Math.min(currentStart + chunkMs - 1, endMs);
    const chunkStartDate = new Date(currentStart);
    const chunkEndDate   = new Date(chunkEndMs);

    const startLocalRef = new Date(currentStart + offsetMs);
    const endLocalRef   = new Date(chunkEndMs + offsetMs);
    const startLocal = `${startLocalRef.getUTCFullYear()}-${pad(startLocalRef.getUTCMonth() + 1)}-${pad(startLocalRef.getUTCDate())}`;
    const endLocal   = `${endLocalRef.getUTCFullYear()}-${pad(endLocalRef.getUTCMonth() + 1)}-${pad(endLocalRef.getUTCDate())}`;

    chunks.push({
      startUtcIso: chunkStartDate.toISOString(),
      endUtcIso:   chunkEndDate.toISOString(),
      startLocal,
      endLocal,
    });
    currentStart = chunkEndMs + 1;
  }

  return chunks;
}

/** Parse YYYY-MM-DD string to Date at midnight UTC (for DB storage key). */
export function toDateOnly(value: string | number | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const str = String(value).slice(0, 10);
  const [y, m, d] = str.split("-").map(Number);
  if (!y || !m || !d) return new Date(NaN);
  return new Date(Date.UTC(y, m - 1, d));
}
