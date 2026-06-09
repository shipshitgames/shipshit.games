"use client";

import { track } from "@vercel/analytics";

/** Every custom event the site is allowed to emit. Keep this union tight. */
export type AnalyticsEventName =
  | "demo_click"
  | "pricing_cta_click"
  | "checkout_start"
  | "palette_open"
  | "konami";

/**
 * Typed wrapper around Vercel Analytics `track()`.
 *
 * No-ops outside production builds and never throws — analytics must never
 * break the page. `track()` itself is a safe no-op when the Analytics
 * script is not mounted (e.g. self-hosted / e2e runs).
 */
export function trackEvent(
  name: AnalyticsEventName,
  props?: Record<string, string>
): void {
  if (process.env.NODE_ENV !== "production") return;
  if (typeof window === "undefined") return;
  try {
    track(name, props);
  } catch {
    // Swallow — telemetry is best-effort only.
  }
}
