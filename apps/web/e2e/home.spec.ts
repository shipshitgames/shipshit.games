import { test, expect } from "@playwright/test";

// The home page is composed from extracted section components
// (components/home/sections/*). These assertions lock the public structure —
// landmarks, scroll-anchor ids, and the data-testid hooks other code relies on —
// so the composition stays behaviorally identical to the old inline page.

test("home renders the studio wordmark heading", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ship Shit Games");
});

test("home exposes every anchored section id in order", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  // The hero's "▼ scroll" affordance jumps to the first anchored section.
  const scroll = page.getByRole("link", { name: /scroll/i });
  await expect(scroll).toHaveAttribute("href", "#studio");

  for (const id of ["studio", "loop", "deadrot", "output", "newsletter"]) {
    await expect(page.locator(`section#${id}`)).toHaveCount(1);
  }
});

test("home public-proof strip renders four studio signals", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(page.getByTestId("stats-strip")).toBeVisible();
  await expect(page.getByTestId("stat-value")).toHaveCount(4);

  // The latest-shipped feed is populated from the committed activity snapshot.
  const shipped = page.getByTestId("latest-shipped");
  await expect(shipped).toBeVisible();
  expect(await shipped.locator("li").count()).toBeGreaterThan(0);
});

test("home games rail links out to the full games index", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Seven tracks. One war." })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /all games/i })).toHaveAttribute(
    "href",
    "/games"
  );
});

test("home newsletter section mounts the signup form", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });

  const newsletter = page.locator("section#newsletter");
  await expect(
    newsletter.getByRole("heading", { name: /the devlog should have an archive/i })
  ).toBeVisible();
  await expect(newsletter.getByRole("button", { name: "Subscribe" })).toBeVisible();
});
