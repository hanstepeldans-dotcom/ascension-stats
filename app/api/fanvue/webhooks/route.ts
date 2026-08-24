export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

/**
 * Fanvue webhook receiver.
 *
 * Fanvue's app settings require an Endpoint URL, so this route exists to accept
 * those deliveries. It is intentionally inert: events are logged and acknowledged,
 * nothing is written to the database. Revenue still comes from the polling sync
 * (/api/fanvue/sync, /api/infloww/sync).
 *
 * Public by design — Fanvue calls it unauthenticated. Keep it side-effect free
 * until we verify Fanvue's signature scheme; anyone can POST here.
 *
 * GET is here so Fanvue's URL validation gets a 200.
 */

const MAX_LOGGED_BODY = 2000;

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "fanvue-webhooks" });
}

export async function POST(request: Request) {
  let raw = "";
  try {
    raw = await request.text();
  } catch {
    // fall through — still ack, Fanvue retries on non-2xx
  }

  let eventType: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { type?: string; event?: string };
    eventType = parsed.type ?? parsed.event;
  } catch {
    // non-JSON body — log as-is below
  }

  console.log(
    "[fanvue webhook]",
    eventType ?? "unknown event",
    raw.slice(0, MAX_LOGGED_BODY)
  );

  return NextResponse.json({ received: true });
}
