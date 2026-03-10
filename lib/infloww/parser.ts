/**
 * Infloww document parser.
 * Accepts CSV or XLSX uploads, detects column headers with flexible fuzzy
 * matching, and returns normalized rows ready to write to
 * InflowwCreatorDailyEarnings.
 *
 * ──────────────────────────────────────────────────────────────────────────────
 * NET vs GROSS CONSISTENCY RULE
 * ──────────────────────────────────────────────────────────────────────────────
 * Infloww exports typically include two kinds of monetary columns:
 *   • GROSS columns – what fans paid (Messages, Tips, Subscriptions, …)
 *   • NET columns   – what the agency actually receives (Net earnings / Agency net)
 *
 * All fields we store (total, messages, tips, subscriptions, …) MUST come from
 * the same earnings basis.  We normalise to GROSS:
 *   - "total" must map to a GROSS total column ("Total earnings", "Total", "Earnings")
 *     and NEVER to a "Net earnings" / "Agency net" column.
 *   - If no gross total column exists in the CSV, we compute total as the sum of
 *     the mapped gross component columns (messages + tips + subscriptions + …).
 *
 * The /net\s*earn/ pattern was previously in the `total` list and caused the
 * mismatch (total = agency net ≈ 7 % of gross while the other cards showed
 * the full gross amounts).  It has been removed.
 * ──────────────────────────────────────────────────────────────────────────────
 */

import * as XLSX from "xlsx";

export interface InflowwParsedRow {
  creatorName: string;
  date: Date;
  total: number;
  subscriptions: number;
  messages: number;
  tips: number;
  posts: number;
  referrals: number;
  streams: number;
  subscribers: number;
}

/** Full result of a parse call, including diagnostics. */
export interface InflowwParseResult {
  rows: InflowwParsedRow[];
  /** Raw CSV headers, in original order. */
  rawHeaders: string[];
  /** fieldKey → csvHeader that was used for each normalized field. */
  headerMapping: Partial<Record<FieldKey, string>>;
  /** Unrecognised CSV headers (not mapped to any field). */
  unmappedHeaders: string[];
  /** Human-readable warning messages (suspicious rows, missing columns, etc.). */
  warnings: string[];
  /**
   * First up to 5 data rows as raw header→value objects (the exact strings
   * from the CSV before any type coercion).  Used by the mapping-sample debug
   * endpoint to show what the source file actually contains.
   */
  firstRowsRaw: Record<string, string>[];
}

// ─── column-header matching ───────────────────────────────────────────────────

type FieldKey =
  | "creatorName"
  | "date"
  | "total"
  | "subscriptions"
  | "messages"
  | "tips"
  | "posts"
  | "referrals"
  | "streams"
  | "subscribers";

/**
 * Patterns are tested left-to-right against the lowercased+trimmed header string.
 * First match per field wins; a field is never assigned twice.
 *
 * ── Infloww "Creator Statistics Detail" column names (the source of truth) ──
 *   A  Date/Time Europe/Athens  → date
 *   B  Creator                  → creatorName
 *   C  Subscriptions Net        → subscriptions
 *   D  New subscriptions Net    → (ignored — new subs only, not total revenue)
 *   E  Recurring subscriptions Net → (ignored)
 *   F  Tips Net                 → tips
 *   G  Total earnings Net       → total
 *   H-O (Contribution %, OF ranking, Following, Fans with renew on,
 *         Renew on %, New fans, Active fans, Change in expired fan count) → ignored
 *   P  Message Net              → messages
 *   Q  Creator group            → (ignored)
 *   R-U avg metrics             → (ignored, except Active fans → subscribers)
 *
 * All monetary columns carry the "Net" suffix in this export.
 * Patterns must match "Subscriptions Net", "Tips Net", "Total earnings Net",
 * "Message Net" — NOT the bare column name.
 *
 * ORDERING RULES:
 * 1. `subscriptions` must match BEFORE "New subscriptions Net" / "Recurring
 *    subscriptions Net" are encountered.  The column order in the sheet (C before
 *    D/E) already guarantees this, but the anchor `/^subscriptions?\s*net$/i`
 *    makes it explicit.
 * 2. `total` now lists the exact Infloww header first for speed and clarity.
 * 3. /net\s*earn/i is ABSENT from `total` — a plain "Net earnings" column
 *    (agency commission) must not map to the gross-total field.
 */
