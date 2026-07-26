import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests for the public Ship Shit Games site. Builds and serves the
 * Next.js app, then drives a real browser against the safe public routes
 * (pricing/checkout needs live Stripe and is covered by unit tests instead).
 *
 * Placeholder env mirrors CI so the production build succeeds without secrets.
 */
// Overridable so the suite can run beside a dev server already holding 3000 —
// without it, an unrelated `next dev` on the default port aborts the whole run
// at webServer startup before a single test executes. CI leaves it unset.
//
// Setting the override means "serve mine on this port", so it also turns off
// `reuseExistingServer`: with reuse left on, an override aimed at a port that
// something else already holds would silently test that unrelated app and
// report green. Failing on EADDRINUSE is the honest outcome. The default port
// keeps reuse, which is what makes a local re-run fast.
const portOverride = process.env.WEB_E2E_PORT;
const PORT = parsePort(portOverride);
const baseURL = `http://localhost:${PORT}`;

function parsePort(value: string | undefined): number {
  if (value === undefined) return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`WEB_E2E_PORT must be an integer between 1 and 65535, got ${JSON.stringify(value)}`);
  }
  return port;
}

const ciEnv = {
  NEXT_TELEMETRY_DISABLED: "1",
  // All content fetchers (github/youtube) serve committed snapshots — zero network in e2e.
  CONTENT_SNAPSHOT_ONLY: "1",
  // Mirror tracked events to window.__analyticsEvents so the funnel suite can
  // observe clicks offline — PostHog itself never initializes here (no key).
  NEXT_PUBLIC_ANALYTICS_DEBUG: "1",
  NEXT_PUBLIC_SITE_URL: baseURL,
  NEXT_PUBLIC_APP_URL: "http://localhost:3002",
  ACCESS_SIGNING_SECRET: "ci-access-signing-secret",
  STRIPE_SECRET_KEY: "sk_test_ci_placeholder",
  STRIPE_WEBHOOK_SECRET: "whsec_ci_placeholder",
  STRIPE_SKILLS_PRO_PRICE_ID: "price_ci_placeholder",
  STRIPE_STUDIO_PASS_PRICE_ID: "price_ci_placeholder",
};

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        // CI uses the runner's preinstalled Chrome: `playwright install` hung
        // indefinitely after the chromium download on GitHub runners (both via
        // bunx and npx). Local runs keep the bundled chromium.
        channel: process.env.CI ? "chrome" : undefined,
      },
    },
  ],
  webServer: {
    command: `bun run build && bun run start --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI && portOverride === undefined,
    timeout: 180_000,
    env: ciEnv,
  },
});
