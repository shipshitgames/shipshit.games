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

/**
 * Funnel observability (#32). PostHog never initializes here (no key), but the
 * site mirrors every tracked event to `window.__analyticsEvents` when
 * `NEXT_PUBLIC_ANALYTICS_DEBUG=1` — which playwright.config sets. These tests
 * drive real clicks and assert the funnel events fire with the right props.
 */
type AnalyticsEvent = { name: string; props?: Record<string, string> };

function readEvents(page: import("@playwright/test").Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __analyticsEvents?: AnalyticsEvent[] })
        .__analyticsEvents ?? []
  );
}

test.describe("funnel analytics", () => {
  // Cancel anchor navigation so a click fires React's onClick (and our tracker)
  // without leaving the page or opening a tab — the debug mirror lives on this
  // page's window. next/link bails out when the event is already defaultPrevented,
  // so internal links stay put too.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      document.addEventListener(
        "click",
        (event) => {
          const anchor = (event.target as Element | null)?.closest?.("a");
          if (anchor) event.preventDefault();
        },
        true
      );
    });
  });

  async function ready(page: import("@playwright/test").Page, path: string) {
    await page.goto(path, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute(
      "data-palette-ready",
      "true"
    );
  }

  test("home hero 'Buy Skills Pro' fires pricing_cta_click", async ({ page }) => {
    await ready(page, "/");
    await page
      .getByRole("link", { name: /buy skills pro/i })
      .first()
      .click();
    await expect.poll(() => readEvents(page)).toContainEqual({
      name: "pricing_cta_click",
      props: { location: "home_hero" },
    });
  });

  test("youtube page subscribe + latest video fire channel_click / video_click", async ({
    page,
  }) => {
    await ready(page, "/youtube");

    await page
      .getByRole("link", { name: /subscribe on youtube/i })
      .click();
    await expect.poll(() => readEvents(page)).toContainEqual({
      name: "channel_click",
      props: { location: "youtube_page", action: "subscribe" },
    });

    await page
      .getByTestId("latest-uploads")
      .getByRole("link")
      .first()
      .click();
    const events = await readEvents(page);
    expect(
      events.some(
        (e) =>
          e.name === "video_click" &&
          e.props?.location === "youtube_latest" &&
          typeof e.props?.videoId === "string"
      ),
      `events seen: ${JSON.stringify(events)}`
    ).toBe(true);
  });

  test("footer outbound links fire community_click / channel_click by platform", async ({
    page,
  }) => {
    await ready(page, "/");
    const footer = page.locator("footer");

    await footer.getByRole("link", { name: /github/i }).click();
    await footer.getByRole("link", { name: /shipshitshow/i }).click();

    await expect.poll(() => readEvents(page)).toEqual(
      expect.arrayContaining([
        {
          name: "community_click",
          props: { location: "footer", platform: "github" },
        },
        {
          name: "channel_click",
          props: { location: "footer", platform: "youtube" },
        },
      ])
    );
  });

  test("newsletter submit fires newsletter_signup tagged with the topic", async ({
    page,
  }) => {
    await ready(page, "/");
    const form = page.locator("#newsletter form");
    await form.getByPlaceholder("you@example.com").fill("ci@example.com");
    await form.getByRole("button", { name: /subscribe/i }).click();
    // No FORMSPREE_ID in e2e, so the submit takes the error branch and reports it.
    await expect.poll(() => readEvents(page)).toContainEqual({
      name: "newsletter_signup",
      props: { status: "error", topic: "newsletter" },
    });
  });
});
