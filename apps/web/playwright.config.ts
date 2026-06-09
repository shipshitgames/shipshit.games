import { defineConfig, devices } from "@playwright/test";

/**
 * E2E smoke tests for the public Ship Shit Games site. Builds and serves the
 * Next.js app, then drives a real browser against the safe public routes
 * (pricing/checkout needs live Stripe and is covered by unit tests instead).
 *
 * Placeholder env mirrors CI so the production build succeeds without secrets.
 */
const PORT = 3000;
const baseURL = `http://localhost:${PORT}`;

const ciEnv = {
  NEXT_TELEMETRY_DISABLED: "1",
  // All content fetchers (github/youtube) serve committed snapshots — zero network in e2e.
  CONTENT_SNAPSHOT_ONLY: "1",
  NEXT_PUBLIC_SITE_URL: baseURL,
  NEXT_PUBLIC_APP_URL: "http://localhost:3002",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_ci_placeholder",
  CLERK_SECRET_KEY: "ci-clerk-secret-key",
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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "bun run build && bun run start",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: ciEnv,
  },
});
