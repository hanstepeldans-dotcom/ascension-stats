import path from "node:path";
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

// Load .env from project root so seed uses same DATABASE_URL as the app.
// When running "npm run prisma:seed", cwd is project root; when running via prisma db seed, __dirname is prisma/.
config({ path: path.resolve(process.cwd(), ".env") });

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_USER_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_USER_PASSWORD ?? "admin123";
  const name = process.env.SEED_USER_NAME ?? "Admin User";

  const passwordHash = await hash(password, 12);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, name, role: "ADMIN" },
    create: {
      email,
      name,
      passwordHash,
      role: "ADMIN",
    },
  });
  const refreshed = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, role: true },
  });
  const roleStr = refreshed?.role ?? "unknown";
  console.log("Seed complete.");
  console.log("User: %s", user.email);
  console.log("Password: %s", password);
  console.log("Seeded admin role: %s", roleStr);
  if (refreshed && String(refreshed.role).toUpperCase() !== "ADMIN") {
    await prisma.user.update({
      where: { id: user.id },
      data: { role: "ADMIN" },
    });
    console.log("Updated seeded user role to ADMIN.");
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
