"use client";

import { BarChart3, GitMerge, Shield, Zap, LayoutDashboard, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: LayoutDashboard,
    title: "Unified dashboard",
    description: "Infloww and Fanvue metrics in one place. Revenue, subscribers, tips at a glance.",
  },
  {
    icon: BarChart3,
    title: "Provider views",
    description: "Drill into each platform or see combined totals. Your data, your way.",
  },
  {
    icon: GitMerge,
    title: "Combined analytics",
    description: "Merged time series and aggregates so you can track growth across platforms.",
  },
  {
    icon: Zap,
    title: "Fast and simple",
    description: "Lightweight setup. SQLite for dev, optional Postgres when you scale.",
  },
  {
    icon: Shield,
    title: "Your data stays yours",
    description: "We don’t sell your data. Connect only what you need.",
  },
  {
    icon: Sparkles,
    title: "Built for creators",
    description: "Designed for agencies and creators who use Infloww and Fanvue.",
  },
];

export function FeatureGrid() {
  return (
    <section className="px-4 py-20 md:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl">
        <h2 className="text-center text-3xl font-bold tracking-tight text-white md:text-4xl">
          Everything you need
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-center text-zinc-400">
          One tool to see how you’re performing across Infloww and Fanvue.
        </p>
        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, description }) => (
            <Card
              key={title}
              className="glass-panel group border-white/[0.08] bg-white/[0.02] transition-all duration-300 hover:border-pink/20 hover:bg-white/[0.04] hover:shadow-[0_0_30px_-10px_rgba(236,72,153,0.2)]"
            >
              <CardContent className="p-6">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-pink/10 text-pink transition-colors group-hover:bg-pink/20">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold text-white">{title}</h3>
                <p className="mt-2 text-sm text-zinc-400">{description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
