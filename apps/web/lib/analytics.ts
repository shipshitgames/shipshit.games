"use client";

import posthog from "posthog-js";

/** Every custom event the site is allowed to emit. Keep this union tight. */
export type AnalyticsEventName =
  | "demo_click"
  | "pricing_cta_click"
  | "checkout_start"
  | "palette_open"
  | "konami";

/**
 * Boots PostHog on the client. Mounted from the root layout only in production
 * (gated on `process.env.VERCEL`, exactly like the Vercel Analytics mount it
 * replaces), so analytics never runs during local dev or e2e.
 *
 * `capture_pageview: "history_change"` makes PostHog track App Router soft
 * navigations via the History API, so no manual pathname tracker is needed.
 *
 * Safe to call repeatedly and from anywhere: it no-ops on the server, without a
 * `NEXT_PUBLIC_POSTHOG_KEY`, or if PostHog is already loaded. Returns whether
 * initialization actually ran (mainly so this stays unit-testable).
 */
export function initAnalytics(): boolean {
  if (typeof window === "undefined") return false;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || posthog.__loaded) return false;

  posthog.init(key, {
    api_host:
      process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    capture_pageview: "history_change",
    capture_pageleave: "if_capture_pageview",
    autocapture: true,
    person_profiles: "identified_only",
  });
  return true;
}

/**
 * Typed wrapper around PostHog `capture()`.
 *
 * This is the single call-site surface for product analytics — components import
 * `trackEvent`, never `posthog` directly, so the event vocabulary stays typed
 * and centralized.
 *
 * No-ops unless PostHog is actually running and never throws — analytics must
 * never break the page. PostHog only initializes in production (see
 * {@link file://./../components/site/posthog-analytics.tsx}), so
 * `posthog.__loaded` is the source of truth for "is analytics live": it is
 * false during local dev, e2e runs, and any environment without
 * `NEXT_PUBLIC_POSTHOG_KEY`, which keeps `trackEvent` a safe no-op there.
 */
export function trackEvent(
  name: AnalyticsEventName,
  props?: Record<string, string>
): void {
  if (typeof window === "undefined") return;
  if (!posthog.__loaded) return;
  try {
    posthog.capture(name, props);
  } catch {
    // Swallow — telemetry is best-effort only.
  }
}
