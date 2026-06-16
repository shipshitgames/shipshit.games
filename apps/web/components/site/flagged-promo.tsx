"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";

import { isFeatureEnabled, onFeatureFlagsChange } from "@/lib/flags";

/**
 * Footer Studio Pass promo pill, gated on the PostHog `studio-pass-promo` flag.
 *
 * Demonstrates the runtime feature-flag seam end to end. The flag is read
 * through `useSyncExternalStore`, so the server snapshot and first client render
 * agree on the off state (no hydration mismatch or post-paint flicker) and the
 * pill appears the moment PostHog reports the flag on — including when flags
 * resolve asynchronously after mount. Defaults closed, so it is absent in
 * dev/e2e where PostHog never initializes.
 */
export function FlaggedPromo() {
  const enabled = useSyncExternalStore(
    onFeatureFlagsChange,
    () => isFeatureEnabled("studio-pass-promo"),
    () => false
  );

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