const HEADER_PATTERNS: Record<FieldKey, RegExp[]> = {
  creatorName: [
    /^creator$/i,           // "Creator"  ← Infloww exact
    /^model$/i,
    /creator\s*name/i,
    /model\s*name/i,
    /^account$/i,
    /^page$/i,
    /^profile$/i,
  ],

  // "Date/Time Europe/Athens"  — \bdate\b matches the word "date" anywhere
  date: [/^date$/i, /\bdate\b/i, /period/i],

  // "Total earnings Net"  ← Infloww exact (column G)
  total: [
    /^total\s*earnings?\s*net$/i,   // exact Infloww header
    /total\s*earn/i,                 // "Total earnings", "Total earning"
    /^total$/i,                      // plain "Total"
    /gross\s*earn/i,
    /gross\s*total/i,
    /^earnings?$/i,
    /creator\s*earn/i,
    /revenue/i,
  ],

  // "Subscriptions Net"  ← Infloww exact (column C)
  // Anchor prevents matching "New subscriptions Net" or "Recurring subscriptions Net"
  subscriptions: [
    /^subscriptions?\s*net$/i,      // exact Infloww header
    /^subscriptions?$/i,
    /subscription\s*revenue/i,
    /subscription\s*earn/i,
    /renewal/i,
  ],

  // "Message Net"  ← Infloww exact (column P, singular "Message")
  messages: [
    /^messages?\s*net$/i,           // "Message Net" or "Messages Net"
    /^messages?$/i,
    /message\s*earn/i,
    /message\s*revenue/i,
    /^chat$/i,
    /\bdm\b/i,
  ],

  // "Tips Net"  ← Infloww exact (column F)
  tips: [
    /^tips?\s*net$/i,               // "Tips Net" or "Tip Net"
    /^tips?$/i,
    /tip\s*earn/i,
    /tip\s*revenue/i,
    /donation/i,
  ],

  posts: [
    /^posts?\s*net$/i,
    /^posts?$/i,
    /post\s*earn/i,
    /post\s*revenue/i,
    /^content$/i,
  ],

  referrals: [
    /^referrals?\s*net$/i,
    /^referrals?$/i,
    /referral\s*earn/i,
    /referral\s*revenue/i,
  ],

  streams: [
    /^streams?\s*net$/i,
    /^streams?$/i,
    /stream\s*earn/i,
    /stream\s*revenue/i,
    /^live$/i,
  ],

  // "Active fans"  ← Infloww column N — subscriber count
  // Placed after `subscriptions` to prevent any cross-match.
  subscribers: [
    /^active\s*fans?$/i,            // "Active fans"  ← Infloww exact
    /^subscribers?$/i,
    /subscriber\s*count/i,
    /total\s*fans?$/i,
    /^fans?$/i,
    /followers/i,
    /\bsubs\b/i,
  ],
};

/** Map raw header strings → { colIndex → FieldKey }. */
function mapHeaders(headers: string[]): Map<number, FieldKey> {
  const map = new Map<number, FieldKey>();
  const assigned = new Set<FieldKey>();

  headers.forEach((raw, idx) => {
    const h = raw.trim().toLowerCase();
    if (!h) return;
    for (const [field, patterns] of Object.entries(HEADER_PATTERNS) as [FieldKey, RegExp[]][]) {
      if (assigned.has(field)) continue;
      if (patterns.some((p) => p.test(h))) {
        map.set(idx, field);
        assigned.add(field);
        break;
      }
    }
  });

  return map;
}

// ─── value coercion ───────────────────────────────────────────────────────────

function toFloat(v: unknown): number {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v).replace(/[$,€£\s]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function toInt(v: unknown): number {
  return Math.round(toFloat(v));
}

/**
 * Parse a cell value into a UTC-midnight Date.
 *
 * - JS Date objects (from XLSX cellDates:true) → strip time.
 * - Excel serial numbers → decoded via SheetJS.
 * - ISO strings "YYYY-MM-DD[T …]" → date part only, no tz shift.
 * - Slash strings "D/M/YYYY" (EU) or "M/D/YYYY" → extracted.
 * - Falls back to today if nothing parses.
 */
function toDate(v: unknown): Date {
  if (!v) return today();
  if (v instanceof Date && !isNaN(v.getTime())) return utcMidnight(v);

  if (typeof v === "number") {
    try {
      const d = XLSX.SSF.parse_date_code(v);
      if (d) return new Date(Date.UTC(d.y, d.m - 1, d.d));
    } catch { /* ignore */ }
  }

  const s = String(v).trim();

  // ISO / ISO-datetime: YYYY-MM-DD — ignore any time / tz suffix.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3]));

  // EU slash: D/M/YYYY or DD/MM/YYYY
  const slash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) return new Date(Date.UTC(+slash[3], +slash[2] - 1, +slash[1]));

  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return utcMidnight(parsed);

  return today();
}

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function today(): Date {
  return utcMidnight(new Date());
}

