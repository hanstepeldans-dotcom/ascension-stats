"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Menu } from "lucide-react";
import { LogoMark } from "@/components/brand/LogoMark";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function Navbar() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);

  return (
    <header className="fixed left-0 right-0 top-0 z-50 border-b border-white/[0.08] bg-black/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink to-pink-muted text-white">
            <LogoMark className="h-4 w-4" />
          </span>
          <span className="font-semibold tracking-tight text-white">Ascension Stats</span>
        </Link>

        <div className="hidden items-center gap-3 md:flex">
          {status === "authenticated" ? (
            <Button asChild variant="ghost" size="sm" className="text-zinc-300 hover:text-white">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="text-zinc-300 hover:text-white">
                <Link href="/login">Login</Link>
              </Button>
              <Button
                asChild
                size="sm"
                className="btn-sheen bg-gradient-to-r from-pink to-pink-muted text-white hover:opacity-90"
              >
                <Link href="/login">Register</Link>
              </Button>
            </>
          )}
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="glass-panel-strong border-white/[0.08] bg-black/95">
            <SheetHeader>
              <SheetTitle className="text-left text-white">Menu</SheetTitle>
            </SheetHeader>
            <div className="mt-6 flex flex-col gap-2">
              {status === "authenticated" ? (
                <Button asChild variant="ghost" className="text-zinc-300">
                  <Link href="/dashboard" onClick={() => setOpen(false)}>
                    Dashboard
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild variant="outline" className="border-white/10">
                    <Link href="/login" onClick={() => setOpen(false)}>
                      Login
                    </Link>
                  </Button>
                  <Button asChild className="bg-pink hover:bg-pink/90">
                    <Link href="/login" onClick={() => setOpen(false)}>
                      Register
                    </Link>
                  </Button>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
