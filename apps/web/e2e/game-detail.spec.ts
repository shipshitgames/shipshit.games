import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test("scourge survivors brief shows the lore-driven sections", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  const response = await page.goto("/games/scourge-survivors", { waitUntil: "domcontentloaded" });
  expect(response, "no response for /games/scourge-survivors").toBeTruthy();
  expect(response!.status()).toBeLessThan(400);

  // Hero with lore tagline + Play link-out to the canonical deadrot.com page.
  await expect(
    page.getByRole("heading", { level: 1, name: /scourge survivors/i }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /play on deadrot\.com/i })).toHaveAttribute(
    "href",
    "https://deadrot.com/scourge-survivors",
  );
  await expect(page.getByRole("heading", { name: /play the build, then inspect the work/i })).toBeVisible();
  await expect(page.getByText(/runtime code and shipped game assets stay in the Deadrot repo/i)).toBeVisible();
  await expect(page.getByRole("link", { name: /live vercel build/i })).toHaveAttribute(
    "href",
    "https://scourge-survivors.vercel.app",
  );
  await expect(page.getByRole("link", { name: /source repo/i })).toHaveAttribute(
    "href",
    /github\.com\/shipshitgames\/deadrot\.com\/tree\/develop\/apps\/games\/scourge-survivors/,
  );
  await expect(page.getByRole("link", { name: /skills library/i })).toHaveAttribute(
    "href",
    "https://github.com/shipshitgames/skills",
  );
  await expect(page.getByRole("link", { name: /built live on ship shit show/i })).toHaveAttribute(
    "href",
    "/youtube",
  );
  await expect(page.getByRole("link", { name: /finished gate/i })).toHaveAttribute(
    "href",
    "https://github.com/shipshitgames/deadrot.com/issues/242",
  );

  // Lore features grid.
  await expect(page.getByText("Survive, then go deeper")).toBeVisible();
  await expect(page.getByText("The loop IS the game")).toBeVisible();

  // Playable operators roster (eyebrow label + character cards).
  await expect(page.getByText("Playable operators", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Ranger", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Bulwark", exact: true })).toBeVisible();

  // Known threats bestiary.
  await expect(page.getByText("Known threats", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Swarm Ripper" })).toBeVisible();

  // Roadmap counts from the committed board snapshot.
  const counts = page.getByTestId("roadmap-counts");
  await expect(counts).toBeVisible();
  await expect(counts).toContainText("Backlog");
  await expect(counts).toContainText("In Progress");
  await expect(counts).toContainText("Human Review");
  await expect(counts).toContainText("Done");
  await expect(counts).toContainText("Deferred");
  await expect(counts.locator("span").first()).toHaveText(/^\d+$/);

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("warline brief (no lore entry) renders without errors", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  const response = await page.goto("/games/warline", { waitUntil: "domcontentloaded" });
  expect(response, "no response for /games/warline").toBeTruthy();
  expect(response!.status()).toBeLessThan(400);

  await expect(page.getByRole("heading", { level: 1, name: /warline/i })).toBeVisible();
  // Falls back to the shared summary when no lore exists.
  await expect(page.getByText(/persistent war board/i).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /live vercel build/i })).toHaveAttribute(
    "href",
    "https://warline-jet.vercel.app",
  );
  await expect(page.getByRole("link", { name: /finished gate/i })).toHaveAttribute(
    "href",
    "https://github.com/shipshitgames/deadrot.com/issues/248",
  );

  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});
