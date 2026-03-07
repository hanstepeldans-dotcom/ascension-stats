"use client";

import Image from "next/image";

/**
 * Ascension Stats logo mark (AM). Uses asset from public/logo.png.
 * Replace src or swap back to an inline SVG if you change the asset (single place change).
 */

interface LogoMarkProps {
  className?: string;
}

export function LogoMark({ className }: LogoMarkProps) {
  return (
    <Image
      src="/logo.png"
      alt=""
      width={96}
      height={96}
      className={className}
      style={{ objectFit: "contain" }}
    />
  );
}

export function LogoLockup({ className }: LogoMarkProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark className="h-6 w-6 shrink-0" />
      <span className="font-semibold tracking-tight">Ascension Stats</span>
    </span>
  );
}
