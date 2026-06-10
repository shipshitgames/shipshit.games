import { test, expect, type ConsoleMessage } from "@playwright/test";

// Public, service-free routes. /pricing and /pricing/success need live Stripe
// and are covered by unit tests, so they are intentionally excluded here.
const PUBLIC_ROUTES = [
  "/",
  "/games",
  "/assets",
  "/youtube",
  "/legal",
  "/log",
  "/factions",
  "/factions/the-pyre",
];

for (const route of PUBLIC_ROUTES) {
  test(`public route ${route} renders without errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg: ConsoleMessage) => {
      if (msg.type() === "error") errors.push(msg.text());
    });

    const response = await page.goto(route, { waitUntil: "domcontentloaded" });
    expect(response, `no response for ${route}`).toBeTruthy();
    expect(response!.status(), `bad status for ${route}`).toBeLessThan(400);

    await expect(page).toHaveTitle(/Ship Shit Games/);
    // Real, non-empty content rendered.
    const bodyText = (await page.locator("body").innerText()).trim();
    expect(bodyText.length).toBeGreaterThan(50);

    expect(errors, `console errors on ${route}: ${errors.join(" | ")}`).toEqual([]);
  });
}

test("game gallery lists catalogue entries and links to detail pages", async ({ page }) => {
  await page.goto("/games", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: /scourge survivors/i }).first()).toBeVisible();
});

test("game detail page renders for a known slug", async ({ page }) => {
  const response = await page.goto("/games/scourge-survivors", { waitUntil: "domcontentloaded" });
  expect(response!.status()).toBeLessThan(400);
  await expect(page.getByText(/scourge survivors/i).first()).toBeVisible();
});

test("legal page surfaces privacy and AI-asset disclosures", async ({ page }) => {
  await page.goto("/legal", { waitUntil: "domcontentloaded" });
  await expect(page.getByText(/privacy/i).first()).toBeVisible();
  await expect(page.getByText(/AI-generated asset/i).first()).toBeVisible();
});
