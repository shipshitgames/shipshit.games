// Gym checks (#305) end-to-end: boot a declared gym from the Gyms pane, let the
// main process drive it with the tester CLI (packages/tester), and assert the
// verdict the renderer shows — a real pass with report + screenshot, and a boot
// failure that is recorded but never validated.
import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");
const TESTER_GAME_HTML = path.resolve(DESKTOP_ROOT, "..", "..", "packages", "tester", "src", "fixtures", "game.html");

// Tiny static server for the fixture game: node server.mjs <port>. The gym
// declaration boots it as the gym command, the tester then drives its canvas.
const SERVER_MJS = `import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const port = Number(process.argv[2]);
const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "game", "index.html"));

createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(html);
}).listen(port, "127.0.0.1", () => {
  console.log("fixture game on http://127.0.0.1:" + port + "/");
});
`;

async function freePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (address && typeof address === "object") resolve(address.port);
        else reject(new Error("could not allocate a free port"));
      });
    });
  });
}

async function createGymFixture(gyms: unknown[]) {
  const root = await mkdtemp(path.join(tmpdir(), "shipshit-desktop-e2e-gym-"));
  const userData = path.join(root, "user-data");
  const repoPath = path.join(root, "fixture-game");
  await mkdir(userData, { recursive: true });
  await mkdir(path.join(repoPath, "game"), { recursive: true });

  // The real tester fixture game, not a divergent inline copy.
  await copyFile(TESTER_GAME_HTML, path.join(repoPath, "game", "index.html"));
  await writeFile(path.join(repoPath, "server.mjs"), SERVER_MJS);
  await writeFile(path.join(repoPath, "studio.gyms.json"), JSON.stringify({ gyms }, null, 2));

  await writeFile(
    path.join(userData, "settings.json"),
    JSON.stringify({
      defaultProvider: "mock",
      defaultGame: "fixture-game",
      activeProjectId: "fixture-game",
      projects: [{ id: "fixture-game", name: "Fixture Game", slug: "fixture-game", repoPath }],
    }, null, 2),
  );

  return { root, userData };
}

async function launchStudio(userData: string): Promise<{ app: ElectronApplication; page: Page; consoleErrors: string[] }> {
  const app = await electron.launch({
    args: [DESKTOP_ROOT],
    cwd: DESKTOP_ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
      SSG_DESKTOP_E2E_USER_DATA: userData,
      // CI runners ship Chrome but no Playwright browsers (apps/web precedent).
      SSG_TESTER_CHANNEL: process.env.CI ? "chrome" : "",
    },
  });
  const page = await app.firstWindow();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return { app, page, consoleErrors };
}

async function openGymsPane(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".studio")).toBeVisible();
  await page.getByRole("button", { name: "Gyms" }).click();
  await expect(page.locator(".gym-main")).toBeVisible();
}

test("gym check passes against the fixture game", async () => {
  // Boot + browser launch + observe window: give the whole pipeline real room.
  test.setTimeout(240_000);
  const port = await freePort();
  const fixture = await createGymFixture([
    {
      id: "playable",
      command: "node",
      args: ["server.mjs", String(port)],
      url: `http://127.0.0.1:${port}/`,
      tester: {
        ready: "flag:__GAME_READY__",
        canvas: "#scene",
        press: ["ArrowRight"],
        observeMs: 500,
        readyTimeoutMs: 20000,
        bootTimeoutMs: 45000,
      },
    },
  ]);
  let app: ElectronApplication | null = null;
  try {
    const launched = await launchStudio(fixture.userData);
    app = launched.app;
    const { page, consoleErrors } = launched;

    await openGymsPane(page);
    const card = page.locator(".gym-card", { hasText: "Playable" });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Check", exact: true }).click();

    const detail = page.locator(".gym-check-detail");
    await expect(detail).toBeVisible();
    await expect(detail.locator(".badge-success")).toHaveText("pass", { timeout: 150_000 });

    const report = detail.locator(".gym-check-report");
    await expect(report.locator(".gym-check-line", { hasText: "canvas" })).toContainText("canvas 480×320");
    const shot = report.locator("img.gym-check-shot").first();
    await expect(shot).toBeVisible({ timeout: 15_000 });
    const src = await shot.getAttribute("src");
    expect(src, "screenshot thumbnails render from gyms:checkImage data urls").toMatch(/^data:image\/png;base64,/);

    expect(consoleErrors, `renderer console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
  } finally {
    if (app) await app.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});

test("boot failure is recorded and never validated", async () => {
  test.setTimeout(120_000);
  const port = await freePort();
  const fixture = await createGymFixture([
    {
      id: "broken",
      command: "node",
      args: ["-e", "console.error('boot exploded'); process.exit(7)"],
      url: `http://127.0.0.1:${port}/`,
      tester: { bootTimeoutMs: 4000 },
    },
  ]);
  let app: ElectronApplication | null = null;
  try {
    const launched = await launchStudio(fixture.userData);
    app = launched.app;
    const { page } = launched;

    await openGymsPane(page);
    const card = page.locator(".gym-card", { hasText: "Broken" });
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Check", exact: true }).click();

    const detail = page.locator(".gym-check-detail");
    await expect(detail).toBeVisible();
    await expect(detail.locator(".badge-danger")).toHaveText("fail", { timeout: 60_000 });
    await expect(detail).toContainText(/boot exploded|exited with code 7/);
    await expect(page.locator(".gym-checks .badge-success")).toHaveCount(0);
  } finally {
    if (app) await app.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});
