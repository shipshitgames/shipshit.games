"use client";

import posthog from "posthog-js";

/**
 * Client-side feature flags backed by PostHog.
 *
 * This is the *runtime* flag seam: PostHog evaluates these per-visitor, so they
 * support percentage rollouts, A/B variants, and targeting from the PostHog UI
 * without a redeploy. It is deliberately separate from the build-time env seam
 * in `@shipshitgames/shared` (`isEnabled` / `FLAGS`), which gates whole code
 * paths "dark" on a plain env var. Rule of thumb: reach here when a human needs
 * to flip something at runtime or roll it out gradually; reach for the shared
 * env seam to merge unfinished work to trunk inert.
 *
 * All helpers fail closed and never throw: when PostHog is not running (local
 * dev, e2e, or any environment without `NEXT_PUBLIC_POSTHOG_KEY`) they return
 * the caller's fallback, so flagged UI defaults to its off state.
 */

/** Registered PostHog feature-flag keys. Add keys here so call sites stay typed. */
export type ClientFeatureFlag = "studio-pass-promo";

/** True only when PostHog has initialized in the browser. */
function analyticsReady(): boolean {
  return typeof window !== "undefined" && posthog.__loaded;
}

/**
 * Whether `flag` is enabled for the current visitor. Returns `fallback`
 * (default `false`) when PostHog is unavailable or the flag is undefined.
 */
export function isFeatureEnabled(
  flag: ClientFeatureFlag,
  fallback = false
): boolean {
  if (!analyticsReady()) return fallback;
  try {
    return posthog.isFeatureEnabled(flag) ?? fallback;
  } catch {
    return fallback;
  }
}

/**
 * The raw value of a (possibly multivariate) flag — `true`/`false` for boolean
 * flags or the variant string for multivariate ones. Returns `fallback`
 * (default `undefined`) when PostHog is unavailable.
 */
export function getFeatureFlag(
  flag: ClientFeatureFlag,
  fallback: boolean | string | undefined = undefined
): boolean | string | undefined {
  if (!analyticsReady()) return fallback;
  try {
    return posthog.getFeatureFlag(flag) ?? fallback;
  } catch {
    return fallback;
  }
}
