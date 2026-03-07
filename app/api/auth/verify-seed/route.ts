/**
 * Dev-only: verify that the seeded user exists and password matches.
 * GET /api/auth/verify-seed - returns { ok, user, message }.
 * Works with SQLite or Postgres.
 */
import { NextResponse } from "next/server";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";

const SEED_EMAIL = "admin@example.com";
const SEED_PASSWORD = "admin123";

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ ok: false, message: "Not available" }, { status: 404 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: SEED_EMAIL },
    });

    if (!user) {
      return NextResponse.json({
        ok: false,
        message: "Seeded user not found. Run: npm run dev:setup",
        user: null,
      });
    }

    const valid = await compare(SEED_PASSWORD, user.passwordHash);
    if (!valid) {
      return NextResponse.json({
        ok: false,
        message: "Password does not match. Re-run: npm run dev:setup",
        user: null,
      });
    }

    return NextResponse.json({
      ok: true,
      user: user.email,
      message: "Seeded user exists and password matches.",
    });
  } catch (e) {
    const rawMessage = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({
      ok: false,
      message: "Database error: " + rawMessage,
      user: null,
    });
  }
}
