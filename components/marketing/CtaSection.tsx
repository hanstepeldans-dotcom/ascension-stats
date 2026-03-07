"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function CtaSection() {
  const { data: session, status } = useSession();
  const dashboardHref = status === "authenticated" ? "/dashboard" : "/login";

  return (
    <section className="px-4 py-24 md:px-8 lg:px-12">
      <div className="mx-auto max-w-3xl rounded-2xl border border-white/[0.08] bg-white/[0.02] p-12 text-center md:p-16">
        <h2 className="text-3xl font-bold tracking-tight text-white md:text-4xl">
          Ready to ascend?
        </h2>
        <p className="mt-4 text-zinc-400">
          One dashboard for Infloww and Fanvue. Set up in minutes.
        </p>
        <div className="mt-8">
          <Button
            asChild
            size="lg"
            className="btn-sheen h-12 rounded-lg bg-gradient-to-r from-pink to-pink-muted px-8 text-base font-medium text-white hover:opacity-95"
          >
            <Link href={dashboardHref}>Open Dashboard</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
