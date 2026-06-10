import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Lane B coverage: /log terminal feed, restructured home (real stats + games
 * rail), and the /youtube latest-uploads grid. e2e runs with
 * CONTENT_SNAPSHOT_ONLY=1, so every fetcher serves the committed snapshot
 * (live=false) — the /log snapshot notice must therefore be visible.
 */
function trackConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  return errors;
}

test("/log renders the grouped terminal feed from the snapshot", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  const response = await page.goto("/log", { waitUntil: "domcontentloaded" });
  expect(response, "no response for /log").toBeTruthy();
  expect(response!.status(), "bad status for /log").toBeLessThan(400);

  // At least one UTC day group header like "2026-06-09".
  const firstDay = page.getByTestId("log-day").first();
  await expect(firstDay).toBeVisible();
  await expect(firstDay).toHaveText(/^\d{4}-\d{2}-\d{2}$/);

  // At least one [PR] or [commit] row.
  const firstEvent = page.getByTestId("log-event").first();
  await expect(firstEvent).toBeVisible();
  await expect(firstEvent).toContainText(/\[(PR|commit)\]/);

  // Snapshot-only mode means live=false, so the notice must show.
  await expect(page.getByTestId("snapshot-notice")).toBeVisible();
  await expect(page.getByTestId("snapshot-notice")).toContainText(/snapshot from \d{4}-\d{2}-\d{2}/);

  expect(errors, `console errors on /log: ${errors.join(" | ")}`).toEqual([]);
});

test("home shows real stats and the seven-game rail", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response!.status(), "bad status for /").toBeLessThan(400);

  // Stats strip renders with at least one numeric value > 0.
  await expect(page.getByTestId("stats-strip")).toBeVisible();
  const firstStat = await page.getByTestId("stat-value").first().innerText();
  expect(Number(firstStat.replace(/[^\d]/g, ""))).toBeGreaterThan(0);

  // Latest shipped strip links to the full build log.
  await expect(page.getByTestId("latest-shipped")).toBeVisible();
  await expect(page.getByRole("link", { name: /full build log/i })).toBeVisible();

  // Games rail carries all 7 catalogue entries.
  await expect(page.getByTestId("games-rail")).toBeVisible();
  await expect(page.getByTestId("game-rail-card")).toHaveCount(7);

  expect(errors, `console errors on /: ${errors.join(" | ")}`).toEqual([]);
});

test("/youtube lists latest uploads with thumbnails", async ({ page }) => {
  const errors = trackConsoleErrors(page);

  const response = await page.goto("/youtube", { waitUntil: "domcontentloaded" });
  expect(response!.status(), "bad status for /youtube").toBeLessThan(400);

  await expect(page.getByRole("heading", { name: /latest uploads/i })).toBeVisible();
  const uploads = page.getByTestId("latest-uploads");
  await expect(uploads).toBeVisible();

  const thumbnails = uploads.locator("img[src*='i.ytimg.com']");
  expect(await thumbnails.count()).toBeGreaterThanOrEqual(1);

  expect(errors, `console errors on /youtube: ${errors.join(" | ")}`).toEqual([]);
});
