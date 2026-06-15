"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { isFeatureEnabled } from "@/lib/flags";

/**
 * Footer Studio Pass promo pill, gated on the PostHog `studio-pass-promo` flag.
 *
 * Demonstrates the runtime feature-flag seam end to end: the flag is evaluated
 * after mount (so server and first client render agree — no hydration
 * mismatch) and the element renders only when PostHog reports the flag on.
 * Defaults closed, so it is absent in dev/e2e where PostHog never initializes.
 */
export function FlaggedPromo() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    setEnabled(isFeatureEnabled("studio-pass-promo"));
  }, []);

  if (!enabled) return null;

  return (
    <Link
      href="/pricing"
      data-testid="flagged-promo"
      className="mt-6 inline-flex items-center gap-2 rounded-full border border-hellfire/60 bg-hellfire/10 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-widest text-hellfire transition-colors hover:border-hellfire hover:text-blood"
    >
      <span aria-hidden="true">★</span>
      Founder pricing — limited
    </Link>
  );
}
