import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test("factions index lists the three factions and the Scourge threat card", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  const response = await page.goto("/factions", { waitUntil: "domcontentloaded" });
  expect(response, "no response for /factions").toBeTruthy();
  expect(response!.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { name: "The Pyre", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Wardens", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Listeners", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "The Scourge", exact: true })).toBeVisible();

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("the pyre dossier shows doctrine and roster", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  const response = await page.goto("/factions/the-pyre", { waitUntil: "domcontentloaded" });
  expect(response, "no response for /factions/the-pyre").toBeTruthy();
  expect(response!.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { level: 1, name: /the pyre/i })).toBeVisible();
  await expect(page.getByText(/burn the source/i).first()).toBeVisible();

  // At least 3 roster names from the lore characters.
  await expect(page.getByRole("heading", { name: "Ranger", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bulwark", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Vector", exact: true })).toBeVisible();

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("the scourge enemy page shows the bestiary", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  const response = await page.goto("/factions/scourge", { waitUntil: "domcontentloaded" });
  expect(response, "no response for /factions/scourge").toBeTruthy();
  expect(response!.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { level: 1, name: /the scourge/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Swarm Ripper" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Rot-Engine" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Breach-Boss" })).toBeVisible();

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});
