"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Illustration } from "./Illustration";

export function Hero() {
  const { data: session, status } = useSession();
  const dashboardHref = status === "authenticated" ? "/dashboard" : "/login";

  return (
    <section className="relative flex min-h-[90vh] flex-col items-center px-4 pt-24 pb-16 md:flex-row md:items-center md:gap-12 md:px-8 lg:gap-20 lg:px-12">
      <div className="flex flex-1 flex-col border-0 text-center md:max-w-xl md:text-left">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl lg:text-6xl">
          Ascension analytics{" "}
          <span className="gradient-text-pink">unified view.</span>
        </h1>
        <p className="mt-6 text-lg text-zinc-400">
          One dashboard for Infloww + Fanvue performance.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 md:justify-start">
          <Button
            asChild
            size="lg"
            className="btn-sheen h-12 rounded-lg bg-gradient-to-r from-pink to-pink-muted px-8 text-base font-medium text-white hover:opacity-95"
          >
            <Link href={dashboardHref}>Open Dashboard</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            size="lg"
            className="h-12 border-white/20 bg-white/5 px-8 text-base text-white hover:bg-white/10 hover:text-white"
          >
            <a href="#how-it-works">See how it works</a>
          </Button>
        </div>
      </div>
      <div className="relative mt-12 w-full flex-1 border-0 md:mt-0">
        <Illustration />
      </div>
    </section>
  );
}
