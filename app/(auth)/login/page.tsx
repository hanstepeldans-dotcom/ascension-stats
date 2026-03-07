"use client";

import { Suspense, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import { LogoMark } from "@/components/brand/LogoMark";

function LoginForm() {
  const router = useRouter();
  const { status } = useSession();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next") ?? searchParams.get("callbackUrl") ?? "/dashboard";
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (status === "authenticated" && nextUrl) {
      router.replace(nextUrl);
    }
  }, [status, nextUrl, router]);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await signIn("credentials", {
        email: email.trim().toLowerCase(),
        password: password.trim(),
        redirect: false,
      });
      if (res?.error) {
        setError("Invalid email or password.");
        return;
      }
      router.push(nextUrl);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="glass-panel-strong glow-pink w-full max-w-md border-white/[0.08] bg-black/60 shadow-[0_0_0_1px_hsl(330_81%_60%_/_0.15)] backdrop-blur-xl">
          <CardHeader className="space-y-1 text-center">
            <Link href="/" className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-pink to-pink-muted text-white">
              <LogoMark className="h-5 w-5" />
            </Link>
            <CardTitle className="text-2xl font-bold text-white">Sign in</CardTitle>
            <CardDescription className="text-zinc-400">
              Ascension Stats — one dashboard for your analytics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="space-y-1">
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400" role="alert">
                    {error}
                  </div>
                  <p className="text-xs text-zinc-500">
                    Not set up yet? Run <code className="rounded bg-white/10 px-1">npm run dev:setup</code>. Check /api/auth/verify-seed.
                  </p>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-zinc-300">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  disabled={loading}
                  className="border-white/10 bg-white/5 text-white placeholder:text-zinc-500 focus-visible:ring-pink"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password" className="text-zinc-300">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    disabled={loading}
                    className="border-white/10 bg-white/5 pr-10 text-white placeholder:text-zinc-500 focus-visible:ring-pink"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-400"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <Button
                type="submit"
                className="btn-sheen w-full bg-gradient-to-r from-pink to-pink-muted text-white hover:opacity-95"
                disabled={loading}
              >
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <p className="mt-4 text-center text-xs text-zinc-500">
              Need an account? Run <code className="rounded bg-white/10 px-1">npm run dev:setup</code> (see README).
            </p>
            <p className="mt-2 text-center text-sm">
              <Link href="/" className="text-pink hover:underline">
                ← Back to home
              </Link>
            </p>
          </CardContent>
        </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-ascension">
        <span className="text-zinc-500">Loading…</span>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
