"use client";

import type { ReactNode } from "react";

import { trackEvent } from "@/lib/analytics";

/** External play link that reports the gallery→demo funnel step (#32). */
export function PlayBuildLink({
  href,
  game,
  className,
  children,
}: {
  href: string;
  game: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={className}
      onClick={() => trackEvent("demo_click", { game })}
    >
      {children}
    </a>
  );
}
