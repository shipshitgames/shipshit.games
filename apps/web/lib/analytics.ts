"use client";

import posthog from "posthog-js";

/**
 * Every custom event the site is allowed to emit. Keep this union tight.
 *
 * These trace the stream → site → buy funnel (#32):
 * - `channel_click` / `video_click` — shipshitshow YouTube channel + video opens
 * - `newsletter_signup` — newsletter capture (carries a `status` prop)
 * - `community_click` — outbound community/social links
 * - `demo_click` → `pricing_cta_click` → `checkout_start` — gallery → demo → buy
 */
export type AnalyticsEventName =
  | "demo_click"
  | "pricing_cta_click"
  | "checkout_start"
  | "channel_click"
  | "video_click"
  | "newsletter_signup"
  | "community_click"
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
  // Lift any UTM/campaign params from the landing URL into super properties so
  // every funnel event downstream (notably `checkout_start`) carries stream→site
  // attribution. posthog-js sets `__loaded` synchronously inside `init`, so this
  // registers immediately.
  registerCampaignContext();
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
  recordDebugEvent(name, props);
  if (!posthog.__loaded) return;
  try {
    posthog.capture(name, props);
  } catch {
    // Swallow — telemetry is best-effort only.
  }
}

interface DebugAnalyticsWindow extends Window {
  __analyticsEvents?: { name: AnalyticsEventName; props?: Record<string, string> }[];
}

/**
 * Opt-in debug mirror: when `NEXT_PUBLIC_ANALYTICS_DEBUG === "1"`, every tracked
 * event is also pushed to `window.__analyticsEvents` — regardless of whether
 * PostHog is running and without any network call.
 *
 * This is the seam the e2e suite uses to observe the funnel: PostHog never
 * initializes outside production (no `VERCEL`, no key), so `posthog.capture`
 * stays a no-op in tests. The debug mirror gives Playwright a deterministic,
 * offline record of what fired. It is inert in normal builds because the flag
 * is unset, and it never throws.
 */
function recordDebugEvent(
  name: AnalyticsEventName,
  props?: Record<string, string>
): void {
  if (process.env.NEXT_PUBLIC_ANALYTICS_DEBUG !== "1") return;
  if (typeof window === "undefined") return;
  const w = window as DebugAnalyticsWindow;
  (w.__analyticsEvents ??= []).push({ name, props });
}

/** UTM + referral keys lifted from the landing URL into PostHog super properties. */
const CAMPAIGN_PARAM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "ref",
] as const;

/**
 * Pure parser: pulls the known campaign params out of a query string such as
 * `window.location.search`. Free of any PostHog or `window` dependency and
 * exported so the attribution logic stays unit-testable. Only the keys actually
 * present in the URL are returned.
 */
export function parseCampaignParams(search: string): Record<string, string> {
  const params = new URLSearchParams(search);
  const campaign: Record<string, string> = {};
  for (const key of CAMPAIGN_PARAM_KEYS) {
    const value = params.get(key);
    if (value) campaign[key] = value;
  }
  return campaign;
}

/**
 * Registers any UTM/campaign params from the current URL as PostHog super
 * properties, so they ride along on every subsequent funnel event — the
 * checkout-path attribution required by #32. Called once from
 * {@link initAnalytics}.
 *
 * No-ops (returning `false`) without PostHog, without a `window`, or when the
 * URL carries no campaign params. Never throws — attribution is best-effort.
 */
export function registerCampaignContext(
  search: string = typeof window === "undefined"
    ? ""
    : (window.location?.search ?? "")
): boolean {
  if (typeof window === "undefined" || !posthog.__loaded) return false;
  const campaign = parseCampaignParams(search);
  if (Object.keys(campaign).length === 0) return false;
  try {
    posthog.register(campaign);
    return true;
  } catch {
    return false;
  }
}
