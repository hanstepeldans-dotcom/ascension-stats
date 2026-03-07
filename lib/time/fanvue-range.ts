/**
 * Fanvue sync/period helpers using UTC+02:00 (Europe/Brussels-style) calendar days.
 * Single source of truth for period ranges and local-date bucketing.
 */

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export type FanvuePeriod = "today" | "yesterday" | "week" | "month";

export interface FanvuePeriodRange {
  startLocal: string;
  endLocal: string;
  startUtcIso: string;
  endUtcIso: string;
  startDateUtc: Date;
  endDateUtc: Date;
}

/**
 * Single source of truth for Fanvue period ranges in UTC+02:00 (Europe/Brussels).
 * Offset = +120 minutes. Week starts Monday.
 *
 * - today: today 00:00:00 → 23:59:59.999 local UTC+02
 * - yesterday: yesterday 00:00:00 → 23:59:59.999 local UTC+02
 * - week: Monday 00:00:00 of current week (UTC+02) → now
 * - month: first day of month 00:00:00 UTC+02 → now
 */
export function getFanvuePeriodRange(
  period: FanvuePeriod,
  offsetMinutes = 120
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

  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();

  const localRef = new Date(Date.UTC(y, m, d, 12, 0, 0, 0) + offsetMs);
  const ly = localRef.getUTCFullYear();
  const lm = localRef.getUTCMonth();
  const ld = localRef.getUTCDate();

  let startDateUtc: Date;
  let endDateUtc: Date;

  switch (period) {
    case "today": {
      startDateUtc = localMidnightUtc(ly, lm, ld);
      endDateUtc = localEndOfDayUtc(ly, lm, ld);
      break;
    }
    case "yesterday": {
      const yesterday = new Date(Date.UTC(ly, lm, ld));
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yY = yesterday.getUTCFullYear();
      const mM = yesterday.getUTCMonth();
      const dD = yesterday.getUTCDate();
      startDateUtc = localMidnightUtc(yY, mM, dD);
      endDateUtc = localEndOfDayUtc(yY, mM, dD);
      break;
    }
    case "week": {
      const localNoonUtc = new Date(Date.UTC(ly, lm, ld, 10, 0, 0, 0));
      const day = localNoonUtc.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day;
      const mondayRef = new Date(Date.UTC(ly, lm, ld));
      mondayRef.setUTCDate(mondayRef.getUTCDate() + diff);
      const yMon = mondayRef.getUTCFullYear();
      const mMon = mondayRef.getUTCMonth();
      const dMon = mondayRef.getUTCDate();
      startDateUtc = localMidnightUtc(yMon, mMon, dMon);
      endDateUtc = now;
      break;
    }
    case "month": {
      startDateUtc = localMidnightUtc(ly, lm, 1);
      endDateUtc = now;
      break;
    }
    default: {
      const localNoonUtc = new Date(Date.UTC(ly, lm, ld, 10, 0, 0, 0));
      const day = localNoonUtc.getUTCDay();
      const diff = (day === 0 ? -6 : 1) - day;
      const mondayRef = new Date(Date.UTC(ly, lm, ld));
      mondayRef.setUTCDate(mondayRef.getUTCDate() + diff);
      const yMon = mondayRef.getUTCFullYear();
      const mMon = mondayRef.getUTCMonth();
      const dMon = mondayRef.getUTCDate();
      startDateUtc = localMidnightUtc(yMon, mMon, dMon);
      endDateUtc = now;
    }
  }

  return {
    startLocal: toLocalDateStr(startDateUtc),
    endLocal: toLocalDateStr(endDateUtc),
    startUtcIso: startDateUtc.toISOString(),
    endUtcIso: endDateUtc.toISOString(),
    startDateUtc,
    endDateUtc,
  };
}

/**
 * Return YYYY-MM-DD for the given timestamp in UTC+offsetMinutes (e.g. 120 = UTC+2).
 * Used to bucket earnings into one row per UTC+2 local day.
 */
export function getLocalDateKey(ts: Date, offsetMinutes: number): string {
  const offsetMs = offsetMinutes * 60 * 1000;
  const local = new Date(ts.getTime() + offsetMs);
  const y = local.getUTCFullYear();
  const m = local.getUTCMonth() + 1;
  const day = local.getUTCDate();
  return `${y}-${pad(m)}-${pad(day)}`;
}

/**
 * Rolling N-day range in UTC+02:00: end = today 23:59:59.999, start = (N-1) days before today 00:00:00.000.
 */
export interface FanvueLastNDaysRange {
  startLocal: string;
  endLocal: string;
  startUtcIso: string;
  endUtcIso: string;
  startDateUtc: Date;
  endDateUtc: Date;
}

export function getFanvueLastNDaysRange(
  days: number,
  offsetMinutes = 120
): FanvueLastNDaysRange {
  const now = new Date();
  const offsetMs = offsetMinutes * 60 * 1000;

  const localRef = new Date(now.getTime() + offsetMs);
  const endYear = localRef.getUTCFullYear();
  const endMonth = localRef.getUTCMonth();
  const endDay = localRef.getUTCDate();

  const endDateUtc = new Date(
    Date.UTC(endYear, endMonth, endDay, 23, 59, 59, 999) - offsetMs
  );
  const endLocal = `${endYear}-${pad(endMonth + 1)}-${pad(endDay)}`;
  const endUtcIso = endDateUtc.toISOString();

  const startRef = new Date(Date.UTC(endYear, endMonth, endDay));
  startRef.setUTCDate(startRef.getUTCDate() - (days - 1));
  const startYear = startRef.getUTCFullYear();
  const startMonth = startRef.getUTCMonth();
  const startDay = startRef.getUTCDate();

  const startDateUtc = new Date(
    Date.UTC(startYear, startMonth, startDay, 0, 0, 0, 0) - offsetMs
  );
  const startLocal = `${startYear}-${pad(startMonth + 1)}-${pad(startDay)}`;
  const startUtcIso = startDateUtc.toISOString();

  return {
    startLocal,
    endLocal,
    startUtcIso,
    endUtcIso,
    startDateUtc,
    endDateUtc,
  };
}

export interface FanvueRangeChunk {
  startUtcIso: string;
  endUtcIso: string;
  startLocal: string;
  endLocal: string;
}

export function splitRangeIntoChunks(
  startDateUtc: Date,
  endDateUtc: Date,
  chunkDays: number
): FanvueRangeChunk[] {
  const chunks: FanvueRangeChunk[] = [];
  const offsetMs = 120 * 60 * 1000;
  const chunkMs = chunkDays * 24 * 60 * 60 * 1000;
  let currentStart = startDateUtc.getTime();
  const endMs = endDateUtc.getTime();

  while (currentStart <= endMs) {
    const chunkEndMs = Math.min(currentStart + chunkMs - 1, endMs);
    const chunkStartDate = new Date(currentStart);
    const chunkEndDate = new Date(chunkEndMs);

    const startLocalRef = new Date(currentStart + offsetMs);
    const endLocalRef = new Date(chunkEndMs + offsetMs);
    const startLocal = `${startLocalRef.getUTCFullYear()}-${pad(startLocalRef.getUTCMonth() + 1)}-${pad(startLocalRef.getUTCDate())}`;
    const endLocal = `${endLocalRef.getUTCFullYear()}-${pad(endLocalRef.getUTCMonth() + 1)}-${pad(endLocalRef.getUTCDate())}`;

    chunks.push({
      startUtcIso: chunkStartDate.toISOString(),
      endUtcIso: chunkEndDate.toISOString(),
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
