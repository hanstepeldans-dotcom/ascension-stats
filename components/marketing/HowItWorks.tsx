"use client";

import { Plug2, LayoutDashboard, TrendingUp } from "lucide-react";

const steps = [
  {
    icon: Plug2,
    title: "Connect",
    description: "Link your Infloww and Fanvue accounts. We only read the stats you need.",
  },
  {
    icon: LayoutDashboard,
    title: "One dashboard",
    description: "See combined revenue, subscribers, and tips in a single view.",
  },
  {
    icon: TrendingUp,
    title: "Track growth",
    description: "Use trends and time ranges to understand performance across platforms.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 px-4 py-20 md:px-8 lg:px-12">
      <div className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-bold tracking-tight text-white md:text-4xl">
          How it works
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-center text-zinc-400">
          Three steps to a unified view of your creator analytics.
        </p>
        <div className="mt-16 flex flex-col gap-12 md:flex-row md:gap-8">
          {steps.map(({ icon: Icon, title, description }, i) => (
            <div key={title} className="flex flex-1 flex-col items-center text-center md:items-start md:text-left">
              <div className="flex h-14 w-14 items-center justify-center rounded-xl border border-white/10 bg-pink/10 text-pink">
                <Icon className="h-7 w-7" />
              </div>
              <span className="mt-4 text-sm font-medium text-pink">Step {i + 1}</span>
              <h3 className="mt-1 text-lg font-semibold text-white">{title}</h3>
              <p className="mt-2 text-sm text-zinc-400">{description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
