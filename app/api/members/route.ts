import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth/config";
import { prisma } from "@/lib/db";

const createMemberSchema = z.object({
  email: z.string().email("Invalid email").transform((s) => s.trim().toLowerCase()),
  password: z.string().min(8, "Password must be at least 8 characters").transform((s) => s.trim()),
  role: z.enum(["ADMIN", "MANAGER"]),
  name: z.string().optional().transform((s) => (s != null && s.trim() ? s.trim() : null)),
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;

/** GET /api/members – list members (email, role, createdAt). Requires auth. */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(users);
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Failed to list members" }, { status: 500 });
  }
}

/** POST /api/members – create a new member. Requires ADMIN. */
export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (process.env.NODE_ENV !== "production") {
    console.log("POST /api/members role:", session?.user?.role, "email:", session?.user?.email);
  }
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "You don't have permission" }, { status: 403 });
  }

  const body = await request.json();
  const parsed = createMemberSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { email, password, role, name } = parsed.data;

  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }

    const passwordHash = await hash(password, 12);
    const user = await prisma.user.create({
      data: { email, passwordHash, role, name: name ?? null },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
    return NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (e: unknown) {
    const isPrismaUnique = e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002";
    if (isPrismaUnique) {
      return NextResponse.json({ error: "Email already exists" }, { status: 409 });
    }
    console.error(e);
    return NextResponse.json({ error: "Failed to create member" }, { status: 500 });
  }
}

const deleteMemberSchema = z.object({
  id: z.string().min(1, "User id is required"),
});

/** DELETE /api/members?id=<userId> – delete a member. Requires ADMIN. Cannot delete self or last admin. */
export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "You don't have permission" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = deleteMemberSchema.safeParse({ id: searchParams.get("id") ?? "" });
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const { id } = parsed.data;

  if (id === session.user.id) {
    return NextResponse.json({ error: "You cannot delete yourself." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  });

  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  if (target.role === "ADMIN") {
    const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
    if (adminCount <= 1) {
      return NextResponse.json({ error: "You cannot delete the last admin." }, { status: 400 });
    }
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true, deletedId: id });
}
