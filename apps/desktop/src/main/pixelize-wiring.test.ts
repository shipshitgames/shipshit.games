// Guard: the Pixelize step (#66) must stay wired end-to-end. index.ts can't be
// imported here (it needs the Electron runtime) and the renderer talks to the main
// process only through the preload bridge, so assert the contract on source: main
// handles studio:pixelize via the shared arg builder, the preload exposes a matching
// `pixelize` API, and the renderer declares it + mounts the panel. Drift in any
// layer silently breaks the pane — this catches it.
import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

const mainSource = await readFile(new URL("./index.ts", import.meta.url), "utf8");
const preloadSource = await readFile(new URL("../preload/index.ts", import.meta.url), "utf8");
const rendererPanelSource = await readFile(new URL("../renderer/panes/PixelizePanel.tsx", import.meta.url), "utf8");
const rendererMountSource = await readFile(new URL("../renderer/panes/SpritesPane.tsx", import.meta.url), "utf8");
const rendererEntrySource = await readFile(new URL("../renderer/main.tsx", import.meta.url), "utf8");
const rendererBridgeSource = await readFile(new URL("../renderer/studio.d.ts", import.meta.url), "utf8");
const ipcContractSource = await readFile(new URL("../shared/ipc.ts", import.meta.url), "utf8");

test("main handles studio:pixelize through the shared, sharp-free arg builder", () => {
  expect(mainSource).toContain("ipcMain.handle(IPC_CHANNELS.studioPixelize");
  expect(mainSource).toMatch(/import \{[^}]*\bbuildPixelizeArgs\b[^}]*\} from ["']\.\/pixelize-args["']/);
  expect(mainSource).toMatch(/buildPixelizeArgs\(\s*\{/);
  // It must SHELL OUT to the assetgen CLI (one impl, two surfaces), never import
  // pixelize() — that would pull sharp (a native addon) into the Electron bundle.
  expect(mainSource).not.toMatch(/from ["'][^"']*assetgen\/src\/pixelize\.ts["']/);
});

test("preload exposes the pixelize bridge over the studio:pixelize channel", () => {
  expect(preloadSource).toMatch(/pixelize:\s*\(opts\)\s*=>\s*ipcRenderer\.invoke\(IPC_CHANNELS\.studioPixelize/);
});

test("renderer guards bridge startup, declares the pixelize API, and mounts the Pixelize panel", () => {
  expect(rendererEntrySource).toMatch(/\{\s*studio \? \(\s*<App \/>/);
  expect(rendererEntrySource).toContain('role="alert"');
  expect(rendererEntrySource).toContain("Studio bridge unavailable — restart the app.");
  expect(rendererBridgeSource).toMatch(/studio:\s*StudioApi/);
  expect(rendererBridgeSource).not.toMatch(/studio\?:\s*StudioApi/);
  expect(ipcContractSource).toMatch(/pixelize:\s*\(opts:\s*PixelizeOptions\)/);
  expect(rendererPanelSource).toMatch(/function PixelizePanel\(/);
  expect(rendererMountSource).toMatch(/<PixelizePanel[^>]*\bsource=/);
});
