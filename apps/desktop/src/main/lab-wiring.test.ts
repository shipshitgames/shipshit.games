// Guard: the Art Direction Lab (#82) must stay wired end-to-end. index.ts can't be
// imported here (it needs the Electron runtime) and the renderer talks to the main
// process only through the preload bridge, so assert the contract on source: the
// store is constructed, every lab:* channel is handled, and the preload exposes a
// matching `lab` API. Drift in either layer silently breaks the pane — this catches it.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("./index.ts", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../preload/index.ts", import.meta.url), "utf8");

const LAB_CHANNEL_KEYS = [
  "labListGames",
  "labGet",
  "labSetSubject",
  "labAddVariant",
  "labScoreVariant",
  "labTagVariant",
  "labAnnotateVariant",
  "labRemoveVariant",
  "labLockVariant",
  "labClearLock",
];

test("main constructs the art-lab store from the shared factory", () => {
  expect(mainSource).toMatch(/import \{[^}]*\bcreateArtLabStore\b[^}]*\} from ["']\.\/art-lab["']/);
  expect(mainSource).toMatch(/createArtLabStore\(\s*\{/);
  // Stored under the Studio's userData, like the moodboard — never inside a game repo.
  expect(mainSource).toMatch(/getPath\("userData"\),\s*"art-lab"/);
});

test("main handles every lab:* channel the preload exposes", () => {
  for (const channelKey of LAB_CHANNEL_KEYS) {
    expect(mainSource).toContain(`ipcMain.handle(IPC_CHANNELS.${channelKey}`);
    expect(preloadSource).toContain(`ipcRenderer.invoke(IPC_CHANNELS.${channelKey}`);
  }
});

test("preload exposes a lab bridge", () => {
  expect(preloadSource).toMatch(/\blab:\s*\{/);
});
