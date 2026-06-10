import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Asset showcase: data-driven browser over the committed asset index with
 * filter pills and a native-<dialog> provenance lightbox. Console errors fail
 * the test (same pattern as smoke.spec.ts).
 */

/** Navigate to /assets, wait for the browser to hydrate, collect console errors. */
async function openAssets(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  await page.goto("/assets", { waitUntil: "domcontentloaded" });
  // Clicks before React hydration are lost — wait for the client signal.
  await expect(page.getByTestId("asset-browser")).toHaveAttribute("data-hydrated", "true");
  return errors;
}

test("asset grid renders the full index and kind pills filter it", async ({ page }) => {
  const errors = await openAssets(page);

  const cards = page.getByTestId("asset-card");
  const initialCount = await cards.count();
  expect(initialCount, "full index should render >50 cards").toBeGreaterThan(50);

  // Kind pill narrows the grid to portraits only.
  await page.getByRole("button", { name: /^Portraits/ }).click();
  await expect.poll(() => cards.count()).toBeLessThan(initialCount);
  expect(await cards.count()).toBeGreaterThan(0);

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("asset card opens the provenance lightbox and Esc closes it", async ({ page }) => {
  const errors = await openAssets(page);

  await page.getByTestId("asset-card").first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("asset-provenance")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("runtime sprite lightbox surfaces gpt-image-2 provenance", async ({ page }) => {
  const errors = await openAssets(page);

  await page.getByRole("button", { name: /^Runtime sprites/ }).click();
  // The Scourge Survivors melee host sprite carries gpt-image-2 provenance.
  await page
    .getByTestId("asset-card")
    .filter({ has: page.getByText("Enemy Melee", { exact: true }) })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page.getByTestId("asset-provenance")).toBeVisible();
  await expect(dialog.getByText("gpt-image-2")).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});
