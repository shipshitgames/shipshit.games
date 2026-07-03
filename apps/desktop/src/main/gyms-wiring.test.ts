// Guard: the Studio Gyms launcher (#83) must stay wired from the main-process
// launcher through preload. index.ts itself needs Electron, so assert source.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("./index.ts", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../preload/index.ts", import.meta.url), "utf8");

const GYM_CHANNELS = ["gyms:list", "gyms:launch"];

test("main constructs the gym launcher from the shared factory", () => {
  expect(mainSource).toMatch(/import \{[^}]*\bcreateGymLauncher\b[^}]*\} from ["']\.\/gyms["']/);
  expect(mainSource).toMatch(/createGymLauncher\(\s*\{/);
});

test("main handles every gyms:* channel the preload exposes", () => {
  for (const channel of GYM_CHANNELS) {
    expect(mainSource).toContain(`ipcMain.handle("${channel}"`);
    expect(preloadSource).toContain(`ipcRenderer.invoke("${channel}"`);
  }
});

test("preload exposes a gyms bridge", () => {
  expect(preloadSource).toMatch(/\bgyms:\s*\{/);
});