// ─── main export ──────────────────────────────────────────────────────────────

/**
 * Parse an Infloww upload (Buffer of XLSX, XLS, or CSV) into normalized rows.
 *
 * Returns a full InflowwParseResult including:
 *  - rows             – normalized rows for DB upsert
 *  - rawHeaders       – original CSV column names
 *  - headerMapping    – which CSV column mapped to each field
 *  - unmappedHeaders  – columns that weren't recognized
 *  - warnings         – any anomalies found (suspicious net/gross mismatch, etc.)
 */
export function parseInflowwDocument(
  buffer: Buffer,
  fallbackCreatorName = "Unknown"
): InflowwParseResult {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });

  if (workbook.SheetNames.length === 0) {
    return { rows: [], rawHeaders: [], headerMapping: {}, unmappedHeaders: [], warnings: ["No sheets found in workbook."], firstRowsRaw: [] };
  }

  // Prefer the "Creator Statistics Detail" sheet (Infloww daily data).
  // Fall back to the last sheet, then the first sheet.
  const detailSheet =
    workbook.SheetNames.find((n) => /creator\s*statistics\s*detail/i.test(n)) ??
    workbook.SheetNames.find((n) => /detail/i.test(n)) ??
    workbook.SheetNames[workbook.SheetNames.length - 1];

  const sheetName = detailSheet ?? workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false, // formatted strings; toDate handles the parsing
  });

  if (aoa.length < 2) {
    return { rows: [], rawHeaders: [], headerMapping: {}, unmappedHeaders: [], warnings: ["File has fewer than 2 rows (no data after header)."], firstRowsRaw: [] };
  }

  // Find header row: first row (within first 5) with ≥1 recognised column.
  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, aoa.length); i++) {
    const candidate = (aoa[i] as unknown[]).map((c) => String(c ?? ""));
    if (mapHeaders(candidate).size >= 1) { headerRowIdx = i; break; }
  }

  const rawHeaderRow = (aoa[headerRowIdx] as unknown[]).map((c) => String(c ?? ""));
  const colMap = mapHeaders(rawHeaderRow);

  // Build human-readable header mapping: fieldKey → csvHeader
  const headerMapping: Partial<Record<FieldKey, string>> = {};
  for (const [idx, field] of colMap.entries()) {
    headerMapping[field] = rawHeaderRow[idx];
  }

  // Unmapped headers
  const mappedIdxs = new Set(colMap.keys());
  const unmappedHeaders = rawHeaderRow.filter((h, i) => h.trim() && !mappedIdxs.has(i));

  const hasDateCol = [...colMap.values()].includes("date");
  const hasTotalCol = [...colMap.values()].includes("total");

  // Collect first 5 data rows as raw header→value strings (before any coercion).
  const firstRowsRaw: Record<string, string>[] = [];
  for (let i = headerRowIdx + 1; i < Math.min(headerRowIdx + 6, aoa.length); i++) {
    const rawRow = aoa[i] as unknown[];
    if (rawRow.every((c) => c === "" || c === null || c === undefined)) continue;
    const obj: Record<string, string> = {};
    rawHeaderRow.forEach((h, idx) => {
      if (h.trim()) obj[h] = String(rawRow[idx] ?? "");
    });
    firstRowsRaw.push(obj);
  }

  const warnings: string[] = [];
  warnings.push(`Reading sheet: "${sheetName}" (available: ${workbook.SheetNames.map((n) => `"${n}"`).join(", ")})`);
  if (!hasDateCol) warnings.push("No date column detected — all rows will use today as date.");
  if (!hasTotalCol) warnings.push("No gross-total column detected — 'total' will be computed as sum of components.");
  if (unmappedHeaders.length > 0) warnings.push(`Unrecognised columns (not mapped): ${unmappedHeaders.join(", ")}`);

  // Helper to read a field value from a raw row
  const get = (row: unknown[], field: FieldKey): unknown => {
    for (const [idx, f] of colMap.entries()) {
      if (f === field) return row[idx];
    }
    return undefined;
  };

  const rows: InflowwParsedRow[] = [];
  let suspiciousCount = 0;

  for (let r = headerRowIdx + 1; r < aoa.length; r++) {
    const raw = aoa[r] as unknown[];

    // Skip visually empty rows
    if (raw.every((c) => c === "" || c === null || c === undefined)) continue;

    const creatorName = get(raw, "creatorName")
      ? String(get(raw, "creatorName")).trim() || fallbackCreatorName
      : fallbackCreatorName;

    const date = hasDateCol ? toDate(get(raw, "date")) : today();
    const subscriptions = toFloat(get(raw, "subscriptions"));
    const messages = toFloat(get(raw, "messages"));
    const tips = toFloat(get(raw, "tips"));
    const posts = toFloat(get(raw, "posts"));
    const referrals = toFloat(get(raw, "referrals"));
    const streams = toFloat(get(raw, "streams"));
    const subscribers = toInt(get(raw, "subscribers"));

    // Compute gross total: use mapped column if it exists and is credible.
    // A credible gross total must be ≥ each individual component.
    const components = subscriptions + messages + tips + posts + referrals + streams;
    let total = hasTotalCol ? toFloat(get(raw, "total")) : 0;

    const maxComponent = Math.max(subscriptions, messages, tips, posts, referrals, streams);
    if (hasTotalCol && total < maxComponent && maxComponent > 0) {
      // The mapped "total" column is less than a single component — strong sign
      // that it is a NET/agency column, not the gross total.
      suspiciousCount += 1;
      if (suspiciousCount <= 3) {
        warnings.push(
          `Row ${r}: mapped "total" (${total}) < max component (${maxComponent}) — ` +
          `column "${headerMapping.total}" looks like NET earnings, not gross total. ` +
          `Falling back to sum of components (${components.toFixed(2)}).`
        );
      }
      total = components;
    }

    // If no total column or total is still 0 but components exist, compute from sum.
    if (total === 0 && components > 0) {
      total = components;
    }

    // Skip entirely blank data rows
    if (
      !creatorName &&
      total === 0 && subscriptions === 0 && messages === 0 &&
      tips === 0 && posts === 0 && referrals === 0 && streams === 0
    ) continue;

    rows.push({ creatorName, date, total, subscriptions, messages, tips, posts, referrals, streams, subscribers });
  }

  if (suspiciousCount > 3) {
    warnings.push(`… and ${suspiciousCount - 3} more rows with the same suspicious total mapping.`);
  }

  return { rows, rawHeaders: rawHeaderRow, headerMapping, unmappedHeaders, warnings, firstRowsRaw };
}

