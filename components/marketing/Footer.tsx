"use client";

import Link from "next/link";
import { LogoMark } from "@/components/brand/LogoMark";

export function Footer() {
  return (
    <footer className="border-t border-white/[0.08] px-4 py-12 md:px-8 lg:px-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink to-pink-muted text-white">
            <LogoMark className="h-4 w-4" />
          </span>
          <span className="font-semibold text-white">Ascension Stats</span>
        </Link>
        <nav className="flex gap-8 text-sm text-zinc-400">
          <Link href="#how-it-works" className="hover:text-white">
            How it works
          </Link>
          <Link href="/login" className="hover:text-white">
            Login
          </Link>
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-6xl text-center text-xs text-zinc-500">
        Infloww and Fanvue are trademarks of their respective owners. Ascension Stats is not affiliated with them.
      </p>
    </footer>
  );
}
