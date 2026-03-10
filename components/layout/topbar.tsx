"use client";

import { signOut } from "next-auth/react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut } from "lucide-react";
import { FullscreenButton } from "@/components/ui/fullscreen-button";

interface TopbarProps {
  user?: { name?: string | null; email?: string | null } | null;
}

export function Topbar({ user }: TopbarProps) {
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <header className="flex h-14 items-center justify-between border-b border-white/[0.08] bg-black/40 px-4 backdrop-blur-xl">
      <div className="flex-1" />
      <FullscreenButton />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full text-zinc-400 hover:bg-white/10 hover:text-white"
          >
            <Avatar className="h-8 w-8 border border-white/10">
              <AvatarFallback className="bg-pink/20 text-xs text-pink">
                {initials}
              </AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="glass-panel-strong w-56 border-white/[0.08] bg-black/95"
        >
          <DropdownMenuItem disabled className="text-zinc-500">
            {user?.email ?? "Signed in"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-zinc-300 focus:bg-white/10 focus:text-white"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
