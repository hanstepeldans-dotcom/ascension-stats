"use client";

import Image from "next/image";

export function Illustration() {
  return (
    <div className="relative flex h-full min-h-[320px] w-full items-center justify-center md:min-h-[400px]">
      {/* Glow layers (z-0) – extreme pulse from center behind badge */}
      <div className="relative overflow-visible" style={{ width: 0, height: 0, minWidth: 0, minHeight: 0 }}>
        {/* Outer halo – maximum spread */}
        <div
          className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full animate-pulse-glow md:h-[28rem] md:w-[28rem]"
          style={{
            filter: "blur(72px)",
            background: "radial-gradient(circle at center, hsl(330 81% 65% / 0.9) 0%, hsl(330 60% 50% / 0.55) 30%, hsl(330 50% 40% / 0.25) 55%, transparent 75%)",
          }}
        />
        {/* Mid glow – intense */}
        <div
          className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full animate-pulse-glow md:h-72 md:w-72"
          style={{
            filter: "blur(40px)",
            background: "radial-gradient(circle at center, hsl(330 81% 65% / 0.95) 0%, hsl(330 60% 50% / 0.7) 45%, transparent 70%)",
          }}
        />
        {/* Bright center core – hot spot behind logo */}
        <div
          className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full animate-pulse-glow md:h-32 md:w-32"
          style={{
            filter: "blur(24px)",
            background: "radial-gradient(circle at center, hsl(330 81% 80% / 1) 0%, hsl(330 81% 65% / 0.9) 35%, transparent 65%)",
          }}
        />
      </div>
      {/* Center logo badge (z-30): outer pulse ring (z-10) + inner circle logo container (z-20) */}
      <div className="absolute left-1/2 top-1/2 z-30 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center md:h-[100px] md:w-[100px]">
        <div className="absolute inset-0 z-10 rounded-full border-2 border-pink/40 animate-asc-pulse-ring" />
        <div className="relative z-20 h-[72px] w-[72px] overflow-hidden rounded-full border border-white/10 shadow-[0_0_30px_-5px_hsl(330_81%_60%_/_0.35)] backdrop-blur-sm md:h-24 md:w-24">
          <Image
            src="/logo.png"
            alt="Ascension Stats"
            fill
            sizes="(max-width: 768px) 72px, 96px"
            className="object-cover"
            priority
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%)",
            }}
          />
        </div>
      </div>
    </div>
  );
}
