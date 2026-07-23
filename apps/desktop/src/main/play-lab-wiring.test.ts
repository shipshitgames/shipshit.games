import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("./index.ts", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../preload/index.ts", import.meta.url), "utf8");
const appSource = await readFile(new URL("../renderer/App.tsx", import.meta.url), "utf8");

const CHANNEL_KEYS = ["playLabContext", "loreList", "loreRead"];

test("main constructs Play Lab and lore stores from the shared project registry", () => {
  expect(mainSource).toMatch(/createLoreVaultStore\(\s*\{\s*repos:\s*\(\)\s*=>\s*allProjects\(\)/);
  expect(mainSource).toMatch(/createPlayLabStore\(\s*\{/);
  expect(mainSource).toMatch(/projects:\s*\(\)\s*=>\s*allProjects\(\)/);
});

test("main and preload wire every Play Lab and lore channel", () => {
  for (const channelKey of CHANNEL_KEYS) {
    expect(mainSource).toContain(`ipcMain.handle(IPC_CHANNELS.${channelKey}`);
    expect(preloadSource).toContain(`ipcRenderer.invoke(IPC_CHANNELS.${channelKey}`);
  }
});

test("renderer exposes the Play Lab pane", () => {
  expect(appSource).toContain('import { PlayLabPane } from "./panes/PlayLabPane"');
  expect(appSource).toContain('"play-lab": PlayLabPane');
});
