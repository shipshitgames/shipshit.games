import { test, expect, type ConsoleMessage } from "@playwright/test";

/**
 * The PostHog migration must stay invisible wherever analytics is not
 * configured: no script, no network to PostHog, no console noise, and the
 * flag-gated promo absent because the flag seam fails closed. e2e sets neither
 * VERCEL nor NEXT_PUBLIC_POSTHOG_KEY, so this is precisely that environment —
 * these tests guard that the integration introduces no production-only leakage.
 */
test("homepage loads without initializing PostHog", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  const posthogRequests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("posthog")) posthogRequests.push(req.url());
  });

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response).toBeTruthy();
  expect(response!.status()).toBeLessThan(400);

  // Wait for client hydration so any PostHog init effect would have fired.
  await expect(page.locator("body")).toHaveAttribute(
    "data-palette-ready",
    "true"
  );

  expect(
    posthogRequests,
    `unexpected PostHog requests: ${posthogRequests.join(" | ")}`
  ).toEqual([]);
  expect(errors, `console errors on /: ${errors.join(" | ")}`).toEqual([]);
});

test("flag-gated promo is absent when PostHog is not configured", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // The flag seam fails closed, so the promo never renders without PostHog.
  await expect(page.locator("body")).toHaveAttribute(
    "data-palette-ready",
    "true"
  );
  await expect(page.getByTestId("flagged-promo")).toHaveCount(0);
});
