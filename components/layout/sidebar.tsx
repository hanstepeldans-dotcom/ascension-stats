"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BarChart3,
  PieChart,
  Users,
  Settings,
} from "lucide-react";
import { LogoMark } from "@/components/brand/LogoMark";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/infloww", label: "Infloww", icon: BarChart3 },
  { href: "/fanvue", label: "Fanvue", icon: PieChart },
  { href: "/members", label: "Members", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-56 flex-col border-r border-white/[0.08] bg-black/40 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2 border-b border-white/[0.08] px-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pink to-pink-muted text-white">
          <LogoMark className="h-4 w-4" />
        </span>
        <Link href="/dashboard" className="font-semibold tracking-tight text-white">
          Ascension Stats
        </Link>
      </div>
      <nav className="flex-1 space-y-0.5 p-2">
        {navItems.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
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
  );
}