// ─── header-inspection helper (used by upload ?inspect=1) ───────────────────

/** Lightweight header inspection — returns mapping without parsing all rows. */
export function inspectInflowwHeaders(buffer: Buffer): {
  rawHeaders: string[];
  mapping: Record<string, string | null>;
} {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  if (workbook.SheetNames.length === 0) return { rawHeaders: [], mapping: {} };

  const sheetName =
    workbook.SheetNames.find((n) => /creator\s*statistics\s*detail/i.test(n)) ??
    workbook.SheetNames.find((n) => /detail/i.test(n)) ??
    workbook.SheetNames[workbook.SheetNames.length - 1] ??
    workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const aoa: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });

  let headerRowIdx = 0;
  for (let i = 0; i < Math.min(5, aoa.length); i++) {
    const candidate = (aoa[i] as unknown[]).map((c) => String(c ?? ""));
    if (mapHeaders(candidate).size >= 1) { headerRowIdx = i; break; }
  }

  const rawHeaders = (aoa[headerRowIdx] as unknown[]).map((c) => String(c ?? ""));
  const colMap = mapHeaders(rawHeaders);
  const mapping: Record<string, string | null> = {};
  rawHeaders.forEach((h, idx) => { mapping[h] = colMap.get(idx) ?? null; });

  return { rawHeaders, mapping };
}
