import { _electron as electron, expect, test, type ElectronApplication, type Page } from "@playwright/test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DESKTOP_ROOT = path.resolve(__dirname, "..");

type FixtureProject = {
  id: string;
  name: string;
  slug: string;
  repoPath: string;
};

async function createProjectFixture(root: string, slug: string, name: string, id: string): Promise<FixtureProject> {
  const repoPath = path.join(root, slug);
  const assetsDir = path.join(repoPath, "src", "assets");
  await mkdir(assetsDir, { recursive: true });
  await writeFile(
    path.join(assetsDir, "assets.json"),
    JSON.stringify({
      assets: [
        {
          id: `${slug}-fixture-sprite`,
          kind: "sprite",
          game: slug,
          path: `sprites/${slug}-fixture-sprite.webp`,
        },
      ],
    }, null, 2),
  );
  return { id, name, slug, repoPath };
}

async function createStudioFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "shipshit-desktop-e2e-"));
  const userData = path.join(root, "user-data");
  await mkdir(userData, { recursive: true });

  const projects = [
    await createProjectFixture(root, "deadlane", "Fixture Deadlane", "fixture-deadlane"),
    await createProjectFixture(root, "pactfall", "Fixture Pactfall", "fixture-pactfall"),
  ];

  await writeFile(
    path.join(userData, "settings.json"),
    JSON.stringify({
      defaultProvider: "mock",
      defaultGame: "deadlane",
      activeProjectId: projects[0]!.id,
      projects,
    }, null, 2),
  );

  return { root, userData, projects };
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
    },
  });
  const page = await app.firstWindow();
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return { app, page, consoleErrors };
}

test("desktop studio boots, exposes the preload bridge, and switches fixture projects", async () => {
  const fixture = await createStudioFixture();
  let app: ElectronApplication | null = null;
  try {
    const launched = await launchStudio(fixture.userData);
    app = launched.app;
    const { page, consoleErrors } = launched;

    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".studio")).toBeVisible();
    await expect(page.getByText("SHIP SHIT")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Sprites" })).toBeVisible();

    const bridgeState = await page.evaluate(async () => {
      const studio = window.studio;
      return {
        hasBridge: !!studio,
        hasElectronVersion: !!studio?.versions?.electron,
        projects: studio?.projects ? await studio.projects.list() : null,
      };
    });
    expect(bridgeState.hasBridge).toBe(true);
    expect(bridgeState.hasElectronVersion).toBe(true);
    expect(bridgeState.projects?.projects.map((project) => project.name)).toEqual([
      "Fixture Deadlane",
      "Fixture Pactfall",
    ]);

    await expect(page.getByLabel("Game").first()).toContainText("Fixture Deadlane");

    await page.getByRole("button", { name: "Projects" }).click();
    await expect(page.getByRole("heading", { name: "Projects" })).toBeVisible();
    await expect(page.getByText("Fixture Deadlane")).toBeVisible();
    await expect(page.getByText("Fixture Pactfall")).toBeVisible();
    await expect(page.getByText("sprite:deadlane-fixture-sprite")).toBeVisible();

    const pactfallCard = page.locator(".project-card", { hasText: "Fixture Pactfall" });
    await pactfallCard.getByRole("button", { name: "Use" }).click();
    await expect(pactfallCard.getByRole("button", { name: "Active" })).toBeVisible();
    await expect(page.locator(".project-active-path")).toContainText("pactfall");

    expect(consoleErrors, `renderer console errors: ${consoleErrors.join(" | ")}`).toEqual([]);
  } finally {
    if (app) await app.close();
    await rm(fixture.root, { recursive: true, force: true });
  }
});
