"use client";

import { useEffect } from "react";

import { initAnalytics } from "@/lib/analytics";

/**
 * Client boundary that boots PostHog after mount. Mounted from the root layout
 * only in production (gated on `process.env.VERCEL`), so analytics never runs
 * during local dev or e2e.
 *
 * The init logic itself lives in {@link initAnalytics} so it stays unit-testable
 * without a DOM renderer; this component is just the effect that fires it.
 */
export function PostHogAnalytics() {
  useEffect(() => {
    initAnalytics();
  }, []);

  return null;
}
