import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/auth/schemas";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        try {
          const user = await prisma.user.findUnique({
            where: { email: parsed.data.email },
          });
          if (!user) return null;

          const valid = await compare(parsed.data.password, user.passwordHash);
          if (!valid) return null;

          const roleRaw = String(user.role ?? "").toUpperCase();
          const role: "ADMIN" | "MANAGER" =
            roleRaw === "ADMIN" || roleRaw === "MANAGER" ? roleRaw : "MANAGER";

          return {
            id: user.id,
            email: user.email,
            name: user.name ?? undefined,
            role,
          };
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Database error";
          throw new Error(msg);
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email ?? undefined;
        token.name = user.name ?? undefined;
        token.role = (user as unknown as { role: "ADMIN" | "MANAGER" }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id ?? token.sub) as string;
        session.user.email = token.email as string;
        session.user.name = token.name as string | null;
        session.user.role = token.role as "ADMIN" | "MANAGER";
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
