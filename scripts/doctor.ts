/**
 * Check dev setup: .env, required vars, database connection, admin user.
 * Run: npm run dev:doctor
 * Never checks Docker or port 5432 (SQLite default, Docker optional).
 */
import path from "node:path";
import fs from "node:fs";
import { config } from "dotenv";

const cwd = process.cwd();
config({ path: path.resolve(cwd, ".env") });

const issues: string[] = [];
const fixes: string[] = [];

function ok(msg: string): void {
  console.log("  \x1b[32m✓\x1b[0m", msg);
}

function fail(msg: string, fix?: string): void {
  console.log("  \x1b[31m✗\x1b[0m", msg);
  issues.push(msg);
  if (fix) fixes.push(fix);
}

async function main(): Promise<void> {
  console.log("\n  Dev doctor\n");

  const envPath = path.join(cwd, ".env");

  if (!fs.existsSync(envPath)) {
    fail(".env not found", "cp .env.example .env");
  } else {
    ok(".env exists");
  }

  const hasDb = !!process.env.DATABASE_URL?.trim();
  const hasUrl = !!process.env.NEXTAUTH_URL?.trim();
  const hasSecret = !!process.env.NEXTAUTH_SECRET?.trim();

  if (!hasDb) fail("DATABASE_URL missing in .env", "Copy from .env.example");
  else ok("DATABASE_URL set");

  if (!hasUrl) fail("NEXTAUTH_URL missing in .env", "Copy from .env.example");
  else ok("NEXTAUTH_URL set");

  if (!hasSecret) fail("NEXTAUTH_SECRET missing in .env", "Copy from .env.example");
  else ok("NEXTAUTH_SECRET set");

  if (hasDb) {
    try {
      const { PrismaClient } = await import("@prisma/client");
      const prisma = new PrismaClient();
      await prisma.$connect();
      const user = await prisma.user.findUnique({ where: { email: "admin@example.com" } });
      await prisma.$disconnect();
      if (user) {
        ok("Admin user exists");
      } else {
        fail("Admin user missing", "npm run dev:setup");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      fail("Database: " + msg, "npm run dev:setup");
    }
  }

  console.log("");
  if (issues.length === 0) {
    console.log("  \x1b[32mOK — run npm run dev\x1b[0m\n");
    process.exit(0);
  }

  console.log("  Fix:\n");
  fixes.forEach((f) => console.log("    " + f + "\n"));
  process.exit(1);
}

main();
