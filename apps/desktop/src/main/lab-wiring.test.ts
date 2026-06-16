// Guard: the Art Direction Lab (#82) must stay wired end-to-end. index.ts can't be
// imported here (it needs the Electron runtime) and the renderer talks to the main
// process only through the preload bridge, so assert the contract on source: the
// store is constructed, every lab:* channel is handled, and the preload exposes a
// matching `lab` API. Drift in either layer silently breaks the pane — this catches it.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("./index.ts", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../preload/index.ts", import.meta.url), "utf8");

const LAB_CHANNELS = [
  "lab:listGames",
  "lab:get",
  "lab:setSubject",
  "lab:addVariant",
  "lab:scoreVariant",
  "lab:tagVariant",
  "lab:annotateVariant",
  "lab:removeVariant",
  "lab:lockVariant",
  "lab:clearLock",
];

test("main constructs the art-lab store from the shared factory", () => {
  expect(mainSource).toMatch(/import \{[^}]*\bcreateArtLabStore\b[^}]*\} from ["']\.\/art-lab["']/);
  expect(mainSource).toMatch(/createArtLabStore\(\s*\{/);
  // Stored under the Studio's userData, like the moodboard — never inside a game repo.
  expect(mainSource).toMatch(/getPath\("userData"\),\s*"art-lab"/);
});

test("main handles every lab:* channel the preload exposes", () => {
  for (const channel of LAB_CHANNELS) {
    expect(mainSource).toContain(`ipcMain.handle("${channel}"`);
    expect(preloadSource).toContain(`ipcRenderer.invoke("${channel}"`);
  }
});

test("preload exposes a lab bridge", () => {
  expect(preloadSource).toMatch(/\blab:\s*\{/);
});
