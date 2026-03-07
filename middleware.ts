import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Only protect app-area routes. Root "/" and /login are public. /api/* is NOT in matcher so callback/start are never blocked.
const protectedPaths = ["/dashboard", "/infloww", "/fanvue", "/combined", "/members", "/settings"];

function isProtected(pathname: string): boolean {
  return protectedPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // Never redirect root — landing page is for everyone (logged-in or not).
  if (pathname === "/") return NextResponse.next();
  if (!isProtected(pathname)) return NextResponse.next();

  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const login = new URL("/login", request.url);
    login.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  // Only run middleware on app-area routes. "/" and "/login" are never matched.
  matcher: ["/dashboard", "/dashboard/:path*", "/infloww", "/infloww/:path*", "/fanvue", "/fanvue/:path*", "/combined", "/combined/:path*", "/members", "/members/:path*", "/settings", "/settings/:path*"],
};
