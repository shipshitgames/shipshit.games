import { test, expect, type ConsoleMessage } from "@playwright/test";

test("command palette opens with Ctrl+K, filters, navigates, and closes", async ({
  page,
}) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Wait for hydration — the keyboard listener attaches client-side.
  await expect(page.locator("body")).toHaveAttribute("data-palette-ready", "true");

  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();

  // The cmdk input is autofocused — typing filters the list.
  await page.keyboard.type("scourge");
  const survivors = dialog.locator("[cmdk-item]", {
    hasText: "Scourge Survivors",
  });
  await expect(survivors).toBeVisible();
  await expect(
    dialog.locator("[cmdk-item]", { hasText: "Deadlane" })
  ).toBeHidden();

  // Make sure Scourge Survivors is the selected item, then press Enter on it.
  await survivors.hover();
  await expect(survivors).toHaveAttribute("data-selected", "true");
  await page.keyboard.press("Enter");
  await page.waitForURL("**/games/scourge-survivors");
  await expect(dialog).toBeHidden();

  // Escape closes a reopened palette.
  await page.keyboard.press("Control+k");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
});

test("sitemap.xml responds 200 and lists scourge-survivors", async ({
  request,
}) => {
  const response = await request.get("/sitemap.xml");
  expect(response.status()).toBe(200);
  const body = await response.text();
  expect(body).toContain("/games/scourge-survivors");
});

test("robots.txt responds 200", async ({ request }) => {
  const response = await request.get("/robots.txt");
  expect(response.status()).toBe(200);
});

test("konami code triggers the scourge takeover", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Wait for hydration — the keyboard listener attaches client-side.
  await expect(page.locator("body")).toHaveAttribute("data-konami-ready", "true");

  const sequence = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "KeyB",
    "KeyA",
  ];
  for (const key of sequence) {
    await page.keyboard.press(key);
  }

  const takeover = page.getByTestId("scourge-takeover");
  await expect(takeover).toBeVisible();
  await expect(takeover).toContainText(/the scourge sees you/i);
});

test("header nav exposes Build Log and Factions hrefs without navigating", async ({
  page,
}) => {
  // /log and /factions are other lanes' routes — assert hrefs only.
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const header = page.locator("header");

  const buildLog = header.getByRole("link", { name: "Build Log" });
  await expect(buildLog).toBeVisible();
  await expect(buildLog).toHaveAttribute("href", "/log");

  const factions = header.getByRole("link", { name: "Factions" });
  await expect(factions).toBeVisible();
  await expect(factions).toHaveAttribute("href", "/factions");
});

test("no console errors on /", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() === "error") errors.push(msg.text());
  });

  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(response).toBeTruthy();
  expect(response!.status()).toBeLessThan(400);

  expect(errors, `console errors on /: ${errors.join(" | ")}`).toEqual([]);
});
