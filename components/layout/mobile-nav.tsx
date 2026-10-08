"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { LogoMark } from "@/components/brand/LogoMark";
import { cn } from "@/lib/utils";
import { navItems } from "./sidebar";

/**
 * Mobile navigation: a hamburger button (phones only) that opens a slide-in
 * drawer with the same nav items as the desktop sidebar. Closes on route change,
 * backdrop tap, or Escape.
 */
export function MobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll and allow Escape to close while the drawer is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-300 hover:bg-white/10 hover:text-white"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Portal to body so the Topbar's backdrop-blur (which turns `fixed` into a
          containing block) doesn't trap/clip the full-screen drawer. */}
      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          {/* Drawer */}
          <aside className="absolute left-0 top-0 flex h-full w-64 max-w-[80%] flex-col border-r border-white/[0.08] bg-black/95 backdrop-blur-xl">
            <div className="flex h-14 items-center justify-between border-b border-white/[0.08] px-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink to-pink-muted text-white">
                  <LogoMark className="h-4 w-4" />
                </span>
                <span className="font-semibold tracking-tight text-white">
                  Ascension Stats
                </span>
              </div>
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/10 hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex-1 space-y-0.5 p-2">
              {navItems.map(({ href, label, icon: Icon }) => {
                const isActive = pathname === href;
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-all duration-200",
                      isActive
                        ? "bg-pink/15 text-pink shadow-[inset_0_0_0_1px_rgba(236,72,153,0.2)]"
                        : "text-zinc-400 hover:bg-white/[0.06] hover:text-white"
                    )}
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                    {label}
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>,
        document.body
      )}
    </div>
  );
}
