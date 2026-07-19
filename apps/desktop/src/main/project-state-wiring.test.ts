// Guard: project/settings orchestration must stay in the Electron-free factory.
// index.ts cannot be imported under bun:test because it requires Electron.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("./index.ts", import.meta.url), "utf8");

test("main constructs project state with only runtime-specific dependencies", () => {
  expect(mainSource).toMatch(
    /import \{[^}]*\bcreateProjectState\b[^}]*\} from ["']\.\/project-state["']/,
  );
  expect(mainSource).toMatch(
    /createProjectState\(\s*\{\s*readSettingsFile,\s*writeSettingsFile,\s*gameDir,\s*gameSlugs:\s*GAME_SLUGS,\s*pathExists:\s*fs\.existsSync,\s*\}\)/,
  );
});

test("main does not reimplement extracted project and settings orchestration", () => {
  for (const name of [
    "mergeSettings",
    "discoveredProjects",
    "allProjects",
    "listProjectState",
    "persistProjects",
    "resolveProjectTarget",
  ]) {
    expect(mainSource).not.toContain(`function ${name}(`);
  }
});

test("game-list and default-game handlers use the canonical project-state helpers", () => {
  for (const channel of [
    "studioListGames",
    "moodboardListGames",
    "labListGames",
    "mapsListGames",
  ]) {
    expect(mainSource).toContain(
      `ipcMain.handle(IPC_CHANNELS.${channel}, () => listGames())`,
    );
  }
  expect(mainSource).not.toContain(
    "listProjectState().projects.map((project) => project.slug)",
  );
  expect(mainSource).not.toContain("readSettings().defaultGame");
});
